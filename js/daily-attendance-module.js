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

  /**
   * Slot interno da matriz de assiduidade → classe CSS única (`status-*`) na célula.
   * Mantém um único mapeamento para evitar divergência com a legenda.
   */
  function _assiduitySlotToStatusClass(slot) {
    switch (String(slot || '')) {
      case 'presente': return 'status-presente';
      case 'falta': return 'status-falta';
      case 'just': return 'status-justificada';
      case 'folga': return 'status-folga';
      case 'turno_cancelado': return 'status-cancelado';
      case 'future': return 'status-futuro';
      case 'neu':
      case 'empty':
      default: return 'status-sem-registro';
    }
  }

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

  /** Equipe selecionada por Admin/Gerente (`__ALL__` = todas as equipes no Resumo Geral). */
  const DA_ALL_TEAMS = '__ALL__';
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

  /** "YYYY-MM" para queries Firestore (`month_year`). */
  function _monthYearStr(y, m0) {
    if (y == null || m0 == null) return '';
    return `${y}-${_pad2(m0 + 1)}`;
  }

  function _updateMonthStepperLabel() {
    const el = document.getElementById('da-month-step-label');
    if (!el || _calViewYear == null || _calViewMonth0 == null) return;
    const t = _ptMonthYearTitle(_calViewYear, _calViewMonth0);
    el.textContent = t;
  }

  /** Mantém o dia selecionado dentro do mês visível (Visão Diária). */
  function _clampCalSelectedToViewMonth() {
    if (_calSelected == null || _calViewYear == null || _calViewMonth0 == null) return;
    const d = new Date(String(_calSelected) + 'T12:00:00');
    if (d.getFullYear() === _calViewYear && d.getMonth() === _calViewMonth0) return;
    const last = new Date(_calViewYear, _calViewMonth0 + 1, 0).getDate();
    const day = Math.min(Math.max(1, d.getDate()), last);
    _calSelected = `${_calViewYear}-${_pad2(_calViewMonth0 + 1)}-${_pad2(day)}`;
    _syncSelectedToInput();
  }

  function _renderAssiduitySkeleton(nRows, nDays) {
    const assMount = document.getElementById('da-assiduity-table-mount');
    if (!assMount) return;
    const nR = Math.max(3, Math.min(Number(nRows) || 6, 14));
    const nD = Math.max(28, Math.min(Number(nDays) || 31, 31));
    const headDays = Array.from({ length: nD }, (_, i) =>
      `<th scope="col" class="da-assid-th-day da-assid-th-day--skel">${i + 1}</th>`
    ).join('');
    const rows = Array.from({ length: nR }, () => `
      <tr class="da-assid-tr">
        <th scope="row" class="da-assid-th-name">
          <span class="nt-skel nt-skel-line" style="display:block;width:min(180px,42vw);height:12px;border-radius:6px"></span>
        </th>
        ${Array.from({ length: nD }, () =>
          `<td class="da-assid-td-cell"><span class="nt-skel da-assid-skel-square" aria-hidden="true"></span></td>`
        ).join('')}
      </tr>
    `).join('');
    assMount.innerHTML = `
      <table class="da-assiduity-table da-assiduity-table--skel" role="presentation" aria-busy="true">
        <thead>
          <tr>
            <th scope="col" class="da-assid-th-name da-assid-th-corner">Colaborador</th>
            ${headDays}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  function _safeText(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /** Atributo HTML (ex.: title) — evita quebra de aspas e entidades básicas. */
  function _safeAttr(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/\n/g, ' ');
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
  /** Escopo do Resumo Geral consolidado: todas as equipes ou chave do supervisor. */
  function _consolidatedScopeTeamId() {
    if (_isSupervisor()) {
      return _supervisorTeamKeyForCurrentUser();
    }
    if (_isAdminOrManager()) {
      const v = _selectedTeamId != null ? String(_selectedTeamId).trim() : '';
      if (!v || v === DA_ALL_TEAMS) return DA_ALL_TEAMS;
      return v;
    }
    return '';
  }

  function _activeTeamId() {
    if (_isSupervisor()) {
      return _supervisorTeamKeyForCurrentUser();
    }
    const v = _selectedTeamId != null ? String(_selectedTeamId).trim() : '';
    if (!v || v === DA_ALL_TEAMS) return '';
    return v;
  }

  function _employeesForConsolidated(scopeTeamId) {
    if (scopeTeamId === DA_ALL_TEAMS) {
      return _allEmployees()
        .slice()
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'));
    }
    return _getTeamFor(scopeTeamId);
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
      console.error('[daily-attendance calendar] dots', e);
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
      console.error('[daily-attendance calendar] summaries', e);
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
      const folgas = sum ? (Number(sum.folgas) || 0) : 0;
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
        showHighAbsence, hasAdminEdits, sum, topAbs, atestados, folgas
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
              folgas: Number(c.folgas) || 0,
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
    _updateMonthStepperLabel();
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
    const toolbar = document.getElementById('da-toolbar');
    if (toolbar) {
      toolbar.classList.toggle('da-toolbar--consolidated', !dailyOn);
      toolbar.classList.toggle('da-toolbar--daily', dailyOn);
    }
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

  /** Visão diária: barra "Ações em massa" (só `pending`); não persiste no Firestore. */
  function _updateBulkActionsBar() {
    const row = document.getElementById('da-mark-all-row');
    if (!row) return;
    if (_perspective !== 'daily') {
      row.hidden = true;
      return;
    }
    const tbody = document.getElementById('da-attendance-tbody');
    const editWrap = document.getElementById('da-edit-wrap');
    if (!tbody || !editWrap || editWrap.hidden) {
      row.hidden = true;
      return;
    }
    const editable = Array.from(tbody.querySelectorAll('select.da-status-select')).filter(s => !s.disabled);
    if (!editable.length) {
      row.hidden = true;
      return;
    }
    row.hidden = false;
    const hasPending = editable.some(s => s.value === 'pending');
    ['da-bulk-presente', 'da-bulk-folga', 'da-bulk-cancelado'].forEach(id => {
      const b = document.getElementById(id);
      if (b) b.disabled = !hasPending;
    });
  }

  /**
   * Ações em massa na lista do dia: altera apenas selects em "Não definido" (`pending`).
   * Dispara `change` para manter `_state`, chips "alterado" e `_renderExecSummary` alinhados.
   * Não persiste no Firestore até "Salvar frequência do dia".
   *
   * @param {string} statusValue Um de: `presente` | `folga` | `turno_cancelado`
   */
  function bulkApplyStatus(statusValue) {
    const st = String(statusValue || '').trim().toLowerCase();
    if (st !== 'presente' && st !== 'folga' && st !== 'turno_cancelado') return;
    if (st === 'folga') {
      if (!window.confirm('Deseja marcar folga para toda a equipe? Somente colaboradores em "Não definido" serão alterados.')) return;
    }
    if (st === 'turno_cancelado') {
      if (!window.confirm('Deseja marcar turno cancelado para toda a equipe? Somente colaboradores em "Não definido" serão alterados.')) return;
    }
    const tbody = document.getElementById('da-attendance-tbody');
    if (!tbody || !_state) return;
    const FLASH_CLASS = 'da-status-select--flash';
    const FLASH_MS = 1100;
    tbody.querySelectorAll('select.da-status-select').forEach(sel => {
      if (sel.disabled) return;
      if (sel.value !== 'pending') return;
      sel.value = st;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      if (sel._daFlashTid) clearTimeout(sel._daFlashTid);
      sel.classList.remove(FLASH_CLASS);
      // eslint-disable-next-line no-unused-expressions
      sel.offsetWidth;
      sel.classList.add(FLASH_CLASS);
      sel._daFlashTid = setTimeout(() => {
        sel.classList.remove(FLASH_CLASS);
        sel._daFlashTid = null;
      }, FLASH_MS);
    });
    _updateBulkActionsBar();
  }

  // ────────── Resumo executivo (substitui mensagens vazias) ──────────
  function _renderExecSummary() {
    if (!_state) {
      _setExecSummaryVisible(false);
      return;
    }
    const ds = _state.dateStr;
    const rows = _state.rows || [];
    let presentes = 0, faltas = 0, atestados = 0, folgas = 0, cancelados = 0;
    rows.forEach(r => {
      const st = String(r.status || '').toLowerCase();
      if (st === 'presente') presentes += 1;
      else if (st === 'falta') faltas += 1;
      else if (st === 'atestado') atestados += 1;
      else if (st === 'folga') folgas += 1;
      else if (st === 'turno_cancelado') cancelados += 1;
    });

    const pres = document.getElementById('da-exec-presencas');
    const flt = document.getElementById('da-exec-faltas');
    const at = document.getElementById('da-exec-atestados');
    const fg = document.getElementById('da-exec-folgas');
    const canc = document.getElementById('da-exec-cancelados');
    const sub = document.getElementById('da-exec-sub');
    const badgeCons = document.getElementById('da-badge-consolidated');
    const badgeAud = document.getElementById('da-badge-audit');

    if (pres) pres.textContent = String(presentes);
    if (flt) flt.textContent = String(faltas);
    if (at) at.textContent = String(atestados);
    if (fg) fg.textContent = String(folgas);
    if (canc) canc.textContent = String(cancelados);

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
    // Performance do dia: só presença × falta. Folga, turno cancelado e atestado não entram como falta.
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
    try {
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
    } finally {
      _updateBulkActionsBar();
    }
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
            <div><span class="da-pop-dot da-pop-dot--folga"></span> Folgas <strong>${Number(data.folgas) || 0}</strong></div>
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
        status: (typeof window._ntNormAttendanceStatus === 'function'
          ? window._ntNormAttendanceStatus(prev.status)
          : String(prev.status || 'pending')),
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
      } catch (e) { console.error('[daily-attendance]', e); }

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
      console.error('[daily-attendance]', e);
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
        _updateBulkActionsBar();
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

    if (_isSupervisor()) {
      wrap.hidden = false;
      sel.removeAttribute('disabled');
      const key = _supervisorTeamKeyForCurrentUser();
      const label = key ? _leaderLabelForTeamKey(key) : 'Sua equipe';
      sel.innerHTML = `<option value="${_safeText(key)}">${_safeText(label || key || '—')}</option>`;
      sel.value = key || '';
      sel.disabled = true;
      sel.setAttribute('aria-disabled', 'true');
      sel.title = 'Você visualiza apenas os dados da sua equipe.';
      _selectedTeamId = key || null;
      return;
    }

    if (!_isAdminOrManager()) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    sel.removeAttribute('disabled');
    sel.removeAttribute('aria-disabled');
    sel.removeAttribute('title');

    const leaders = _uniqueLeadersFromEmployees();
    const opts = [`<option value="${DA_ALL_TEAMS}">-- Todas as Equipes --</option>`].concat(
      leaders.map(L => `<option value="${_safeText(L.key)}">${_safeText(L.label)}</option>`)
    );
    sel.innerHTML = opts.join('');

    const validKeys = new Set([DA_ALL_TEAMS, ...leaders.map(L => L.key)]);
    if (_selectedTeamId && validKeys.has(_selectedTeamId)) {
      sel.value = _selectedTeamId;
    } else {
      sel.value = DA_ALL_TEAMS;
      _selectedTeamId = DA_ALL_TEAMS;
    }

    if (!sel._daBound) {
      sel._daBound = true;
      sel.addEventListener('change', () => {
        const v = String(sel.value || '').trim();
        _selectedTeamId = v || DA_ALL_TEAMS;
        _monthDotsCache.clear();
        _monthSummaryCache.clear();
        _consCache.clear();
        _editUnlocked = false;
        _renderCalendar();
        const ds = _calSelected || _todayISO();
        _loadFromFirestore(ds);
        if (_perspective === 'consolidated') {
          requestAnimationFrame(() => _renderConsolidatedForCurrentMonth({ force: true }));
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
      sub.textContent = 'Auditoria e retificação de frequência — no Resumo Geral use o filtro de equipe; na visão diária, escolha um supervisor para lançar.';
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

  async function _fetchConsolidatedMonthDocs(scopeTeamId, y, m0) {
    const { startDate, endDate } = _monthStartEnd(y, m0);
    const monthYear = _monthYearStr(y, m0);
    if (typeof window._ntListDailyAttendanceDocsForDashboard === 'function') {
      const supervisorId = scopeTeamId === DA_ALL_TEAMS ? '' : String(scopeTeamId || '').trim();
      return await window._ntListDailyAttendanceDocsForDashboard({
        monthYear,
        startDate,
        endDate,
        supervisorId
      });
    }
    if (typeof window._ntListAttendanceDocsForTeam !== 'function') {
      throw new Error('Serviço indisponível: _ntListAttendanceDocsForTeam');
    }
    if (scopeTeamId === DA_ALL_TEAMS) {
      throw new Error('Serviço indisponível: _ntListDailyAttendanceDocsForDashboard');
    }
    return await window._ntListAttendanceDocsForTeam({
      teamId: scopeTeamId,
      startDate,
      endDate,
      monthYear
    });
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
    const dayDates = Array.from({ length: daysInMonth }, (_, i) =>
      `${y}-${_pad2(m0 + 1)}-${_pad2(i + 1)}`);

    // aggregations
    const agg = {};
    for (const e of filteredTeam) {
      agg[String(e.id)] = {
        id: String(e.id),
        name: e.name || '—',
        pres: 0,
        falt: 0,
        cancel: 0,
        just: 0,
        folgas: 0,
        totalKnown: 0,
        faltDates: []
      };
    }

    /** Células da tabela de assiduidade: por colaborador e dia do mês (cruzamento employee_id × date do doc). */
    const hmCells = {};
    Object.keys(agg).forEach(id => {
      hmCells[id] = dayDates.map(ds => ({
        dateStr: ds,
        slot: 'empty',
        label: 'Sem registro',
        justificativa: ''
      }));
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
        const st =
          typeof window._ntNormAttendanceStatus === 'function'
            ? window._ntNormAttendanceStatus(r.status)
            : String(r.status || '').trim().toLowerCase();

        const justTxt = String(r.justificativa || r.justification || r.notes || r.note || '').trim();

        const paintCell = (slot, label, justificativa) => {
          if (dayIdx < 0 || !hmCells[empId] || !hmCells[empId][dayIdx]) return;
          const j = String(justificativa || '').trim();
          const prevJ = String(hmCells[empId][dayIdx].justificativa || '').trim();
          hmCells[empId][dayIdx] = {
            dateStr: dayDates[dayIdx],
            slot,
            label,
            justificativa: j || prevJ
          };
        };

        if (st === 'presente') {
          agg[empId].pres += 1;
          agg[empId].totalKnown += 1;
          paintCell('presente', 'Presença confirmada', justTxt);
        } else if (st === 'falta') {
          agg[empId].falt += 1;
          agg[empId].totalKnown += 1;
          agg[empId].faltDates.push(dateStr);
          paintCell('falta', 'Falta', justTxt);
        } else if (st === 'turno_cancelado') {
          agg[empId].cancel += 1;
          agg[empId].totalKnown += 1;
          paintCell('turno_cancelado', 'Turno cancelado', justTxt);
        } else if (st === 'atestado') {
          agg[empId].just += 1;
          agg[empId].totalKnown += 1;
          paintCell('just', 'Justificada (atestado)', justTxt);
        } else if (st === 'folga') {
          agg[empId].folgas += 1;
          agg[empId].totalKnown += 1;
          paintCell('folga', 'Folga', justTxt);
        }
      }
    }

    const todayIso = _todayISO();
    Object.keys(hmCells).forEach(empId => {
      hmCells[empId].forEach((cell, i) => {
        if (cell.slot !== 'empty') return;
        const ds = cell.dateStr || dayDates[i];
        if (ds && ds > todayIso) {
          cell.slot = 'future';
          cell.label = 'Dia futuro (sem lançamento)';
        } else {
          cell.slot = 'neu';
          cell.label = 'Sem registro';
        }
      });
    });

    const rows = Object.values(agg);
    rows.forEach(r => r.faltDates.sort());

    // KPIs globais
    const totalFaltas = rows.reduce((s, r) => s + r.falt, 0);
    const totalPres = rows.reduce((s, r) => s + r.pres, 0);
    const totalCancel = rows.reduce((s, r) => s + r.cancel, 0);

    // Aproveitamento real: ((ativos * dias úteis) - faltas) / (ativos * dias úteis)
    // (Folgas, atestados e turnos cancelados não entram como falta — não reduzem este %.)
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
      assiduityTable: { dayLabels, dayDates, hmCells }
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
    const assMount = document.getElementById('da-assiduity-table-mount');
    const assHint = document.getElementById('da-assiduity-period-hint');

    const periodTitle = _ptMonthYearTitle(payload.y, payload.m0);
    if (title) title.textContent = `${periodTitle} — ${_shiftLabel(payload.shift)}`;
    if (sub) {
      const teamLabel = teamId === DA_ALL_TEAMS
        ? 'Todas as equipes'
        : _leaderLabelForTeamKey(teamId);
      sub.textContent = `Equipe: ${_safeText(teamLabel)} • Colaboradores: ${payload.ranked.length}`;
    }

    if (kF) kF.textContent = String(payload.kpis.totalFaltas || 0);
    if (kP) kP.textContent = String(payload.kpis.totalPres || 0);
    if (kC) kC.textContent = String(payload.kpis.totalCancel || 0);
    if (kA) kA.textContent = payload.kpis.aproveitamento == null ? '—' : `${payload.kpis.aproveitamento}%`;

    if (cancelCard) cancelCard.classList.toggle('is-hot', (payload.kpis.totalCancel || 0) > 0);

    if (count) count.textContent = `${payload.ranked.length} colaboradores`;

    if (tbody) {
      if (!payload.ranked.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty-cell"><i class="fas fa-circle-info"></i> Nenhum colaborador no filtro selecionado.</td></tr>`;
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
              <td>${r.folgas}</td>
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

    if (assHint) {
      assHint.textContent = `${periodTitle} • ${_shiftLabel(payload.shift)}`;
    }

    if (assMount && payload.assiduityTable) {
      const { dayLabels, dayDates, hmCells } = payload.assiduityTable;
      if (!payload.ranked.length) {
        assMount.innerHTML = `<div class="empty-cell" style="padding:20px;text-align:center;opacity:.85"><i class="fas fa-circle-info"></i> Nenhum colaborador no filtro selecionado.</div>`;
      } else {
      const headDays = dayLabels.map((d, i) =>
        `<th scope="col" class="da-assid-th-day" title="${_safeAttr(dayDates[i] || '')}">${_safeText(d)}</th>`
      ).join('');

      const bodyRows = payload.ranked.map(r => {
        const rowCells = (hmCells[String(r.id)] || []).map((cell, i) => {
          const slot = cell && cell.slot ? cell.slot : 'neu';
          const statusCls = _assiduitySlotToStatusClass(slot);
          const dateStr = (cell && cell.dateStr) || dayDates[i] || '';
          const nice = _prettyDateLongPt(dateStr);
          const statusLine = (cell && cell.label) ? String(cell.label) : '—';
          const just = (cell && cell.justificativa) ? String(cell.justificativa) : '';
          const aria = `${nice} — ${statusLine}${just ? ` — ${just}` : ''}`;
          return `<td class="da-assid-td-cell"><span class="da-assid-cell-sq ${statusCls}"
            role="img"
            aria-label="${_safeAttr(aria)}"
            data-da-date="${_safeAttr(dateStr)}"
            data-da-status="${_safeAttr(statusLine)}"
            data-da-just="${_safeAttr(just)}"></span></td>`;
        }).join('');
        return `<tr class="da-assid-tr">
          <th scope="row" class="da-assid-th-name">${_safeText(r.name)}</th>
          ${rowCells}
        </tr>`;
      }).join('');

      assMount.innerHTML = `
        <table class="da-assiduity-table" role="grid" aria-label="Frequência mensal por colaborador">
          <thead>
            <tr>
              <th scope="col" class="da-assid-th-name da-assid-th-corner">Colaborador</th>
              ${headDays}
            </tr>
          </thead>
          <tbody>${bodyRows}</tbody>
        </table>
      `;
      }
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
    sub.textContent = `${periodTitle} • Faltas: ${emp.falt} • Folgas: ${emp.folgas || 0} • Turnos cancelados: ${emp.cancel}`;

    const dates = (emp.faltDates || []).slice();
    if (!dates.length) {
      body.innerHTML = `<div class="empty-cell"><i class="fas fa-circle-check"></i> Nenhuma falta registrada no período.</div>`;
    } else {
      body.innerHTML = `
        <div class="da-modal-list">
          ${dates.map(ds => `
            <div class="da-modal-item">
              <div><strong>${_safeText(_prettyDateLongPt(ds))}</strong><div style="font-size:12px;opacity:.78">Clique para abrir e retificar o dia</div></div>
              <button type="button" class="btn-outline" data-da-open-day="${_safeText(ds)}" data-da-context-emp-id="${_safeText(emp.id)}">
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
    const scopeTeamId = _consolidatedScopeTeamId();
    const y = _calViewYear;
    const m0 = _calViewMonth0;
    const shift = _shiftFilter || 'all';

    if (!scopeTeamId || y == null || m0 == null) return;

    const cons = document.getElementById('da-consolidated');
    const tbody = document.getElementById('da-cons-tbody');
    if (!cons || !tbody) return;

    const key = _consKey(scopeTeamId, y, m0, shift);
    const cached = _consCache.get(key);
    if (!opts.force && cached && cached.payload) {
      _renderConsolidatedUi(cached.payload, scopeTeamId);
      return;
    }

    const lastDay = new Date(y, m0 + 1, 0).getDate();
    const previewTeam = _employeesForConsolidated(scopeTeamId);
    const skelRows = Math.max(4, Math.min(previewTeam.length || 8, 12));

    tbody.innerHTML = `<tr><td colspan="7" class="empty-cell"><i class="fas fa-spinner fa-spin"></i> Carregando colaboradores…</td></tr>`;
    _renderAssiduitySkeleton(skelRows, lastDay);
    try {
      // garante fonte primária de colaboradores (CSV) antes de calcular/renderizar
      await _ensureEmployeesFromCsvLoaded();
      const teamEmployees = _employeesForConsolidated(scopeTeamId);
      tbody.innerHTML = `<tr><td colspan="7" class="empty-cell"><i class="fas fa-spinner fa-spin"></i> Calculando resumo…</td></tr>`;
      _renderAssiduitySkeleton(Math.max(4, Math.min(teamEmployees.length || 8, 12)), lastDay);

      let docs = [];
      try {
        docs = await _fetchConsolidatedMonthDocs(scopeTeamId, y, m0);
      } catch (e) {
        // Se o banco falhar, seguimos com docs vazios e renderizamos o período mesmo assim.
        docs = [];
      }

      const payload = _computeConsolidatedPayload(teamEmployees, docs, y, m0, shift);
      _consCache.set(key, { teamId: scopeTeamId, y, m0, shift, computedAt: Date.now(), payload });
      _renderConsolidatedUi(payload, scopeTeamId);
    } catch (e) {
      console.error('[daily-attendance consolidated]', e);
      // Fallback final: tenta ao menos montar a UI com CSV (sem registros)
      try {
        await _ensureEmployeesFromCsvLoaded();
        const teamEmployees = _employeesForConsolidated(scopeTeamId);
        const payload = _computeConsolidatedPayload(teamEmployees, [], y, m0, shift);
        _consCache.set(key, { teamId: scopeTeamId, y, m0, shift, computedAt: Date.now(), payload });
        _renderConsolidatedUi(payload, scopeTeamId);
      } catch {
        tbody.innerHTML = `<tr><td colspan="7" class="empty-cell"><i class="fas fa-spinner fa-spin"></i> Carregando…</td></tr>`;
      }
    }
  }

  function _bindMonthStepper() {
    const prev = document.getElementById('da-month-prev');
    const next = document.getElementById('da-month-next');
    if (!prev || prev._daMonthBound) return;
    prev._daMonthBound = true;

    const bump = (delta) => {
      _shiftViewMonth(delta);
      _monthDotsCache.clear();
      _monthSummaryCache.clear();
      _consCache.clear();
      if (_perspective === 'daily') {
        _clampCalSelectedToViewMonth();
        void _renderCalendar().then(() => {
          if (_calSelected) _loadFromFirestore(_calSelected);
        });
      } else {
        void _renderCalendar().then(() => {
          requestAnimationFrame(() => _renderConsolidatedForCurrentMonth({ force: true }));
        });
      }
    };

    prev.addEventListener('click', () => bump(-1));
    next.addEventListener('click', () => bump(1));
  }

  function _ensureAssiduityFlytipBound() {
    const page = document.getElementById('page-supervisor-team-attendance');
    if (!page || page._daFlytipBound) return;
    page._daFlytipBound = true;

    page.addEventListener('mousemove', (ev) => {
      const tip = document.getElementById('da-assid-flytip');
      if (!tip) return;
      const ss = ev.target && ev.target.closest && ev.target.closest('.da-assid-cell-sq[data-da-date]');
      if (!ss || !page.contains(ss)) {
        tip.hidden = true;
        return;
      }
      const ds = ss.getAttribute('data-da-date') || '';
      const st = ss.getAttribute('data-da-status') || '';
      const j = ss.getAttribute('data-da-just') || '';
      let head = '';
      if (ds) {
        try { head = _prettyDateLongPt(ds); } catch { head = ds; }
      }
      const parts = [head, st, j].filter(Boolean);
      tip.textContent = parts.join(' — ') || '—';
      tip.hidden = false;
      tip.style.left = `${Math.min(window.innerWidth - 280, ev.clientX + 14)}px`;
      tip.style.top = `${Math.min(window.innerHeight - 56, ev.clientY + 14)}px`;
    });

    page.addEventListener('mouseleave', () => {
      const tip = document.getElementById('da-assid-flytip');
      if (tip) tip.hidden = true;
    });
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
        const teamId = _consolidatedScopeTeamId();
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
          if (_consolidatedScopeTeamId() === DA_ALL_TEAMS && _isAdminOrManager()) {
            const empId = openDay.getAttribute('data-da-context-emp-id');
            const hit = (empId && _allEmployees().find(x => String(x.id) === String(empId))) || null;
            const tk = hit ? _normLeader(hit.supervisor || hit.rhLider || '') : '';
            if (tk) {
              _selectedTeamId = tk;
              _renderTeamPicker();
            }
          }
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
    } else if (_isAdminOrManager()) {
      if (_selectedTeamId == null || String(_selectedTeamId).trim() === '') {
        _selectedTeamId = DA_ALL_TEAMS;
      }
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
    _bindMonthStepper();
    _ensureAssiduityFlytipBound();
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
    _updateMonthStepperLabel();
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

    const bulkRow = document.getElementById('da-mark-all-row');
    if (bulkRow && !bulkRow._daBulkBound) {
      bulkRow._daBulkBound = true;
      bulkRow.addEventListener('click', (ev) => {
        const t = ev.target && ev.target.closest ? ev.target.closest('[data-da-bulk]') : null;
        if (!t || bulkRow.contains(t) === false) return;
        const v = t.getAttribute('data-da-bulk');
        if (v) bulkApplyStatus(v);
      });
    }
  };
})();
