/* =============================================
   DAILY-ATTENDANCE-MODULE — Frequência da Equipe
   Supervisor: lançamento diário (Firestore daily_attendance)
   Não altera employee_events nem portal do colaborador.
============================================= */

(function () {
  const STATUS_OPTIONS = [
    { value: 'pending', label: 'Não definido' },
    { value: 'presente', label: 'Presente' },
    { value: 'falta', label: 'Falta' },
    { value: 'folga', label: 'Folga' },
    { value: 'turno_cancelado', label: 'Turno cancelado' },
    { value: 'atestado', label: 'Atestado' }
  ];

  /** @type {{ teamId: string, dateStr: string, docExists: boolean, rows: Array<{employeeId:string,name:string,status:string}> } | null} */
  let _state = null;

  function _getMyTeam() {
    const employees = window.getEmployees ? window.getEmployees() : [];
    const u = window.currentUser;
    if (!u || u.role !== 'supervisor') return [];
    return employees
      .filter(e => e.supervisor === u.email)
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'));
  }

  function _teamId() {
    const u = window.currentUser;
    return u ? String(u.email || '').trim() : '';
  }

  function _todayISO() {
    return new Date().toISOString().split('T')[0];
  }

  function _mergeRecords(existingRecords, team) {
    const byId = {};
    (existingRecords || []).forEach(r => {
      if (r && r.employeeId) byId[String(r.employeeId)] = String(r.status || 'pending');
    });
    return team.map(e => ({
      employeeId: e.id,
      name: e.name || '—',
      status: byId[e.id] !== undefined ? byId[e.id] : 'pending'
    }));
  }

  async function _loadFromFirestore(dateStr) {
    const team = _getMyTeam();
    const teamId = _teamId();
    const tbody = document.getElementById('da-attendance-tbody');
    const hint = document.getElementById('da-doc-hint');
    if (!tbody) return;

    if (!team.length) {
      tbody.innerHTML = '<tr><td colspan="2" class="empty-cell"><i class="fas fa-users-slash"></i> Nenhum colaborador na sua equipe</td></tr>';
      _state = { teamId, dateStr, docExists: false, rows: [] };
      if (hint) hint.textContent = '';
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

    const rows = _mergeRecords(existing && existing.records, team);
    _state = { teamId, dateStr, docExists, rows };

    if (hint) {
      hint.textContent = docExists
        ? 'Registro existente para este dia — você pode editar e salvar novamente.'
        : 'Nenhum registro para este dia — defina a situação de cada colaborador e salve.';
    }

    tbody.innerHTML = rows
      .map((r, i) => {
        const opts = STATUS_OPTIONS.map(
          o => `<option value="${o.value}"${r.status === o.value ? ' selected' : ''}>${o.label}</option>`
        ).join('');
        const initials =
          typeof getInitials === 'function'
            ? getInitials(r.name)
            : (r.name || '?')
                .split(/\s+/)
                .map(p => p[0])
                .join('')
                .slice(0, 2)
                .toUpperCase();
        return `<tr data-employee-id="${r.employeeId}">
      <td>
        <div class="emp-name-cell">
          <div class="emp-avatar-sm">${initials}</div>
          <div><div class="emp-name">${r.name}</div></div>
        </div>
      </td>
      <td>
        <select class="da-status-select" data-row="${i}" aria-label="Situação de ${r.name.replace(/"/g, '&quot;')}">${opts}</select>
      </td>
    </tr>`;
      })
      .join('');

    tbody.querySelectorAll('select.da-status-select').forEach(sel => {
      sel.addEventListener('change', () => {
        const idx = parseInt(sel.getAttribute('data-row'), 10);
        if (_state && _state.rows[idx]) _state.rows[idx].status = sel.value;
      });
    });
  }

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

  async function _save() {
    const u = window.currentUser;
    if (!u || !_state) return;

    const dateInput = document.getElementById('da-attendance-date');
    const dateStr = (dateInput && dateInput.value) || _state.dateStr;
    const teamId = _teamId();
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
        isNew: !_state.docExists
      });
      _state.docExists = true;
      _state.dateStr = dateStr;
      const hint = document.getElementById('da-doc-hint');
      if (hint) hint.textContent = 'Registro salvo — você pode alterar e salvar novamente a qualquer momento.';
      if (window._ntShowToast) window._ntShowToast('Frequência do dia salva com sucesso.', 'success');
    } catch (e) {
      console.error(e);
      const msg = e && e.message ? e.message : 'Erro ao salvar frequência.';
      if (window._ntShowToast) window._ntShowToast(msg, 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  window._dailyAttendanceRenderPage = function () {
    const u = window.currentUser;
    if (!u || u.role !== 'supervisor') {
      if (window.navigateTo) window.navigateTo('supervisor-home');
      return;
    }

    const dateInput = document.getElementById('da-attendance-date');
    if (dateInput && !dateInput._daBound) {
      dateInput._daBound = true;
      dateInput.value = _todayISO();
      dateInput.addEventListener('change', () => {
        const v = dateInput.value;
        if (v) _loadFromFirestore(v);
      });
    } else if (dateInput && !dateInput.value) {
      dateInput.value = _todayISO();
    }

    const initial = (dateInput && dateInput.value) || _todayISO();
    _loadFromFirestore(initial);

    const saveBtn = document.getElementById('da-save-btn');
    if (saveBtn && !saveBtn._daBound) {
      saveBtn._daBound = true;
      saveBtn.addEventListener('click', () => _save());
    }
  };

})();
