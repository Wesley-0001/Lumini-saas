/* =============================================
   DAILY-ATTENDANCE-MODULE — Frequência da Equipe
   Regras de negócio:
     • SUPERVISOR: lança a frequência do dia. Após salvar, vira read-only
       (somente leitura) e exibe badge "Frequência Consolidada".
     • ADMIN / GERENTE: sempre podem retificar. Cada alteração feita por eles
       deixa a linha do colaborador marcada com "(editado)" para auditoria.
   Persistência: coleção `daily_attendance` (Firestore) — um documento por
   dia/equipe, com metadados de auditoria por linha (createdBy/updatedBy/role).
============================================= */

(function () {
  // ────────── Constantes ──────────
  const STATUS_OPTIONS = [
    { value: 'pending',          label: 'Não definido' },
    { value: 'presente',         label: 'Presente' },
    { value: 'falta',            label: 'Falta' },
    { value: 'folga',            label: 'Folga' },
    { value: 'turno_cancelado',  label: 'Turno cancelado' },
    { value: 'atestado',         label: 'Atestado' }
  ];

  const ABSENCE_HIGHLIGHT_THRESHOLD = 3; // faltas a partir desta quantidade marcam o dia no calendário

  // ────────── Estado em memória ──────────
  /**
   * @typedef {Object} DaRow
   * @property {string} employeeId
   * @property {string} name
   * @property {string} status
   * @property {string=} createdBy
   * @property {string=} createdRole
   * @property {string=} updatedBy
   * @property {string=} updatedRole
   * @property {boolean=} edited       // foi alterado por admin/gerente após criação
   * @property {boolean=} dirtyByMe    // alterado nesta sessão (ainda não salvo)
   */

  /** @type {{ teamId: string, dateStr: string, docExists: boolean, rows: DaRow[], priorRecords: any[] } | null} */
  let _state = null;

  /** Calendário */
  let _calSelected = null;       // YYYY-MM-DD
  let _calViewYear = null;
  let _calViewMonth0 = null;     // 0-11

  /** Cache do mês */
  /** @type {Map<string, Set<string>>} */
  const _monthDotsCache = new Map();
  /** @type {Map<string, Map<string, object>>} */
  const _monthSummaryCache = new Map();

  /** Edição destravada (Admin/Gerente após "Retificar") */
  let _editUnlocked = false;

  /** Equipe selecionada por Admin/Gerente */
  let _selectedTeamId = null;

  /** Perspectiva: diário vs consolidado */
  /** @type {'daily'|'consolidated'} */
  let _perspective = 'daily';

  /** Filtro de turno no consolidado */
  /** @type {'all'|'dia'|'noite'} */
  let _shiftFilter = 'all';

  /** Cache do consolidado por mês/equipe/filtro */
  /** @type {Map<string, { teamId: string, y: number, m0: number, shift: string, computedAt: number, payload: any }>} */
  const _consCache = new Map();

  // ────────── CSV (fallback primário durante indexação) ──────────
  /** @type {null | { loaded: boolean, loading: boolean, promise: Promise<any> | null, employees: any[] }} */
  let _csvCache = { loaded: false, loading: false, promise: null, employees: [] };

  // ────────── Utilitários ──────────
  function _role() {
    const u = window.currentUser;
    return u ? String(u.role || '').toLowerCase() : '';
  }
  function _isSupervisor() { return _role() === 'supervisor'; }
  function _isAdminOrManager() { const r = _role(); return r === 'admin' || r === 'manager'; }
  function _canAccessPage() { return _isSupervisor() || _isAdminOrManager(); }

  function _todayISO() { return new Date().toISOString().split('T')[0]; }
  function _pad2(n) { return String(n).padStart(2, '0'); }

  function _monthKey(teamId, y, m0) {
    return `${String(teamId || '').trim()}__${y}-${_pad2(m0 + 1)}`;
  }

  function _safeText(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _isFutureDate(dateStr) {
    const ds = String(dateStr || '').trim();
    return !!ds && ds > _todayISO();
  }
  function _isPastDate(dateStr) {
    const ds = String(dateStr || '').trim();
    return !!ds && ds < _todayISO();
  }

  function _prettyDateLongPt(dateStr) {
    try {
      const d = new Date(String(dateStr) + 'T12:00:00');
      const t = d.toLocaleDateString('pt-BR', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
      });
      return t ? (t.charAt(0).toUpperCase() + t.slice(1)) : String(dateStr);
    } catch { return String(dateStr); }
  }

  function _inferShift(e) {
    if (!e) return null;
    const explicit = String(e.shift || '').trim().toLowerCase();
    if (explicit === 'manha' || explicit === 'tarde' || explicit === 'noite') return explicit;
    const raw = String(e.rhHorario || e.horario || e.jornada || '').trim();
    if (!raw) return null;
    const m = raw.match(/(\d{1,2})\s*[:h]\s*(\d{2})?/i) || raw.match(/\b(\d{1,2})\b/);
    const h = m ? parseInt(m[1], 10) : NaN;
    if (!Number.isFinite(h)) return null;
    if (h < 12) return 'manha';
    if (h < 18) return 'tarde';
    return 'noite';
  }

  function _shiftLabel(key) {
    if (key === 'dia') return 'Dia';
    if (key === 'noite') return 'Noite';
    return 'Todos';
  }

  function _ptMonthYearTitle(y, m0) {
    const d = new Date(y, m0, 1);
    const t = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return t ? (t.charAt(0).toUpperCase() + t.slice(1)) : `${m0 + 1}/${y}`;
  }

  function _getGridStartDate(y, m0) {
    const first = new Date(y, m0, 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    start.setHours(12, 0, 0, 0);
    return start;
  }

  function _dateToISO(d) {
    return `${d.getFullYear()}-${_pad2(d.getMonth() + 1)}-${_pad2(d.getDate())}`;
  }

  function _shiftViewMonth(delta) {
    if (_calViewYear == null || _calViewMonth0 == null) return;
    let y = _calViewYear;
    let m = _calViewMonth0 + delta;
    while (m < 0) { m += 12; y -= 1; }
    while (m > 11) { m -= 12; y += 1; }
    _calViewYear = y;
    _calViewMonth0 = m;
  }

  function _normLeader(s) {
    if (typeof window._ntNormalizeLiderKey === 'function') {
      return window._ntNormalizeLiderKey(s);
    }
    return String(s == null ? '' : s)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toUpperCase();
  }

  function _parsePtBrDateToISO(s) {
    const raw = String(s == null ? '' : s).trim();
    if (!raw) return '';
    // aceita dd/mm/yyyy ou dd/mm/yy
    const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (!m) return '';
    const dd = String(parseInt(m[1], 10)).padStart(2, '0');
    const mm = String(parseInt(m[2], 10)).padStart(2, '0');
    let yy = parseInt(m[3], 10);
    if (!Number.isFinite(yy)) return '';
    if (yy < 100) yy = yy <= 30 ? 2000 + yy : 1900 + yy;
    return `${yy}-${mm}-${dd}`;
  }

  function _splitCsvLineSemi(line) {
    // CSV do RH é separado por ';' e pode conter aspas em alguns exports.
    const s = String(line || '');
    const out = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === '"') {
        if (inQ && s[i + 1] === '"') { cur += '"'; i++; continue; }
        inQ = !inQ; continue;
      }
      if (!inQ && ch === ';') { out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    out.push(cur);
    return out.map(x => String(x).trim());
  }

  function _csvRowToEmployee(row) {
    // Header do Rh.Lumini.csv:
    // MATRÍCULA;COLABORADOR;SITUAÇÃO;CARGO;LÍDER;ADMISSÃO;DIAS DE CONTRATO;DEMISSÃO;NASCIMENTO;EMAIL;;
    if (!row || row.length < 5) return null;
    const rhMatricula = String(row[0] || '').trim();
    const name = String(row[1] || '').trim();
    const rhSituacao = String(row[2] || '').trim(); // aqui é "CLT"/etc (não confundir com ATIVO/DESLIGADO)
    const currentRole = String(row[3] || '').trim();
    const rhLider = String(row[4] || '').trim();
    if (!rhMatricula || !name) return null;
    const admission = _parsePtBrDateToISO(row[5] || '');
    const rhDiasContrato = Number(String(row[6] || '').replace(/[^\d]/g, '')) || 0;
    const rhDemissao = _parsePtBrDateToISO(row[7] || '');
    const rhNascimento = _parsePtBrDateToISO(row[8] || '');
    const email = String(row[9] || '').trim();

    const supervisor = _normLeader(rhLider);
    const id = String(rhMatricula);

    return {
      id,
      name,
      currentRole,
      supervisor,      // chave normalizada para filtros internos (equipes)
      rhMatricula,
      rhSituacao,
      rhLider,         // rótulo original (human-readable)
      admission,
      rhDiasContrato,
      rhDemissao,
      rhNascimento,
      email,
      rhHorario: '',
      rhJornada: ''
    };
  }

  async function _ensureEmployeesFromCsvLoaded() {
    if (_csvCache && _csvCache.loaded) return _csvCache.employees || [];
    if (_csvCache && _csvCache.loading && _csvCache.promise) return await _csvCache.promise;
    _csvCache.loading = true;
    _csvCache.promise = (async () => {
      try {
        const res = await fetch('Rh.Lumini.csv', { cache: 'no-store' });
        if (!res.ok) throw new Error(`Falha ao carregar CSV (${res.status})`);
        const text = await res.text();
        const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        if (!lines.length) throw new Error('CSV vazio');
        const dataLines = lines.slice(1); // ignora header
        const employees = [];
        for (const ln of dataLines) {
          const cols = _splitCsvLineSemi(ln);
          // linha vazia (só separadores) → ignora
          if (!cols.some(c => c && c !== '')) continue;
          const emp = _csvRowToEmployee(cols);
          if (emp) employees.push(emp);
        }
        _csvCache.employees = employees;
        _csvCache.loaded = true;
        return employees;
      } finally {
        _csvCache.loading = false;
      }
    })();
    return await _csvCache.promise;
  }

  function _allEmployees() {
    const emps = window.getEmployees ? window.getEmployees() : [];
    if (Array.isArray(emps) && emps.length) return emps;
    // fallback sync: retorna o que já carregamos do CSV (pode estar vazio enquanto carrega)
    return (_csvCache && Array.isArray(_csvCache.employees) ? _csvCache.employees : []);
  }

  function _uniqueLeadersFromEmployees() {
    const map = new Map();
    _allEmployees().forEach(e => {
      const key = _normLeader(e.supervisor || e.rhLider || '');
      if (!key) return;
      const label = String(e.rhLider || '').trim() || key;
      if (!map.has(key)) map.set(key, label);
    });
    return Array.from(map.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR', { sensitivity: 'base' }));
  }

  function _leaderLabelForTeamKey(teamKey) {
    const k = String(teamKey || '').trim();
    if (!k) return '';
    const nk = _normLeader(k);
    const hit = _allEmployees().find(e => _normLeader(e.supervisor || e.rhLider || '') === nk && e.rhLider);
    return hit ? String(hit.rhLider).trim() : k;
  }

  function _supervisorTeamKeyForCurrentUser() {
    const u = window.currentUser;
    if (!u) return '';
    const keys = new Set(_uniqueLeadersFromEmployees().map(x => x.key));
    const tryMatch = raw => {
      const key = _normLeader(raw);
      return key && keys.has(key) ? key : '';
    };
    let hit = tryMatch(u.name);
    if (hit) return hit;
    const local = String(u.email || '').split('@')[0] || '';
    hit = tryMatch(local);
    if (hit) return hit;
    hit = tryMatch(local.replace(/[._-]/g, ' '));
    return hit || '';
  }

  // ────────── Equipe & contexto ──────────
  function _activeTeamId() {
    if (_isSupervisor()) {
      return _supervisorTeamKeyForCurrentUser();
    }
    return _selectedTeamId ? String(_selectedTeamId).trim() : '';
  }

  function _getTeamFor(teamId) {
    const tid = _normLeader(teamId || '');
    if (!tid) return [];
    return _allEmployees()
      .filter(e => _normLeader(e.supervisor || e.rhLider || '') === tid)
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'));
  }

  // ────────── Calendário: fetch de pontos/resumos ──────────
  async function _ensureDotsForViewMonth() {
    const cal = document.getElementById('da-calendar');
    if (!cal) return new Set();
    const teamId = _activeTeamId();
    if (!teamId || _calViewYear == null || _calViewMonth0 == null) return new Set();

    const key = _monthKey(teamId, _calViewYear, _calViewMonth0);
    if (_monthDotsCache.has(key)) return _monthDotsCache.get(key);

    const lastDay = new Date(_calViewYear, _calViewMonth0 + 1, 0).getDate();
    const startDate = `${_calViewYear}-${_pad2(_calViewMonth0 + 1)}-01`;
    const endDate = `${_calViewYear}-${_pad2(_calViewMonth0 + 1)}-${_pad2(lastDay)}`;

    try {
      if (typeof window._ntListDailyAttendanceDatesForTeam === 'function') {
        const dates = await window._ntListDailyAttendanceDatesForTeam({ teamId, startDate, endDate });
        const set = dates instanceof Set ? dates : new Set(Array.isArray(dates) ? dates : []);
        _monthDotsCache.set(key, set);
        return set;
      }
    } catch (e) {
      console.warn('[daily-attendance calendar] dots', e);
    }
    const empty = new Set();
    _monthDotsCache.set(key, empty);
    return empty;
  }

  async function _ensureSummariesForViewMonth() {
    const cal = document.getElementById('da-calendar');
    if (!cal) return new Map();
    const teamId = _activeTeamId();
    if (!teamId || _calViewYear == null || _calViewMonth0 == null) return new Map();

    const key = _monthKey(teamId, _calViewYear, _calViewMonth0);
    if (_monthSummaryCache.has(key)) return _monthSummaryCache.get(key);

    const lastDay = new Date(_calViewYear, _calViewMonth0 + 1, 0).getDate();
    const startDate = `${_calViewYear}-${_pad2(_calViewMonth0 + 1)}-01`;
    const endDate = `${_calViewYear}-${_pad2(_calViewMonth0 + 1)}-${_pad2(lastDay)}`;

    try {
      if (typeof window._ntGetDailyAttendanceSummariesForTeam === 'function') {
        const m = await window._ntGetDailyAttendanceSummariesForTeam({ teamId, startDate, endDate });
        const map = m instanceof Map ? m : new Map();
        _monthSummaryCache.set(key, map);
        return map;
      }
    } catch (e) {
      console.warn('[daily-attendance calendar] summaries', e);
    }
    const empty = new Map();
    _monthSummaryCache.set(key, empty);
    return empty;
  }

  // ────────── Render do calendário ──────────
  function _renderCalendarSkeleton() {
    const cal = document.getElementById('da-calendar');
    if (!cal) return;
    cal.innerHTML = `
      <div class="da-cal-card" role="region" aria-label="Calendário de frequência">
        <div class="da-cal-head">
          <button type="button" class="da-cal-nav" data-da-cal-nav="-1" aria-label="Mês anterior">
            <i class="fas fa-chevron-left" aria-hidden="true"></i>
          </button>
          <div class="da-cal-title" id="da-cal-title">—</div>
          <button type="button" class="da-cal-nav" data-da-cal-nav="1" aria-label="Próximo mês">
            <i class="fas fa-chevron-right" aria-hidden="true"></i>
          </button>
        </div>
        <div class="da-cal-weekdays" aria-hidden="true">
          <div>D</div><div>S</div><div>T</div><div>Q</div><div>Q</div><div>S</div><div>S</div>
        </div>
        <div class="da-cal-grid" id="da-cal-grid" role="grid" aria-labelledby="da-cal-title"></div>
        <div class="da-cal-popover" id="da-cal-popover" hidden role="status" aria-live="polite"></div>
      </div>
    `;
  }

  async function _renderCalendar() {
    const cal = document.getElementById('da-calendar');
    const grid = document.getElementById('da-cal-grid');
    const title = document.getElementById('da-cal-title');
    if (!cal) return;
    if (!grid || !title) {
      _renderCalendarSkeleton();
      return _renderCalendar();
    }

    if (_calViewYear == null || _calViewMonth0 == null) {
      const now = new Date();
      _calViewYear = now.getFullYear();
      _calViewMonth0 = now.getMonth();
    }
    title.textContent = _ptMonthYearTitle(_calViewYear, _calViewMonth0);

    const dots = await _ensureDotsForViewMonth();
    const summaries = await _ensureSummariesForViewMonth();
    const team = _getTeamFor(_activeTeamId());
    const nameById = {};
    team.forEach(e => { if (e && e.id) nameById[String(e.id)] = e.name || '—'; });
    // Fallback: nomes vindos de qualquer colaborador (caso admin/gerente sem team selecionado)
    if (_isAdminOrManager()) {
      _allEmployees().forEach(e => { if (e && e.id && !nameById[String(e.id)]) nameById[String(e.id)] = e.name || '—'; });
    }

    const start = _getGridStartDate(_calViewYear, _calViewMonth0);
    const todayStr = _todayISO();
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const iso = _dateToISO(d);
      const inMonth = d.getFullYear() === _calViewYear && d.getMonth() === _calViewMonth0;
      const isSelected = _calSelected === iso;
      const isToday = iso === todayStr;
      const hasDot = inMonth && dots && dots.has(iso);
      const sum = inMonth && summaries && summaries.has(iso) ? summaries.get(iso) : null;
      const presentes = sum ? (Number(sum.presentes) || 0) : 0;
      const faltas = sum ? (Number(sum.faltas) || 0) : 0;
      const atestados = sum ? (Number(sum.atestados) || 0) : 0;
      const denom = presentes + faltas;
      const perf = denom > 0 ? (presentes / denom) : null;
      const isLow = perf != null && perf < 0.8;
      // Heatmap UX Elite: borda inferior vermelha em dias com muitas faltas (Admin/Gerente)
      const isHighAbsence = !!sum && faltas >= ABSENCE_HIGHLIGHT_THRESHOLD;
      const showHighAbsence = isHighAbsence && _isAdminOrManager();
      const hasAdminEdits = !!(sum && sum.hasAdminEdits);
      const topAbs = sum && Array.isArray(sum.faltantes)
        ? sum.faltantes.slice(0, 3).map(id => ({ id, name: nameById[String(id)] || '—' }))
        : [];
      cells.push({
        iso, day: d.getDate(), inMonth, isSelected, isToday, hasDot, isLow,
        showHighAbsence, hasAdminEdits, sum, topAbs, atestados
      });
    }

    grid.innerHTML = cells
      .map(c => {
        const cls = [
          'da-cal-cell',
          c.inMonth ? 'is-in' : 'is-out',
          c.isSelected ? 'is-selected' : '',
          c.isToday ? 'is-today' : '',
          c.hasDot ? 'has-dot' : '',
          c.isLow ? 'is-low' : '',
          c.showHighAbsence ? 'is-high-absence' : '',
          c.hasAdminEdits ? 'has-admin-edits' : ''
        ].filter(Boolean).join(' ');
        const aria = new Date(c.iso + 'T12:00:00').toLocaleDateString('pt-BR', {
          day: 'numeric', month: 'long', year: 'numeric'
        });
        const pop = c.sum
          ? _safeText(JSON.stringify({
              presentes: Number(c.sum.presentes) || 0,
              faltas: Number(c.sum.faltas) || 0,
              atestados: Number(c.atestados) || 0,
              top: (c.topAbs || []).map(x => x.name),
              hasAdminEdits: !!c.hasAdminEdits
            }))
          : '';
        return `
          <button type="button"
            class="${cls}"
            data-da-cal-day="${c.iso}"
            ${c.sum ? `data-da-cal-pop="${pop}"` : ''}
            aria-label="${aria}">
            <span class="da-cal-daynum">${c.day}</span>
            <span class="da-cal-dot" aria-hidden="true"></span>
          </button>
        `;
      })
      .join('');
  }

  // ────────── Sincronização de seleção ──────────
  function _syncSelectedToInput() {
    const dateInput = document.getElementById('da-attendance-date');
    if (dateInput && _calSelected) dateInput.value = _calSelected;
  }

  function _setSelectedDate(dateStr, opts = { silent: false }) {
    const ds = String(dateStr || '').trim();
    if (!ds) return;
    if (_calSelected === ds && opts && opts.silent === false) return;
    _calSelected = ds;
    _editUnlocked = false; // reset trava de edição ao trocar de dia
    _syncSelectedToInput();
    _renderCalendar();
    if (!opts || opts.silent !== true) {
      requestAnimationFrame(() => _loadFromFirestore(ds));
    }
    if (_perspective === 'consolidated') {
      requestAnimationFrame(() => _renderConsolidatedForCurrentMonth({ force: false }));
    }
  }

  // ────────── Visibilidade dos painéis ──────────
  function _setDashboardVisible(on) {
    _animateToggle('da-dashboard', !!on);
    if (on) _setFutureVisible(false);
  }
  function _setFutureVisible(on) {
    _animateToggle('da-future', !!on);
    if (on) _setDashboardVisible(false);
  }
  function _setEditVisible(on) {
    _animateToggle('da-edit-wrap', !!on, 'is-block');
    const row = document.getElementById('da-save-row');
    if (row) row.style.display = on ? '' : 'none';
  }
  function _setExecSummaryVisible(on) {
    _animateToggle('da-exec-summary', !!on);
  }

  function _setConsolidatedVisible(on) {
    _animateToggle('da-consolidated', !!on);
  }

  function _applyPerspective() {
    const dailyOn = _perspective === 'daily';
    const hint = document.getElementById('da-doc-hint');
    if (hint) hint.style.display = dailyOn ? '' : 'none';

    if (dailyOn) {
      _setConsolidatedVisible(false);
      // Reaplica modo do dia atual
      _setModeForDate();
      return;
    }

    // Consolidado: esconde camadas diárias sem quebrar o estado interno
    _setExecSummaryVisible(false);
    _setDashboardVisible(false);
    _setFutureVisible(false);
    _setEditVisible(false);
    _setConsolidatedVisible(true);
  }

  /**
   * Transição suave entre estados (substitui framer-motion num app vanilla).
   * Aplica entrada/saída via classe `da-anim-in/out` definida no CSS.
   */
  function _animateToggle(elId, show, blockClass) {
    const el = document.getElementById(elId);
    if (!el) return;
    if (show) {
      el.hidden = false;
      el.classList.remove('da-anim-out');
      // garante reflow para reiniciar animação
      // eslint-disable-next-line no-unused-expressions
      el.offsetWidth;
      el.classList.add('da-anim-in');
      if (blockClass) el.classList.add(blockClass);
    } else {
      el.classList.remove('da-anim-in');
      el.classList.add('da-anim-out');
      el.hidden = true;
    }
  }

  function _setEditControlsForReadonly(readonly) {
    const tbody = document.getElementById('da-attendance-tbody');
    if (!tbody) return;
    tbody.querySelectorAll('select.da-status-select').forEach(sel => {
      sel.disabled = !!readonly;
    });
    const wrap = document.getElementById('da-edit-wrap');
    if (wrap) wrap.classList.toggle('is-readonly', !!readonly);
  }

  // ────────── Resumo executivo (substitui mensagens vazias) ──────────
  function _renderExecSummary() {
    if (!_state) {
      _setExecSummaryVisible(false);
      return;
    }
    const ds = _state.dateStr;
    const rows = _state.rows || [];
    let presentes = 0, faltas = 0, atestados = 0;
    rows.forEach(r => {
      const st = String(r.status || '').toLowerCase();
      if (st === 'presente') presentes += 1;
      else if (st === 'falta') faltas += 1;
      else if (st === 'atestado') atestados += 1;
    });

    const pres = document.getElementById('da-exec-presencas');
    const flt = document.getElementById('da-exec-faltas');
    const at = document.getElementById('da-exec-atestados');
    const sub = document.getElementById('da-exec-sub');
    const badgeCons = document.getElementById('da-badge-consolidated');
    const badgeAud = document.getElementById('da-badge-audit');

    if (pres) pres.textContent = String(presentes);
    if (flt) flt.textContent = String(faltas);
    if (at) at.textContent = String(atestados);

    const team = _getTeamFor(_activeTeamId());
    const total = team.length || rows.length || 0;
    if (sub) {
      const nice = _prettyDateLongPt(ds);
      sub.textContent = _state.docExists
        ? `${nice} • ${total} colaborador(es) • registro ${_state.docExists ? 'existente' : 'pendente'}`
        : `${nice} • ${total} colaborador(es) • sem registro`;
    }

    // Badges
    if (badgeCons) {
      const showCons = !!(_state.docExists && _isSupervisor() && !_editUnlocked);
      badgeCons.hidden = !showCons;
    }
    if (badgeAud) {
      badgeAud.hidden = !(_state.docExists && _isAdminOrManager());
    }

    const showSummary = !!_state.docExists; // sempre que houver dado salvo
    _setExecSummaryVisible(showSummary);
  }

  function _renderFutureEmpty(dateStr) {
    const title = document.getElementById('da-future-title');
    const text = document.getElementById('da-future-text');
    const team = _getTeamFor(_activeTeamId());
    const size = team.length || 0;
    const messages = [
      `Dia futuro selecionado. Use este tempo para alinhar prioridades e garantir um turno excelente.`,
      `Planejamento é performance. Combine escala e checkpoints para reduzir faltas.`,
      `Projeção: com ${size} colaboradores, pequenas ações de rotina podem elevar a presença do time.`
    ];
    if (title) title.textContent = `Planejamento — ${_prettyDateLongPt(dateStr)}`;
    if (text) text.textContent = messages[Math.floor(Math.random() * messages.length)];
  }

  function _computeSummaryFromStateRows(rows) {
    const arr = Array.isArray(rows) ? rows : [];
    let presentes = 0, faltas = 0, atestados = 0;
    const faltantes = [];
    for (const r of arr) {
      const st = String(r && r.status ? r.status : '').trim().toLowerCase();
      if (st === 'presente') presentes += 1;
      if (st === 'falta') { faltas += 1; faltantes.push(r); }
      if (st === 'atestado') atestados += 1;
    }
    faltantes.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'));
    const denom = presentes + faltas;
    const perf = denom > 0 ? Math.round((presentes / denom) * 100) : null;
    return { presentes, faltas, atestados, perfPct: perf, top3: faltantes.slice(0, 3) };
  }

  function _renderDashboardFromState() {
    if (!_state) return;
    const ds = _state.dateStr;
    const { presentes, faltas, perfPct, top3 } = _computeSummaryFromStateRows(_state.rows);
    const title = document.getElementById('da-dash-title');
    const sub = document.getElementById('da-dash-sub');
    const mp = document.getElementById('da-metric-presentes');
    const mf = document.getElementById('da-metric-faltas');
    const mperf = document.getElementById('da-metric-perf');
    const topEl = document.getElementById('da-top-faltantes');
    const sumEl = document.getElementById('da-dash-summary');
    const auditStrip = document.getElementById('da-audit-strip');
    const auditText = document.getElementById('da-audit-strip-text');

    if (title) title.textContent = _prettyDateLongPt(ds);
    if (sub) {
      sub.textContent = _state.docExists
        ? (_isSupervisor()
            ? 'Dia consolidado — somente leitura. Para retificações contate Admin/Gerente.'
            : 'Dia consolidado — você pode retificar caso necessário.')
        : 'Sem registro salvo';
    }
    if (mp) mp.textContent = String(presentes);
    if (mf) mf.textContent = String(faltas);
    if (mperf) mperf.textContent = perfPct == null ? '—' : `${perfPct}%`;
    if (topEl) {
      if (!top3.length) topEl.innerHTML = `<div class="da-top-empty">Nenhuma falta registrada.</div>`;
      else topEl.innerHTML = top3.map((r, i) => `
        <div class="da-top-row">
          <div class="da-top-rank">${i + 1}</div>
          <div class="da-top-name">${_safeText(r.name || '—')}</div>
          <div class="da-top-chip">Falta</div>
        </div>
      `).join('');
    }
    if (sumEl) {
      const total = (_state.rows || []).length;
      const denom = presentes + faltas;
      const note =
        denom === 0
          ? 'Sem dados suficientes para calcular performance (apenas registros não contabilizados em presença/falta).'
          : perfPct < 80
            ? 'Atenção: performance abaixo de 80%. Considere ações rápidas de alinhamento e follow-up.'
            : 'Boa consistência no dia. Mantenha os rituais do time para sustentar a presença.';
      sumEl.innerHTML = `
        <div class="da-summary-line"><strong>Equipe:</strong> ${total} colaborador(es)</div>
        <div class="da-summary-line"><strong>Presenças+Faltas:</strong> ${denom}</div>
        <div class="da-summary-note">${_safeText(note)}</div>
      `;
    }

    // Faixa de auditoria — quando alguma linha foi retificada por Admin/Gerente
    const editedCount = (_state.rows || []).filter(r => r && r.edited).length;
    if (auditStrip && auditText) {
      if (editedCount > 0) {
        auditText.textContent = `Este registro contém ${editedCount} retificação(ões) feita(s) por Admin/Gerente após o lançamento original do supervisor.`;
        auditStrip.hidden = false;
      } else {
        auditStrip.hidden = true;
      }
    }
  }

  // ────────── Mode resolver (regras de negócio) ──────────
  function _setModeForDate() {
    if (!_state) return;
    if (_perspective === 'consolidated') {
      _applyPerspective();
      return;
    }
    const ds = _state.dateStr;
    const hasData = !!_state.docExists;
    const isFuture = _isFutureDate(ds);
    const isPast = _isPastDate(ds);

    const saveBtn = document.getElementById('da-save-btn');
    const exportBtn = document.getElementById('da-export-btn');
    const editBtn = document.getElementById('da-edit-btn');         // legado (escondido)
    const rectifyBtn = document.getElementById('da-rectify-btn');   // novo (Admin/Gerente)
    const cancelBtn = document.getElementById('da-cancel-edit-btn');

    const isSup = _isSupervisor();
    const isAdmMng = _isAdminOrManager();

    // ▸ Estado: dia FUTURO
    if (isFuture) {
      _setFutureVisible(true);
      _renderFutureEmpty(ds);
      _setEditVisible(false);
      _setExecSummaryVisible(false);
      if (saveBtn) saveBtn.disabled = true;
      if (exportBtn) exportBtn.disabled = true;
      if (rectifyBtn) rectifyBtn.hidden = true;
      if (editBtn) editBtn.hidden = true;
      if (cancelBtn) cancelBtn.hidden = true;
      return;
    }

    // ▸ Estado: SUPERVISOR + dia com registro → READ-ONLY total
    if (isSup && hasData && !_editUnlocked) {
      _setDashboardVisible(true);
      _renderDashboardFromState();
      _setEditVisible(true);
      _setEditControlsForReadonly(true);

      if (saveBtn) saveBtn.hidden = true;             // 🔒 oculta "Salvar"
      if (cancelBtn) cancelBtn.hidden = true;         // 🔒 oculta "Cancelar"
      if (exportBtn) { exportBtn.hidden = false; exportBtn.disabled = false; }
      if (rectifyBtn) rectifyBtn.hidden = true;       // só admin/gerente vê
      if (editBtn) editBtn.hidden = true;             // legado oculto

      _renderExecSummary();
      return;
    }

    // ▸ Estado: ADMIN/GERENTE + dia com registro → readonly inicial + botão "Retificar"
    if (isAdmMng && hasData && !_editUnlocked) {
      _setDashboardVisible(true);
      _renderDashboardFromState();
      _setEditVisible(true);
      _setEditControlsForReadonly(true);

      if (saveBtn) { saveBtn.hidden = true; saveBtn.disabled = true; }
      if (cancelBtn) cancelBtn.hidden = true;
      if (exportBtn) { exportBtn.hidden = false; exportBtn.disabled = false; }
      if (rectifyBtn) rectifyBtn.hidden = false;
      if (editBtn) editBtn.hidden = true;

      _renderExecSummary();
      return;
    }

    // ▸ Estado: edição liberada
    //   - hoje
    //   - passado sem dados (todos os papéis)
    //   - admin/gerente após "Retificar"
    _setDashboardVisible(false);
    _setFutureVisible(false);
    _setEditVisible(true);
    _setEditControlsForReadonly(false);

    if (saveBtn) { saveBtn.hidden = false; saveBtn.disabled = false; }
    if (exportBtn) { exportBtn.hidden = true; exportBtn.disabled = true; }
    if (rectifyBtn) rectifyBtn.hidden = true;
    if (editBtn) editBtn.hidden = true;

    // Cancelar: visível quando há registro existente e estamos editando
    if (cancelBtn) cancelBtn.hidden = !(hasData && (isPast || isAdmMng));

    // Resumo executivo continua visível enquanto houver registro
    _renderExecSummary();
  }

  // ────────── CSV ──────────
  function _exportCsvForCurrentState() {
    if (!_state) return;
    const ds = _state.dateStr;
    const rows = Array.isArray(_state.rows) ? _state.rows : [];
    const esc = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const header = ['Data', 'Colaborador', 'Status', 'Editado'].map(esc).join(',');
    const lines = rows.map(r => [
      ds,
      r.name || '',
      r.status || '',
      r.edited ? 'Sim' : 'Não'
    ].map(esc).join(','));
    const csv = [header, ...lines].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `frequencia_${_state.teamId || 'equipe'}_${ds}.csv`.replace(/[^\w.\-]/g, '_');
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  // ────────── Bind dos botões topo ──────────
  function _ensureResultLayerButtonsBound() {
    const exportBtn = document.getElementById('da-export-btn');
    const editBtn = document.getElementById('da-edit-btn');
    const rectifyBtn = document.getElementById('da-rectify-btn');
    const cancelBtn = document.getElementById('da-cancel-edit-btn');

    if (exportBtn && !exportBtn._daBound) {
      exportBtn._daBound = true;
      exportBtn.addEventListener('click', () => _exportCsvForCurrentState());
    }
    if (editBtn && !editBtn._daBound) {
      editBtn._daBound = true;
      editBtn.addEventListener('click', () => {
        // Apenas admin/gerente; supervisor não pode retificar.
        if (!_isAdminOrManager()) {
          if (window._ntShowToast) window._ntShowToast('Apenas Admin ou Gerente podem retificar registros.', 'error');
          return;
        }
        _editUnlocked = true;
        _setModeForDate();
      });
    }
    if (rectifyBtn && !rectifyBtn._daBound) {
      rectifyBtn._daBound = true;
      rectifyBtn.addEventListener('click', () => {
        if (!_isAdminOrManager()) {
          if (window._ntShowToast) window._ntShowToast('Apenas Admin ou Gerente podem retificar registros.', 'error');
          return;
        }
        _editUnlocked = true;
        _setModeForDate();
        if (window._ntShowToast) {
          window._ntShowToast('Modo retificação habilitado. As alterações ficarão registradas em auditoria.', 'success');
        }
      });
    }
    if (cancelBtn && !cancelBtn._daBound) {
      cancelBtn._daBound = true;
      cancelBtn.addEventListener('click', () => {
        _editUnlocked = false;
        if (_state && _state.dateStr) _loadFromFirestore(_state.dateStr);
      });
    }
  }

  // ────────── Bind do calendário (delegação) ──────────
  function _ensureCalendarDelegates() {
    const cal = document.getElementById('da-calendar');
    if (!cal || cal.dataset.daCalBound) return;
    cal.dataset.daCalBound = '1';

    cal.addEventListener('click', (e) => {
      const nav = e.target.closest('[data-da-cal-nav]');
      if (nav && cal.contains(nav)) {
        const delta = parseInt(nav.getAttribute('data-da-cal-nav'), 10) || 0;
        _shiftViewMonth(delta);
        _renderCalendar();
        if (_perspective === 'consolidated') {
          requestAnimationFrame(() => _renderConsolidatedForCurrentMonth({ force: false }));
        }
        return;
      }

      const dayBtn = e.target.closest('[data-da-cal-day]');
      if (!dayBtn || !cal.contains(dayBtn)) return;
      const iso = dayBtn.getAttribute('data-da-cal-day');
      if (!iso) return;

      const d = new Date(iso + 'T12:00:00');
      if (d.getFullYear() !== _calViewYear || d.getMonth() !== _calViewMonth0) {
        _calViewYear = d.getFullYear();
        _calViewMonth0 = d.getMonth();
      }
      _setSelectedDate(iso, { silent: false });
    });

    cal.addEventListener('mousemove', (e) => {
      const pop = document.getElementById('da-cal-popover');
      if (!pop) return;
      const btn = e.target.closest('[data-da-cal-pop]');
      if (!btn || !cal.contains(btn)) {
        if (!pop.hidden) pop.hidden = true;
        return;
      }
      const raw = btn.getAttribute('data-da-cal-pop');
      if (!raw) return;
      try {
        const data = JSON.parse(raw);
        const top = Array.isArray(data.top) ? data.top.filter(Boolean).slice(0, 3) : [];
        const auditChip = data.hasAdminEdits
          ? `<div class="da-pop-audit-chip"><i class="fas fa-shield-halved"></i> Retificado por Admin/Gerente</div>`
          : '';
        pop.innerHTML = `
          <div class="da-pop-kicker">Central de Análises</div>
          <div class="da-pop-title">Resumo do dia</div>
          <div class="da-pop-metrics">
            <div><span class="da-pop-dot da-pop-dot--ok"></span> Presentes <strong>${Number(data.presentes) || 0}</strong></div>
            <div><span class="da-pop-dot da-pop-dot--bad"></span> Faltas <strong>${Number(data.faltas) || 0}</strong></div>
            <div><span class="da-pop-dot da-pop-dot--info"></span> Atestados <strong>${Number(data.atestados) || 0}</strong></div>
          </div>
          <div class="da-pop-sub">Top 3 faltantes</div>
          <div class="da-pop-top">${top.length ? top.map(n => `<div class="da-pop-top-row">${_safeText(n)}</div>`).join('') : '<div class="da-pop-top-empty">Sem faltas.</div>'}</div>
          ${auditChip}
        `;
        pop.hidden = false;
        const rect = cal.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        pop.style.left = `${Math.min(rect.width - 260, Math.max(12, x + 14))}px`;
        pop.style.top = `${Math.min(rect.height - 12, Math.max(12, y + 14))}px`;
      } catch {
        pop.hidden = true;
      }
    });
    cal.addEventListener('mouseleave', () => {
      const pop = document.getElementById('da-cal-popover');
      if (pop) pop.hidden = true;
    });
  }

  // ────────── Merge dados Firestore × equipe ──────────
  function _mergeRecords(existingRecords, team) {
    /** @type {Record<string, any>} */
    const byId = {};
    (existingRecords || []).forEach(r => {
      if (r && r.employeeId) {
        const id = String(r.employeeId);
        byId[id] = r;
        const legacy = id.match(/^rh-(.+)$/);
        if (legacy) byId[legacy[1]] = r;
      }
    });
    return team.map(e => {
      const empId = String(e.id);
      const prev = byId[empId] || (e.rhMatricula != null ? byId[String(e.rhMatricula)] : null);
      const cargo = String(e.currentRole || '').trim();
      if (!prev) {
        return {
          employeeId: empId,
          name: e.name || '—',
          cargo,
          status: 'pending',
          edited: false, dirtyByMe: false
        };
      }
      const updRole = String(prev.updatedRole || '').toLowerCase();
      const crtRole = String(prev.createdRole || '').toLowerCase();
      const updBy = String(prev.updatedBy || '').toLowerCase();
      const crtBy = String(prev.createdBy || '').toLowerCase();
      const editedByAdmin =
        (updRole === 'admin' || updRole === 'manager') &&
        (updBy && updBy !== crtBy);
      return {
        employeeId: empId,
        name: e.name || '—',
        cargo,
        status: String(prev.status || 'pending'),
        createdBy: prev.createdBy,
        createdRole: prev.createdRole,
        updatedBy: prev.updatedBy,
        updatedRole: prev.updatedRole,
        edited: editedByAdmin,
        dirtyByMe: false
      };
    });
  }

  // ────────── Carga do Firestore ──────────
  async function _loadFromFirestore(dateStr) {
    const teamId = _activeTeamId();
    const team = _getTeamFor(teamId);
    const tbody = document.getElementById('da-attendance-tbody');
    const hint = document.getElementById('da-doc-hint');
    if (!tbody) return;

    // Sem teamId selecionado (caso admin/gerente que ainda não escolheu)
    if (!teamId) {
      if (_isSupervisor()) {
        tbody.innerHTML = `
        <tr><td colspan="2" class="empty-cell">
          <i class="fas fa-user-tie"></i> Não foi possível identificar sua equipe. O <strong>nome</strong> do seu usuário deve corresponder ao <strong>LÍDER</strong> no Rh.Lumini.csv (ex.: &quot;Daniel&quot; vê apenas colaboradores com líder DANIEL).
        </td></tr>`;
      } else {
        tbody.innerHTML = `
        <tr><td colspan="2" class="empty-cell">
          <i class="fas fa-user-tie"></i> Selecione uma equipe (líder) na barra acima para começar.
        </td></tr>`;
      }
      _state = { teamId: '', dateStr, docExists: false, rows: [], priorRecords: [] };
      if (hint) hint.textContent = '';
      _setExecSummaryVisible(false);
      _setDashboardVisible(false);
      _setFutureVisible(false);
      _setEditVisible(true);
      return;
    }

    if (!team.length) {
      // Equipe vazia: para admin/gerente, ainda assim mostramos o resumo executivo do registro se existir.
      tbody.innerHTML = '';
      let docExists = false;
      let existing = null;
      try {
        if (window._ntGetDailyAttendance) {
          const res = await window._ntGetDailyAttendance(teamId, dateStr);
          docExists = !!res.exists;
          existing = res.data;
        }
      } catch (e) { console.warn('[daily-attendance]', e); }

      _state = {
        teamId, dateStr, docExists,
        rows: [],
        priorRecords: existing && Array.isArray(existing.records) ? existing.records : []
      };

      if (!docExists) {
        tbody.innerHTML = `
          <tr><td colspan="2" class="empty-cell">
            <i class="fas fa-users-slash"></i> Nenhum colaborador na equipe selecionada.
          </td></tr>`;
        if (hint) hint.textContent = '';
        _setExecSummaryVisible(false);
        _setModeForDate();
        return;
      }
      // Há registro mas equipe vazia: substitui mensagem por Resumo Executivo
      if (hint) hint.textContent = '';
      _renderExecSummary();
      _setModeForDate();
      return;
    }

    tbody.innerHTML = '<tr><td colspan="2" class="empty-cell"><i class="fas fa-spinner fa-spin"></i> Carregando…</td></tr>';

    let docExists = false;
    let existing = null;
    try {
      if (window._ntGetDailyAttendance) {
        const res = await window._ntGetDailyAttendance(teamId, dateStr);
        docExists = !!res.exists;
        existing = res.data;
      }
    } catch (e) {
      console.warn('[daily-attendance]', e);
      if (window._ntShowToast) window._ntShowToast(e.message || 'Erro ao carregar frequência.', 'error');
    }

    const priorRecords = existing && Array.isArray(existing.records) ? existing.records : [];
    const rows = _mergeRecords(priorRecords, team);
    _state = { teamId, dateStr, docExists, rows, priorRecords };
    _ensureResultLayerButtonsBound();

    if (hint) {
      hint.textContent = docExists
        ? (_isSupervisor()
            ? 'Registro consolidado para este dia. Para ajustes, contate Admin/Gerente.'
            : 'Registro existente — clique em "Retificar Frequência" para editar.')
        : 'Sem registro — defina a situação de cada colaborador e salve.';
    }

    _renderTbody();
    _setModeForDate();
  }

  // ────────── Render do tbody ──────────
  function _renderTbody() {
    const tbody = document.getElementById('da-attendance-tbody');
    if (!tbody || !_state) return;
    const rows = _state.rows || [];
    tbody.innerHTML = rows
      .map((r, i) => {
        const opts = STATUS_OPTIONS.map(
          o => `<option value="${o.value}"${r.status === o.value ? ' selected' : ''}>${o.label}</option>`
        ).join('');
        const initials =
          typeof getInitials === 'function'
            ? getInitials(r.name)
            : (r.name || '?').split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase();
        const editedChip = r.edited
          ? `<span class="da-edited-chip" title="Linha retificada por Admin/Gerente"><i class="fas fa-pen-to-square" aria-hidden="true"></i> editado</span>`
          : '';
        const dirtyChip = r.dirtyByMe
          ? `<span class="da-dirty-chip" title="Alteração não salva"><i class="fas fa-circle" aria-hidden="true"></i> alterado</span>`
          : '';
        return `<tr data-employee-id="${_safeText(r.employeeId)}" class="${r.edited ? 'is-edited' : ''}">
          <td>
            <div class="emp-name-cell">
              <div class="emp-avatar-sm">${_safeText(initials)}</div>
              <div>
                <div class="emp-name">${_safeText(r.name)}</div>
                ${r.cargo ? `<div class="da-emp-cargo">${_safeText(r.cargo)}</div>` : ''}
                <div class="da-row-chips">${editedChip}${dirtyChip}</div>
              </div>
            </div>
          </td>
          <td>
            <select class="da-status-select" data-row="${i}" aria-label="Situação de ${_safeText(r.name)}">${opts}</select>
          </td>
        </tr>`;
      })
      .join('');

    tbody.querySelectorAll('select.da-status-select').forEach(sel => {
      sel.addEventListener('change', () => {
        const idx = parseInt(sel.getAttribute('data-row'), 10);
        if (_state && _state.rows[idx]) {
          const prev = _state.rows[idx].status;
          _state.rows[idx].status = sel.value;
          if (prev !== sel.value) {
            _state.rows[idx].dirtyByMe = true;
            // Repinta apenas a linha alterada para refletir o chip "alterado"
            const tr = sel.closest('tr');
            if (tr) {
              const chips = tr.querySelector('.da-row-chips');
              if (chips && !chips.querySelector('.da-dirty-chip')) {
                chips.insertAdjacentHTML('beforeend',
                  `<span class="da-dirty-chip"><i class="fas fa-circle" aria-hidden="true"></i> alterado</span>`);
              }
            }
            _renderExecSummary(); // recomputa contadores ao vivo
          }
        }
      });
    });
  }

  // ────────── Coleta linhas para salvar ──────────
  function _collectRowsFromDom() {
    const tbody = document.getElementById('da-attendance-tbody');
    if (!tbody || !_state) return [];
    const selects = tbody.querySelectorAll('select.da-status-select');
    const out = [];
    selects.forEach((sel, i) => {
      const tr = sel.closest('tr');
      const id = tr ? tr.getAttribute('data-employee-id') : null;
      if (id) out.push({ employeeId: id, status: sel.value });
      else if (_state.rows[i]) out.push({ employeeId: _state.rows[i].employeeId, status: sel.value });
    });
    return out;
  }

  // ────────── Salvar ──────────
  async function _save() {
    const u = window.currentUser;
    if (!u || !_state) return;

    // Trava de segurança no cliente: supervisor não pode salvar quando dia já está consolidado.
    if (_isSupervisor() && _state.docExists && !_editUnlocked) {
      if (window._ntShowToast) {
        window._ntShowToast('Frequência já consolidada. Apenas Admin/Gerente podem retificar.', 'error');
      }
      return;
    }
    // Admin/Gerente só pode salvar após "Retificar" (ou se é registro novo).
    if (_isAdminOrManager() && _state.docExists && !_editUnlocked) {
      if (window._ntShowToast) {
        window._ntShowToast('Clique em "Retificar Frequência" para habilitar a edição.', 'error');
      }
      return;
    }

    const dateInput = document.getElementById('da-attendance-date');
    const dateStr = (dateInput && dateInput.value) || _state.dateStr;
    const teamId = _state.teamId;
    const records = _collectRowsFromDom();

    if (!window._ntSaveDailyAttendance) {
      if (window._ntShowToast) window._ntShowToast('Serviço indisponível. Verifique o Firebase.', 'error');
      return;
    }

    const btn = document.getElementById('da-save-btn');
    if (btn) btn.disabled = true;

    try {
      await window._ntSaveDailyAttendance({
        teamId,
        date: dateStr,
        status: 'open',
        records,
        savedBy: u.email,
        savedRole: _role(),
        isNew: !_state.docExists,
        priorRecords: _state.priorRecords || []
      });
      _state.docExists = true;
      _state.dateStr = dateStr;
      _editUnlocked = false;

      const hint = document.getElementById('da-doc-hint');
      if (hint) {
        hint.textContent = _isSupervisor()
          ? 'Frequência consolidada com sucesso. Edição agora bloqueada (read-only).'
          : 'Retificação salva com sucesso. As alterações ficam registradas no histórico.';
      }
      if (window._ntShowToast) {
        window._ntShowToast(_isSupervisor()
          ? 'Frequência do dia consolidada.'
          : 'Retificação registrada.', 'success');
      }

      // Limpa caches do mês para refletir dots/heatmap/audit
      if (_calViewYear != null && _calViewMonth0 != null) {
        const key = _monthKey(teamId, _calViewYear, _calViewMonth0);
        _monthDotsCache.delete(key);
        _monthSummaryCache.delete(key);
        _renderCalendar();
      }
      // Recarrega para repintar com metadados frescos
      await _loadFromFirestore(dateStr);
    } catch (e) {
      console.error(e);
      const msg = e && e.message ? e.message : 'Erro ao salvar frequência.';
      if (window._ntShowToast) window._ntShowToast(msg, 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // ────────── Seletor de equipe (Admin/Gerente) ──────────
  function _renderTeamPicker() {
    const wrap = document.getElementById('da-team-picker');
    const sel = document.getElementById('da-team-select');
    if (!wrap || !sel) return;

    if (!_isAdminOrManager()) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;

    const leaders = _uniqueLeadersFromEmployees();
    const opts = ['<option value="">Selecione um líder (supervisor)…</option>'].concat(
      leaders.map(L => `<option value="${_safeText(L.key)}">${_safeText(L.label)}</option>`)
    );
    sel.innerHTML = opts.join('');
    if (_selectedTeamId && leaders.some(L => L.key === _selectedTeamId)) {
      sel.value = _selectedTeamId;
    }

    if (!sel._daBound) {
      sel._daBound = true;
      sel.addEventListener('change', () => {
        _selectedTeamId = sel.value || null;
        _monthDotsCache.clear();
        _monthSummaryCache.clear();
        _consCache.clear();
        _editUnlocked = false;
        _renderCalendar();
        const ds = _calSelected || _todayISO();
        _loadFromFirestore(ds);
        if (_perspective === 'consolidated') {
          requestAnimationFrame(() => _renderConsolidatedForCurrentMonth({ force: false }));
        }
      });
    }
  }

  function _renderPageSubLabel() {
    const sub = document.getElementById('da-page-sub');
    if (!sub) return;
    if (_isSupervisor()) {
      sub.textContent = 'Lançamento diário da sua equipe — após salvar, o dia fica consolidado.';
    } else if (_isAdminOrManager()) {
      sub.textContent = 'Auditoria e retificação de frequência — selecione uma equipe para começar.';
    } else {
      sub.textContent = 'Lançamento diário por colaborador — um documento por dia e equipe.';
    }
  }

  // ────────── Consolidado (Resumo Geral) ──────────
  function _monthStartEnd(y, m0) {
    const lastDay = new Date(y, m0 + 1, 0).getDate();
    const startDate = `${y}-${_pad2(m0 + 1)}-01`;
    const endDate = `${y}-${_pad2(m0 + 1)}-${_pad2(lastDay)}`;
    return { startDate, endDate, lastDay };
  }

  function _consKey(teamId, y, m0, shift) {
    return `${_monthKey(teamId, y, m0)}__shift=${shift || 'all'}`;
  }

  async function _fetchConsolidatedMonthDocs(teamId, y, m0) {
    const { startDate, endDate } = _monthStartEnd(y, m0);
    if (typeof window._ntListAttendanceDocsForTeam !== 'function') {
      throw new Error('Serviço indisponível: _ntListAttendanceDocsForTeam');
    }
    const data = await window._ntListAttendanceDocsForTeam({ teamId, startDate, endDate });
    console.log('Dados recuperados para o dashboard:', data);
    return data;
  }

  function _computeConsolidatedPayload(teamEmployees, docs, y, m0, shift) {
    const team = Array.isArray(teamEmployees) ? teamEmployees : [];
    const filteredTeam = (() => {
      const s = String(shift || 'all').trim().toLowerCase();
      if (!s || s === 'all') return team.slice();
      if (s === 'noite') return team.filter(e => _inferShift(e) === 'noite');
      // "Dia" agrega manhã + tarde
      return team.filter(e => {
        const inf = _inferShift(e);
        return inf === 'manha' || inf === 'tarde';
      });
    })();

    const ids = new Set(filteredTeam.map(e => String(e.id)));
    const idByNameKey = (() => {
      const m = new Map();
      filteredTeam.forEach(e => {
        const k = _normLeader(e && e.name ? e.name : '').replace(/\s+/g, ' ').trim();
        if (k && !m.has(k)) m.set(k, String(e.id));
      });
      return m;
    })();
    const nameById = {};
    filteredTeam.forEach(e => { nameById[String(e.id)] = e.name || '—'; });

    const daysInMonth = new Date(y, m0 + 1, 0).getDate();
    const dayLabels = Array.from({ length: daysInMonth }, (_, i) => String(i + 1));

    // aggregations
    const agg = {};
    for (const e of filteredTeam) {
      agg[String(e.id)] = { id: String(e.id), name: e.name || '—', pres: 0, falt: 0, cancel: 0, just: 0, totalKnown: 0, faltDates: [] };
    }

    // heatmap matrix: empId -> dayIndex -> status ('ok'|'bad'|'neu')
    const hm = {};
    Object.keys(agg).forEach(id => {
      hm[id] = Array.from({ length: daysInMonth }, () => 'neu');
    });

    for (const doc of (Array.isArray(docs) ? docs : [])) {
      const dateStr = String(doc.date || '').trim();
      if (!dateStr) continue;
      const day = parseInt(dateStr.slice(8, 10), 10);
      const dayIdx = Number.isFinite(day) ? (day - 1) : -1;

      const recs = Array.isArray(doc.records) ? doc.records : [];
      for (const r of recs) {
        let empId = r && r.employeeId != null ? String(r.employeeId) : '';
        if (!empId) continue;
        if (!ids.has(empId)) {
          // Alguns legados salvam o "employeeId" como NOME (COLABORADOR) ao invés de MATRÍCULA.
          const byName = idByNameKey.get(_normLeader(empId).replace(/\s+/g, ' ').trim());
          if (byName) empId = byName;
        }
        if (!empId || !ids.has(empId)) continue;
        if (!agg[empId]) continue;
        const st0 = String(r.status || '').trim().toLowerCase();
        const st =
          st0 === 'p' ? 'presente' :
          st0 === 'f' ? 'falta' :
          (st0 === 'presenca' || st0 === 'presença') ? 'presente' :
          st0;
        if (st === 'presente') { agg[empId].pres += 1; agg[empId].totalKnown += 1; if (dayIdx >= 0) hm[empId][dayIdx] = 'ok'; }
        else if (st === 'falta') { agg[empId].falt += 1; agg[empId].totalKnown += 1; agg[empId].faltDates.push(dateStr); if (dayIdx >= 0) hm[empId][dayIdx] = 'bad'; }
        else if (st === 'turno_cancelado') { agg[empId].cancel += 1; agg[empId].totalKnown += 1; if (dayIdx >= 0) hm[empId][dayIdx] = 'bad'; }
        else if (st === 'atestado' || st === 'folga') { agg[empId].just += 1; agg[empId].totalKnown += 1; }
      }
    }

    const rows = Object.values(agg);
    rows.forEach(r => r.faltDates.sort());

    // KPIs globais
    const totalFaltas = rows.reduce((s, r) => s + r.falt, 0);
    const totalPres = rows.reduce((s, r) => s + r.pres, 0);
    const totalCancel = rows.reduce((s, r) => s + r.cancel, 0);

    // Aproveitamento real: ((ativos * dias úteis) - faltas) / (ativos * dias úteis)
    // Ativos: colaboradores sem data de demissão no CSV (fallback) ou sem rhDemissao.
    const workdays = (() => {
      const start = new Date(y, m0, 1);
      const end = new Date(y, m0 + 1, 0);
      let cnt = 0;
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const wd = d.getDay(); // 0 dom ... 6 sáb
        if (wd !== 0 && wd !== 6) cnt++;
      }
      return cnt;
    })();
    const ativos = filteredTeam.filter(e => !String(e.rhDemissao || '').trim()).length;
    const totalSlots = ativos * workdays;
    const aproveitamento = totalSlots > 0
      ? Math.round(((totalSlots - totalFaltas) / totalSlots) * 100)
      : null;

    // Ranking + status critico
    const ranked = rows
      .slice()
      .sort((a, b) => (b.falt - a.falt) || (b.cancel - a.cancel) || (b.pres - a.pres) || (a.name || '').localeCompare(b.name || '', 'pt-BR'));

    return {
      y, m0, shift,
      employees: filteredTeam,
      ranked,
      kpis: { totalFaltas, totalPres, totalCancel, aproveitamento },
      heatmap: { dayLabels, hm, nameById }
    };
  }

  function _renderConsolidatedUi(payload, teamId) {
    const title = document.getElementById('da-cons-period-title');
    const sub = document.getElementById('da-cons-period-sub');
    const kF = document.getElementById('da-kpi-faltas');
    const kP = document.getElementById('da-kpi-presencas');
    const kC = document.getElementById('da-kpi-cancelados');
    const kA = document.getElementById('da-kpi-aproveitamento');
    const cancelCard = document.querySelector('.da-kpi-card--cancel');
    const count = document.getElementById('da-cons-count');
    const tbody = document.getElementById('da-cons-tbody');
    const hmWrap = document.getElementById('da-heatmap-wrap');

    const periodTitle = _ptMonthYearTitle(payload.y, payload.m0);
    if (title) title.textContent = `${periodTitle} — ${_shiftLabel(payload.shift)}`;
    if (sub) sub.textContent = `Equipe: ${_safeText(_leaderLabelForTeamKey(teamId))} • Colaboradores: ${payload.ranked.length}`;

    if (kF) kF.textContent = String(payload.kpis.totalFaltas || 0);
    if (kP) kP.textContent = String(payload.kpis.totalPres || 0);
    if (kC) kC.textContent = String(payload.kpis.totalCancel || 0);
    if (kA) kA.textContent = payload.kpis.aproveitamento == null ? '—' : `${payload.kpis.aproveitamento}%`;

    if (cancelCard) cancelCard.classList.toggle('is-hot', (payload.kpis.totalCancel || 0) > 0);

    if (count) count.textContent = `${payload.ranked.length} colaboradores`;

    if (tbody) {
      if (!payload.ranked.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-cell"><i class="fas fa-circle-info"></i> Nenhum colaborador no filtro selecionado.</td></tr>`;
      } else {
        tbody.innerHTML = payload.ranked.map(r => {
          const denom = (r.pres + r.falt);
          const pct = denom > 0 ? Math.round((r.pres / denom) * 100) : 0;
          const critical = (r.falt >= 3) || (r.cancel > 0);
          const statusLabel = critical ? 'Crítico' : 'Regular';
          const statusClass = critical ? 'da-crit' : 'da-regular';
          return `
            <tr class="da-cons-row" data-da-emp="${_safeText(r.id)}">
              <td><strong>${_safeText(r.name)}</strong></td>
              <td>${r.falt}</td>
              <td>${r.pres}</td>
              <td>${r.just}</td>
              <td>
                <div class="da-cons-progress" title="${pct}%">
                  <span style="width:${pct}%"></span>
                </div>
              </td>
              <td><span class="${statusClass}">${statusLabel}</span></td>
            </tr>
          `;
        }).join('');
      }
    }

    if (hmWrap) {
      const { dayLabels, hm } = payload.heatmap;
      const headRow = [
        `<div class="da-hm-head" style="text-align:left">Colaborador</div>`,
        ...dayLabels.map(d => `<div class="da-hm-head">${_safeText(d)}</div>`)
      ].join('');

      const body = payload.ranked.map(r => {
        const cells = (hm[String(r.id)] || []).map(code => {
          const cls = code === 'ok' ? 'ok' : code === 'bad' ? 'bad' : 'neu';
          return `<div class="da-hm-cell ${cls}"></div>`;
        }).join('');
        return `<div class="da-hm-name">${_safeText(r.name)}</div>${cells}`;
      }).join('');

      hmWrap.innerHTML = `
        <div class="da-heatmap-grid" style="grid-template-columns: 240px repeat(${dayLabels.length}, 14px);">
          ${headRow}
          ${body}
        </div>
      `;
    }
  }

  function _openEmpModal(emp, payload) {
    const modal = document.getElementById('da-emp-modal');
    const ttl = document.getElementById('da-emp-modal-title');
    const sub = document.getElementById('da-emp-modal-sub');
    const body = document.getElementById('da-emp-modal-body');
    if (!modal || !ttl || !sub || !body) return;

    const periodTitle = _ptMonthYearTitle(payload.y, payload.m0);
    ttl.textContent = emp.name || '—';
    sub.textContent = `${periodTitle} • Faltas: ${emp.falt} • Turnos cancelados: ${emp.cancel}`;

    const dates = (emp.faltDates || []).slice();
    if (!dates.length) {
      body.innerHTML = `<div class="empty-cell"><i class="fas fa-circle-check"></i> Nenhuma falta registrada no período.</div>`;
    } else {
      body.innerHTML = `
        <div class="da-modal-list">
          ${dates.map(ds => `
            <div class="da-modal-item">
              <div><strong>${_safeText(_prettyDateLongPt(ds))}</strong><div style="font-size:12px;opacity:.78">Clique para abrir e retificar o dia</div></div>
              <button type="button" class="btn-outline" data-da-open-day="${_safeText(ds)}">
                <i class="fas fa-pen-ruler"></i> Retificar
              </button>
            </div>
          `).join('')}
        </div>
      `;
    }

    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function _closeEmpModal() {
    const modal = document.getElementById('da-emp-modal');
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  async function _renderConsolidatedForCurrentMonth(opts = { force: false }) {
    const teamId = _activeTeamId();
    const y = _calViewYear;
    const m0 = _calViewMonth0;
    const shift = _shiftFilter || 'all';

    if (!teamId || y == null || m0 == null) return;

    const cons = document.getElementById('da-consolidated');
    const tbody = document.getElementById('da-cons-tbody');
    if (!cons || !tbody) return;

    const key = _consKey(teamId, y, m0, shift);
    const cached = _consCache.get(key);
    if (!opts.force && cached && cached.payload) {
      _renderConsolidatedUi(cached.payload, teamId);
      return;
    }

    tbody.innerHTML = `<tr><td colspan="6" class="empty-cell"><i class="fas fa-spinner fa-spin"></i> Carregando colaboradores…</td></tr>`;
    try {
      // garante fonte primária de colaboradores (CSV) antes de calcular/renderizar
      await _ensureEmployeesFromCsvLoaded();
      const teamEmployees = _getTeamFor(teamId);
      tbody.innerHTML = `<tr><td colspan="6" class="empty-cell"><i class="fas fa-spinner fa-spin"></i> Calculando resumo…</td></tr>`;

      let docs = [];
      try {
        docs = await _fetchConsolidatedMonthDocs(teamId, y, m0);
      } catch (e) {
        // Se o banco falhar, seguimos com docs vazios e renderizamos o período mesmo assim.
        docs = [];
      }

      console.log('Dados processados no Front:', docs);
      const payload = _computeConsolidatedPayload(teamEmployees, docs, y, m0, shift);
      _consCache.set(key, { teamId, y, m0, shift, computedAt: Date.now(), payload });
      _renderConsolidatedUi(payload, teamId);
    } catch (e) {
      console.warn('[daily-attendance consolidated]', e);
      // Fallback final: tenta ao menos montar a UI com CSV (sem registros)
      try {
        await _ensureEmployeesFromCsvLoaded();
        const teamEmployees = _getTeamFor(teamId);
        const payload = _computeConsolidatedPayload(teamEmployees, [], y, m0, shift);
        _consCache.set(key, { teamId, y, m0, shift, computedAt: Date.now(), payload });
        _renderConsolidatedUi(payload, teamId);
      } catch {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-cell"><i class="fas fa-spinner fa-spin"></i> Carregando…</td></tr>`;
      }
    }
  }

  function _ensurePerspectiveToggleBound() {
    const dailyBtn = document.getElementById('da-persp-daily');
    const consBtn = document.getElementById('da-persp-consolidated');
    if (!dailyBtn || !consBtn) return;
    if (dailyBtn._daBound) return;
    dailyBtn._daBound = true;

    const setActive = (p) => {
      _perspective = p;
      dailyBtn.classList.toggle('active', p === 'daily');
      consBtn.classList.toggle('active', p === 'consolidated');
      _applyPerspective();
      if (p === 'consolidated') {
        requestAnimationFrame(() => _renderConsolidatedForCurrentMonth({ force: false }));
      }
    };

    dailyBtn.addEventListener('click', () => setActive('daily'));
    consBtn.addEventListener('click', () => setActive('consolidated'));

    const shiftSel = document.getElementById('da-shift-filter');
    if (shiftSel && !shiftSel._daBound) {
      shiftSel._daBound = true;
      shiftSel.addEventListener('change', () => {
        _shiftFilter = shiftSel.value || 'all';
        if (_perspective === 'consolidated') _renderConsolidatedForCurrentMonth({ force: false });
      });
    }

    const refreshBtn = document.getElementById('da-cons-refresh-btn');
    if (refreshBtn && !refreshBtn._daBound) {
      refreshBtn._daBound = true;
      refreshBtn.addEventListener('click', () => {
        _consCache.clear();
        if (_perspective === 'consolidated') _renderConsolidatedForCurrentMonth({ force: true });
      });
    }

    const consTbody = document.getElementById('da-cons-tbody');
    if (consTbody && !consTbody._daBound) {
      consTbody._daBound = true;
      consTbody.addEventListener('click', (e) => {
        const tr = e.target.closest('[data-da-emp]');
        if (!tr) return;
        const empId = tr.getAttribute('data-da-emp');
        const teamId = _activeTeamId();
        const y = _calViewYear, m0 = _calViewMonth0;
        const shift = _shiftFilter || 'all';
        const key = _consKey(teamId, y, m0, shift);
        const cached = _consCache.get(key);
        const payload = cached && cached.payload ? cached.payload : null;
        if (!payload) return;
        const emp = payload.ranked.find(r => String(r.id) === String(empId));
        if (!emp) return;
        _openEmpModal(emp, payload);
      });
    }

    const modal = document.getElementById('da-emp-modal');
    if (modal && !modal._daBound) {
      modal._daBound = true;
      modal.addEventListener('click', (e) => {
        const close = e.target.closest('[data-da-modal-close]');
        if (close) { _closeEmpModal(); return; }
        const openDay = e.target.closest('[data-da-open-day]');
        if (openDay) {
          const ds = openDay.getAttribute('data-da-open-day');
          _closeEmpModal();
          _perspective = 'daily';
          dailyBtn.classList.add('active');
          consBtn.classList.remove('active');
          _applyPerspective();
          if (ds) {
            _setSelectedDate(ds, { silent: false });
            // Admin/Gerente: já entra em modo retificação para acelerar
            if (_isAdminOrManager()) {
              _editUnlocked = true;
            }
            setTimeout(() => {
              const row = document.getElementById('da-edit-wrap');
              if (row) row.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 200);
          }
        }
      });
      document.addEventListener('keydown', (ev) => {
        if (!modal.hidden && ev.key === 'Escape') _closeEmpModal();
      });
    }
  }

  // ────────── Entry point ──────────
  window._dailyAttendanceRenderPage = function () {
    const u = window.currentUser;
    if (!u || !_canAccessPage()) {
      if (window.navigateTo) window.navigateTo('supervisor-home');
      return;
    }

    // Reset de estado quando o usuário mudou de papel/contexto
    if (_isSupervisor()) {
      _selectedTeamId = _supervisorTeamKeyForCurrentUser();
    }

    _renderPageSubLabel();
    _renderTeamPicker();

    const dateInput = document.getElementById('da-attendance-date');
    if (dateInput && !dateInput._daBound) {
      dateInput._daBound = true;
      dateInput.value = _todayISO();
      dateInput.addEventListener('change', () => {
        const v = dateInput.value;
        if (v) _setSelectedDate(v, { silent: false });
      });
    } else if (dateInput && !dateInput.value) {
      dateInput.value = _todayISO();
    }

    _renderCalendarSkeleton();
    _ensureCalendarDelegates();
    _ensureResultLayerButtonsBound();
    _ensurePerspectiveToggleBound();

    // Warmup CSV para evitar "0 colaboradores" durante indexação / caches frios
    _ensureEmployeesFromCsvLoaded().catch(() => {});

    const initial = (dateInput && dateInput.value) || _todayISO();
    if (_calSelected !== initial) {
      const d = new Date(initial + 'T12:00:00');
      _calViewYear = d.getFullYear();
      _calViewMonth0 = d.getMonth();
      _calSelected = initial;
      _syncSelectedToInput();
    }
    _renderCalendar();
    _loadFromFirestore(initial);
    _applyPerspective();
    if (_perspective === 'consolidated') {
      _renderConsolidatedForCurrentMonth({ force: false });
    }

    const saveBtn = document.getElementById('da-save-btn');
    if (saveBtn && !saveBtn._daBound) {
      saveBtn._daBound = true;
      saveBtn.addEventListener('click', () => _save());
    }
  };
})();
