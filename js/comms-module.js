/* =============================================
   COMMS-MODULE.JS — Comunicados Internos
   Central de Comunicação Interna (formal, sem chat)
   - Envio direcionado (todos / perfil / equipe / usuário)
   - Visibilidade por usuário (admin vê tudo)
   - Status lido/não lido por destinatário
   Persistência: localStorage + compatível com arquitetura atual
============================================= */

(function() {
  'use strict';

  const STORAGE_KEY = 'nt_comms_v2';
  const LEGACY_KEY  = 'nt_comms_v1';

  const PRIORITIES = [
    { key: 'alta',  label: 'Alta',  badgeClass: 'badge-danger',  icon: 'fa-exclamation-circle' },
    { key: 'media', label: 'Média', badgeClass: 'badge-warning', icon: 'fa-flag' },
    { key: 'baixa', label: 'Baixa', badgeClass: 'badge-info',    icon: 'fa-info-circle' },
  ];

  const ROLE_LABELS = {
    admin: 'Administrador',
    manager: 'Gerente',
    supervisor: 'Supervisor',
    boss: 'Diretor',
    rh: 'RH',
  };

  const state = {
    filter: 'all', // all | unread | high | mine
    userSearch: '',
    selectedUsers: new Set(),
    selectedRoles: new Set(),
    selectedTeams: new Set(),
    activeSendType: 'all', // all | role | team | user
    lastUserSearchResults: [],
  };

  function _toast(msg, type = 'success') {
    if (window._ntShowToast) window._ntShowToast(msg, type);
  }

  function _escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function _nowISODate() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function _formatBrDateTime(ts) {
    if (!ts) return '';
    try {
      return new Date(ts).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
    } catch {
      return String(ts);
    }
  }

  function _formatBrDate(iso) {
    if (!iso) return '';
    const [y, m, d] = String(iso).split('-');
    if (!y || !m || !d) return String(iso);
    return `${d}/${m}/${y}`;
  }

  function _isAdminView() {
    return window.currentUser?.role === 'admin';
  }

  function _canCreate() {
    const role = window.currentUser?.role;
    return role === 'admin' || role === 'boss' || role === 'manager' || role === 'rh';
  }

  function _uid(prefix = 'comm') {
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function _loadRaw(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  /** Mescla mapas readBy (mesmo e-mail: mantém o timestamp mais recente). */
  function _mergeReadBy(a, b) {
    const out = { ...(a || {}), ...(b || {}) };
    const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
    for (const k of keys) {
      const va = a && a[k];
      const vb = b && b[k];
      if (va != null && vb != null) out[k] = Math.max(Number(va), Number(vb));
      else out[k] = va != null ? va : vb;
    }
    return out;
  }

  function _mergeCommRecords(local, cloud) {
    return {
      ...local,
      ...cloud,
      readBy: _mergeReadBy(local && local.readBy, cloud && cloud.readBy),
    };
  }

  function _loadFromLocalStorageOnly() {
    const list = _loadRaw(STORAGE_KEY);
    if (Array.isArray(list)) return list;

    const legacy = _loadRaw(LEGACY_KEY);
    if (Array.isArray(legacy) && legacy.length) {
      const migrated = legacy.map(x => _migrateLegacy(x)).filter(Boolean);
      _saveAllToLocal(migrated);
      return migrated;
    }
    return [];
  }

  function _loadAll() {
    const fromLocal = _loadFromLocalStorageOnly();
    const fromCloud = (window._cache && Array.isArray(window._cache.internalComms))
      ? window._cache.internalComms
      : [];

    if (!fromCloud.length) {
      console.log('[Comms DEBUG] _loadAll: fonte=localStorage apenas, count=', fromLocal.length);
      return fromLocal;
    }

    const byId = new Map();
    for (const c of fromLocal) {
      if (c && c.id) byId.set(c.id, c);
    }
    for (const c of fromCloud) {
      if (!c || !c.id) continue;
      const ex = byId.get(c.id);
      if (!ex) byId.set(c.id, c);
      else byId.set(c.id, _mergeCommRecords(ex, c));
    }
    console.log('[Comms DEBUG] _loadAll: local=', fromLocal.length, 'cloud=', fromCloud.length, 'merged unique=', byId.size);
    return Array.from(byId.values());
  }

  function _saveAllToLocal(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.error('Erro ao salvar comunicados:', e);
      _toast('Erro ao salvar comunicado.', 'error');
    }
  }

  function _saveAll(list) {
    _saveAllToLocal(list);
  }

  function _migrateLegacy(c) {
    if (!c || typeof c !== 'object') return null;
    return {
      id: c.id || _uid('comm'),
      title: c.title || '',
      message: c.message || '',
      priority: (c.priority || 'media'),
      date: c.date || _nowISODate(),
      createdAt: Number(c.createdAt || Date.now()),
      authorEmail: c.authorEmail || '',
      authorName: c.authorName || '',
      authorRole: c.authorRole || '',
      destinationType: 'all',
      recipients: { all: true },
      readBy: {},
    };
  }

  function _getSearchTerm() {
    const el = document.getElementById('comms-search');
    return (el?.value || '').trim().toLowerCase();
  }

  function _getUsers() {
    const cached = window._cache?.users;
    if (cached && cached.length) return cached;

    try {
      const saved = localStorage.getItem('nt_users_custom');
      const custom = saved ? JSON.parse(saved) : [];
      const demo = (window.DEMO_USERS || []).map(u => ({
        id: 'demo-' + u.email.replace(/[@.]/g, '_'),
        email: u.email,
        name: u.name,
        role: u.role,
        active: true,
        isDemo: true,
      }));
      const demoFiltered = demo.filter(d => !custom.find(c => c.email === d.email));
      const merged = [...demoFiltered, ...custom];
      return merged.filter(u => u && u.email);
    } catch {
      return (window.DEMO_USERS || []).map(u => ({ email: u.email, name: u.name, role: u.role, active: true }));
    }
  }

  function _getTeams() {
    const teams = window._cache?.teams;
    if (Array.isArray(teams)) return teams;
    return [];
  }

  function _recipientLabel(c) {
    const t = c?.destinationType || 'all';
    const r = c?.recipients || {};
    if (t === 'all') return 'Todos';
    if (t === 'role') {
      const roles = Array.isArray(r.roles) ? r.roles : [];
      if (!roles.length) return 'Perfis (não definido)';
      return roles.map(ro => ROLE_LABELS[ro] || ro).join(', ');
    }
    if (t === 'team') {
      const teams = Array.isArray(r.teams) ? r.teams : [];
      if (!teams.length) return 'Equipes (não definido)';
      const allTeams = _getTeams();
      const names = teams.map(id => allTeams.find(t2 => t2.id === id)?.nome || allTeams.find(t2 => t2.id === id)?.lider || id);
      return names.join(', ');
    }
    if (t === 'user') {
      const users = Array.isArray(r.users) ? r.users : [];
      if (!users.length) return 'Usuários (não definido)';
      const allUsers = _getUsers();
      const names = users.map(email => allUsers.find(u => u.email === email)?.name || email);
      return names.join(', ');
    }
    return '—';
  }

  function _isVisibleToCurrentUser(c) {
    if (!c) return false;
    if (_isAdminView()) return true;

    const meEmail = window.currentUser?.email;
    const meRole  = window.currentUser?.role;
    if (!meEmail) return false;

    const t = c.destinationType || 'all';
    const r = c.recipients || {};

    if (t === 'all') return true;
    if (t === 'role') {
      const roles = Array.isArray(r.roles) ? r.roles : [];
      return roles.includes(meRole);
    }
    if (t === 'user') {
      const users = Array.isArray(r.users) ? r.users : [];
      return users.includes(meEmail);
    }
    if (t === 'team') {
      const teams = Array.isArray(r.teams) ? r.teams : [];
      if (!teams.length) return false;
      const allTeams = _getTeams();
      const meName = String(window.currentUser?.name || '').trim().toLowerCase();
      const team = allTeams.find(t2 => (t2.membros || []).some(m => {
        const em = String(m.email || '').trim().toLowerCase();
        if (em && em === String(meEmail).trim().toLowerCase()) return true;
        const nm = String(m.nome || '').trim().toLowerCase();
        return meName && nm && nm === meName;
      }));
      if (!team) return false;
      return teams.includes(team.id);
    }
    return false;
  }

  function _isReadByMe(c) {
    const me = window.currentUser?.email;
    if (!me) return false;
    if (_isAdminView()) return false;
    return !!(c.readBy && c.readBy[me]);
  }

  function _markAsRead(id) {
    const me = window.currentUser?.email;
    if (!me) return;
    const all = _loadAll();
    const idx = all.findIndex(x => x.id === id);
    if (idx < 0) return;
    const c = all[idx];
    if (!c.readBy) c.readBy = {};
    if (c.readBy[me]) return;
    c.readBy[me] = Date.now();
    all[idx] = c;
    _saveAll(all);
    if (window._ntPersistInternalComm) window._ntPersistInternalComm(c);
  }

  function _sort(list) {
    return list.slice().sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  }

  function _applyFilters(list) {
    const q = _getSearchTerm();
    const beforeSearch = list.length;
    let out = list;
    if (q) {
      out = out.filter(c => {
        const hay = `${c.title || ''} ${c.message || ''} ${c.priority || ''} ${c.date || ''} ${c.authorName || ''} ${c.authorEmail || ''}`.toLowerCase();
        return hay.includes(q);
      });
      if (out.length !== beforeSearch) {
        console.log('[Comms DEBUG] filtro busca: antes=', beforeSearch, 'depois=', out.length, 'termo=', q);
      }
    }

    const afterSearch = out.length;
    if (state.filter === 'unread') {
      out = out.filter(c => _isVisibleToCurrentUser(c) && !_isReadByMe(c));
    } else if (state.filter === 'high') {
      out = out.filter(c => (c.priority || '') === 'alta');
    } else if (state.filter === 'mine') {
      const me = window.currentUser?.email;
      out = out.filter(c => (c.authorEmail || '') === (me || ''));
    }
    if (state.filter !== 'all' && out.length !== afterSearch) {
      console.log('[Comms DEBUG] filtro chip: modo=', state.filter, 'antes=', afterSearch, 'depois=', out.length);
    }
    return out;
  }

  function _visibleList() {
    const all = _loadAll();
    const visible = _isAdminView() ? all : all.filter(_isVisibleToCurrentUser);
    if (!_isAdminView() && visible.length !== all.length) {
      console.log('[Comms DEBUG] visibilidade (não-admin): total carregado=', all.length, 'visível ao usuário=', visible.length);
    }
    return _sort(visible);
  }

  function _renderKpis() {
    const el = document.getElementById('comms-kpis');
    if (!el) return;
    const today = _nowISODate();
    const list = _visibleList();

    const total = list.length;
    const unread = _isAdminView() ? 0 : list.filter(c => !_isReadByMe(c)).length;
    const high = list.filter(c => (c.priority || '') === 'alta').length;
    const todayCount = list.filter(c => (c.date || '') === today).length;

    el.innerHTML = `
      <div class="stat-card blue">
        <div class="stat-icon"><i class="fas fa-inbox"></i></div>
        <div class="stat-info"><span class="stat-value">${total}</span><span class="stat-label">Total</span></div>
      </div>
      <div class="stat-card orange">
        <div class="stat-icon"><i class="fas fa-envelope-open-text"></i></div>
        <div class="stat-info"><span class="stat-value">${unread}</span><span class="stat-label">Não lidos</span></div>
      </div>
      <div class="stat-card red" style="background:linear-gradient(135deg,#DC2626,#B91C1C)">
        <div class="stat-icon"><i class="fas fa-exclamation-triangle"></i></div>
        <div class="stat-info"><span class="stat-value">${high}</span><span class="stat-label">Alta prioridade</span></div>
      </div>
      <div class="stat-card green">
        <div class="stat-icon"><i class="fas fa-calendar-day"></i></div>
        <div class="stat-info"><span class="stat-value">${todayCount}</span><span class="stat-label">Enviados hoje</span></div>
      </div>
    `;
  }

  function _renderFilterChips() {
    const chips = document.querySelectorAll('.comms-filter-chip');
    chips.forEach(btn => {
      const f = btn.getAttribute('data-filter');
      btn.classList.toggle('active', f === state.filter);
    });
  }

  function _renderList() {
    const listEl = document.getElementById('comms-list');
    if (!listEl) return;

    const visible = _visibleList();
    const filtered = _applyFilters(visible);
    console.log('[Comms DEBUG] render lista: visíveis=', visible.length, 'após filtros=', filtered.length, 'chip=', state.filter);

    if (!filtered.length) {
      listEl.innerHTML = `
        <div class="recent-card" style="padding:16px">
          <h3><i class="fas fa-bullhorn"></i> Nenhum comunicado</h3>
          <div style="color:var(--text-secondary);font-size:13px;margin-top:6px">
            Não há comunicados para exibir com os filtros atuais.
          </div>
        </div>
      `;
      return;
    }

    const rows = filtered.map(c => {
      const pr = PRIORITIES.find(p => p.key === c.priority) || PRIORITIES[1];
      const prBadge = `<span class="purch-badge ${pr.badgeClass}"><i class="fas ${pr.icon}" style="margin-right:6px"></i>${_escapeHtml(pr.label)}</span>`;
      const recipient = _escapeHtml(_recipientLabel(c));
      const sender = _escapeHtml(c.authorName || 'Sistema');
      const dt = _escapeHtml(_formatBrDate(c.date || _nowISODate()));
      const title = _escapeHtml(c.title || '(sem título)');
      const isUnread = !_isAdminView() && !_isReadByMe(c);
      const status = _isAdminView()
        ? `<span class="purch-badge badge-primary">Admin · visível</span>`
        : (isUnread ? `<span class="purch-badge badge-warning">Não lido</span>` : `<span class="purch-badge badge-success">Lido</span>`);

      return `
        <tr class="${isUnread ? 'comms-row-unread' : ''}">
          <td>
            <div class="comms-title-cell">
              <div class="comms-title">${title}</div>
              <div class="comms-sub">${_escapeHtml(String(c.message || '').slice(0, 96))}${(c.message || '').length > 96 ? '…' : ''}</div>
            </div>
          </td>
          <td>${sender}</td>
          <td style="white-space:nowrap">${dt}</td>
          <td style="white-space:nowrap">${prBadge}</td>
          <td class="comms-recipient-cell" title="${recipient}">${recipient}</td>
          <td style="white-space:nowrap">${status}</td>
          <td style="white-space:nowrap">
            <button class="btn-icon" title="Abrir" onclick="window._commsOpenItem && window._commsOpenItem('${c.id}')">
              <i class="fas fa-eye"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    listEl.innerHTML = `
      <div class="table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>Título</th>
              <th>Remetente</th>
              <th>Data</th>
              <th>Prioridade</th>
              <th>Destinatário</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  function _closeModal(id) {
    document.getElementById(id)?.remove();
  }

  function _renderSendTargetsArea() {
    const wrap = document.getElementById('comms-targets-wrap');
    if (!wrap) return;

    const sendType = document.getElementById('comms-send-type')?.value || 'all';
    state.activeSendType = sendType;

    if (sendType === 'all') {
      wrap.innerHTML = `
        <div class="info-box" style="margin:0">
          <i class="fas fa-users"></i>
          <div>
            <div style="font-weight:700">Envio para todos</div>
            <div style="opacity:.9">O comunicado ficará disponível para todos os usuários com acesso ao módulo.</div>
          </div>
        </div>
      `;
      return;
    }

    if (sendType === 'role') {
      const roles = ['admin','manager','supervisor','boss','rh'];
      wrap.innerHTML = `
        <div style="display:grid;gap:10px">
          <div style="font-size:13px;color:var(--text-secondary)">
            Selecione os perfis que devem receber este comunicado.
          </div>
          <div class="comms-checkgrid">
            ${roles.map(r => `
              <label class="comms-check">
                <input type="checkbox" value="${r}" onchange="window._commsToggleRole && window._commsToggleRole('${r}', this.checked)" ${state.selectedRoles.has(r) ? 'checked' : ''}>
                <span><strong>${_escapeHtml(ROLE_LABELS[r] || r)}</strong><small>${_escapeHtml(r)}</small></span>
              </label>
            `).join('')}
          </div>
        </div>
      `;
      return;
    }

    if (sendType === 'team') {
      const teams = _getTeams();
      if (!teams.length) {
        wrap.innerHTML = `
          <div class="info-box" style="margin:0;background:#FEF3C7;border-color:#FDE68A;color:#92400E">
            <i class="fas fa-exclamation-triangle"></i>
            <div>
              <div style="font-weight:700">Nenhuma equipe cadastrada</div>
              <div style="opacity:.9">Cadastre equipes em “Equipes de Produção” para enviar por equipe.</div>
            </div>
          </div>
        `;
        return;
      }
      wrap.innerHTML = `
        <div style="display:grid;gap:10px">
          <div style="font-size:13px;color:var(--text-secondary)">
            Selecione uma ou mais equipes de produção.
          </div>
          <div class="comms-checklist">
            ${teams
              .slice()
              .sort((a,b) => String(a.nome||'').localeCompare(String(b.nome||'')))
              .map(t => `
                <label class="comms-checkrow">
                  <input type="checkbox" value="${t.id}" onchange="window._commsToggleTeam && window._commsToggleTeam('${t.id}', this.checked)" ${state.selectedTeams.has(t.id) ? 'checked' : ''}>
                  <span class="comms-checkrow-main">
                    <strong>${_escapeHtml(t.nome || 'Equipe')}</strong>
                    <small>${_escapeHtml(t.lider ? `Líder: ${t.lider}` : '')}</small>
                  </span>
                  <span class="purch-badge badge-primary">${(t.membros || []).length} membros</span>
                </label>
              `).join('')}
          </div>
        </div>
      `;
      return;
    }

    if (sendType === 'user') {
      wrap.innerHTML = `
        <div style="display:grid;gap:10px">
          <div style="font-size:13px;color:var(--text-secondary)">
            Busque e selecione usuários específicos. Apenas os selecionados verão o comunicado.
          </div>

          <div class="search-bar" style="margin:0">
            <i class="fas fa-search"></i>
            <input type="text" id="comms-user-search" placeholder="Buscar por nome ou e-mail..."
              oninput="window._commsSearchUsers && window._commsSearchUsers(this.value)">
          </div>

          <div id="comms-user-results" class="comms-user-results"></div>

          <div>
            <div style="font-size:12px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px;margin:10px 0 8px">
              Selecionados (${state.selectedUsers.size})
            </div>
            <div id="comms-user-selected" class="comms-user-selected"></div>
          </div>
        </div>
      `;
      _renderUserSelected();
      _renderUserResults('');
      return;
    }

    wrap.innerHTML = '';
  }

  function _renderUserResults(q) {
    const el = document.getElementById('comms-user-results');
    if (!el) return;
    const query = String(q || '').trim().toLowerCase();
    const users = _getUsers().filter(u => u.active !== false);
    let results = users;
    if (query) {
      results = users.filter(u => String(u.name || '').toLowerCase().includes(query) || String(u.email || '').toLowerCase().includes(query));
    }
    results = results.slice(0, 12);
    state.lastUserSearchResults = results;

    if (!results.length) {
      el.innerHTML = `<div class="comms-empty-mini">Nenhum usuário encontrado.</div>`;
      return;
    }

    el.innerHTML = results.map(u => {
      const checked = state.selectedUsers.has(u.email);
      return `
        <label class="comms-user-row">
          <input type="checkbox" ${checked ? 'checked' : ''} onchange="window._commsToggleUser && window._commsToggleUser('${_escapeHtml(u.email)}', this.checked)">
          <span class="comms-user-meta">
            <strong>${_escapeHtml(u.name || u.email)}</strong>
            <small>${_escapeHtml(u.email)} · ${_escapeHtml(ROLE_LABELS[u.role] || u.role || '')}</small>
          </span>
        </label>
      `;
    }).join('');
  }

  function _renderUserSelected() {
    const el = document.getElementById('comms-user-selected');
    if (!el) return;
    const users = _getUsers();
    const selected = Array.from(state.selectedUsers);
    if (!selected.length) {
      el.innerHTML = `<div class="comms-empty-mini">Nenhum usuário selecionado.</div>`;
      return;
    }
    el.innerHTML = `
      <div class="comms-selected-pills">
        ${selected.map(email => {
          const u = users.find(x => x.email === email);
          const name = u?.name || email;
          return `<span class="comms-pill" title="${_escapeHtml(email)}">
            ${_escapeHtml(name)}
            <button type="button" aria-label="Remover" onclick="window._commsToggleUser && window._commsToggleUser('${_escapeHtml(email)}', false)">×</button>
          </span>`;
        }).join('')}
      </div>
    `;
  }

  function _openNewModal() {
    if (!_canCreate()) return;

    state.selectedUsers = new Set();
    state.selectedRoles = new Set();
    state.selectedTeams = new Set();
    state.activeSendType = 'all';

    const html = `
      <div class="modal-overlay" id="comms-new-modal">
        <div class="modal" style="max-width:760px;width:calc(100% - 32px)">
          <div class="modal-header">
            <h3><i class="fas fa-bullhorn"></i> Novo comunicado</h3>
            <button class="modal-close" onclick="document.getElementById('comms-new-modal').remove()">×</button>
          </div>
          <div class="modal-body" style="padding:24px">
            <div class="info-box" style="margin-bottom:16px">
              <i class="fas fa-shield-alt"></i>
              <div>
                <div style="font-weight:700">Formato formal (sem chat)</div>
                <div style="opacity:.9">Use comunicados para orientações, políticas, procedimentos e atualizações internas.</div>
              </div>
            </div>

            <div class="form-group">
              <label><i class="fas fa-heading"></i> Título <span class="required">*</span></label>
              <input type="text" id="comms-new-title" placeholder="Ex.: Atualização de procedimento de produção" />
            </div>

            <div class="form-group">
              <label><i class="fas fa-align-left"></i> Mensagem <span class="required">*</span></label>
              <textarea id="comms-new-message" rows="6" placeholder="Escreva o comunicado de forma clara e objetiva..."></textarea>
            </div>

            <div class="form-row" style="grid-template-columns:1fr 1fr;gap:12px">
              <div class="form-group" style="margin-bottom:0">
                <label><i class="fas fa-flag"></i> Prioridade</label>
                <select id="comms-new-priority">
                  <option value="baixa">Baixa</option>
                  <option value="media" selected>Média</option>
                  <option value="alta">Alta</option>
                </select>
              </div>
              <div class="form-group" style="margin-bottom:0">
                <label><i class="fas fa-calendar"></i> Data</label>
                <input type="date" id="comms-new-date" value="${_nowISODate()}" />
              </div>
            </div>

            <div style="margin-top:16px">
              <div style="display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap">
                <div class="form-group" style="flex:1;min-width:220px;margin-bottom:0">
                  <label><i class="fas fa-paper-plane"></i> Tipo de envio</label>
                  <select id="comms-send-type" onchange="window._commsRenderTargets && window._commsRenderTargets()">
                    <option value="all">Todos</option>
                    <option value="role">Por perfil</option>
                    <option value="team">Por equipe</option>
                    <option value="user">Por usuário</option>
                  </select>
                </div>
                <div style="font-size:12px;color:var(--text-secondary);min-width:220px">
                  O destinatário define quem verá o comunicado na central.
                </div>
              </div>

              <div id="comms-targets-wrap" style="margin-top:12px"></div>
            </div>
          </div>
          <div class="modal-footer" style="padding:16px 24px;border-top:1px solid var(--border)">
            <button class="btn-outline" onclick="document.getElementById('comms-new-modal').remove()">Cancelar</button>
            <button class="btn-primary" onclick="window._commsSubmitNew && window._commsSubmitNew()">
              <i class="fas fa-paper-plane"></i> Enviar comunicado
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
    _renderSendTargetsArea();
    document.getElementById('comms-new-title')?.focus();
  }

  function _validateRecipients() {
    const sendType = document.getElementById('comms-send-type')?.value || 'all';
    if (sendType === 'all') return { ok: true, destinationType: 'all', recipients: { all: true } };
    if (sendType === 'role') {
      const roles = Array.from(state.selectedRoles);
      if (!roles.length) return { ok: false, msg: 'Selecione pelo menos um perfil.' };
      return { ok: true, destinationType: 'role', recipients: { roles } };
    }
    if (sendType === 'team') {
      const teams = Array.from(state.selectedTeams);
      if (!teams.length) return { ok: false, msg: 'Selecione pelo menos uma equipe.' };
      return { ok: true, destinationType: 'team', recipients: { teams } };
    }
    if (sendType === 'user') {
      const users = Array.from(state.selectedUsers);
      if (!users.length) return { ok: false, msg: 'Selecione pelo menos um usuário.' };
      return { ok: true, destinationType: 'user', recipients: { users } };
    }
    return { ok: false, msg: 'Tipo de envio inválido.' };
  }

  function _submitNew() {
    if (!_canCreate()) return;

    const title = document.getElementById('comms-new-title')?.value.trim();
    const message = document.getElementById('comms-new-message')?.value.trim();
    const priority = document.getElementById('comms-new-priority')?.value || 'media';
    const date = document.getElementById('comms-new-date')?.value || _nowISODate();

    if (!title || !message) {
      _toast('Informe título e mensagem.', 'warning');
      return;
    }

    const rec = _validateRecipients();
    if (!rec.ok) {
      _toast(rec.msg || 'Selecione destinatários.', 'warning');
      return;
    }

    const item = {
      id: _uid('comm'),
      title,
      message,
      priority,
      date,
      createdAt: Date.now(),
      authorEmail: window.currentUser?.email || '',
      authorName: window.currentUser?.name || '',
      authorRole: window.currentUser?.role || '',
      destinationType: rec.destinationType,
      recipients: rec.recipients,
      readBy: {},
    };

    const all = _loadAll();
    all.push(item);
    _saveAll(all);
    console.log('[Comms DEBUG] envio: salvo em localStorage (', STORAGE_KEY, ') + notificações via _ntNotifyCommsPublished → in_app_notifications');
    if (window._ntPersistInternalComm) {
      window._ntPersistInternalComm(item);
    }

    _closeModal('comms-new-modal');
    _renderAll();
    _toast('Comunicado enviado.', 'success');
    if (window._ntNotifyCommsPublished) {
      try { window._ntNotifyCommsPublished(item); } catch (e) { console.warn(e); }
    }
  }

  function _openItem(id) {
    const all = _loadAll();
    const c = all.find(x => x.id === id);
    if (!c) return;

    if (!_isAdminView()) _markAsRead(id);

    const pr = PRIORITIES.find(p => p.key === c.priority) || PRIORITIES[1];
    const prBadge = `<span class="purch-badge ${pr.badgeClass}"><i class="fas ${pr.icon}" style="margin-right:6px"></i>${_escapeHtml(pr.label)}</span>`;
    const recipient = _escapeHtml(_recipientLabel(c));
    const sender = _escapeHtml(c.authorName || 'Sistema');
    const senderRole = _escapeHtml(ROLE_LABELS[c.authorRole] || c.authorRole || '');
    const dt = _escapeHtml(_formatBrDateTime(c.createdAt));

    const html = `
      <div class="modal-overlay" id="comms-view-modal">
        <div class="modal" style="max-width:780px;width:calc(100% - 32px)">
          <div class="modal-header">
            <h3><i class="fas fa-envelope-open-text"></i> Comunicado</h3>
            <button class="modal-close" onclick="document.getElementById('comms-view-modal').remove()">×</button>
          </div>
          <div class="modal-body" style="padding:24px">
            <div class="comms-view-head">
              <div>
                <div class="comms-view-title">${_escapeHtml(c.title || '(sem título)')}</div>
                <div class="comms-view-meta">
                  <span><i class="fas fa-user"></i> ${sender}${senderRole ? ` (${senderRole})` : ''}</span>
                  <span>•</span>
                  <span><i class="fas fa-clock"></i> ${dt}</span>
                </div>
              </div>
              <div class="comms-view-badges">
                ${prBadge}
                <span class="purch-badge badge-primary" title="${recipient}"><i class="fas fa-users" style="margin-right:6px"></i>${recipient}</span>
              </div>
            </div>

            <div class="comms-view-body">${_escapeHtml(c.message || '').replace(/\n/g, '<br/>')}</div>
          </div>
          <div class="modal-footer" style="padding:16px 24px;border-top:1px solid var(--border);justify-content:space-between">
            <div style="font-size:12px;color:var(--text-secondary)">
              ${_isAdminView() ? 'Admin: você visualiza todos os comunicados.' : 'Ao abrir, este comunicado foi marcado como lido.'}
            </div>
            <button class="btn-primary" onclick="document.getElementById('comms-view-modal').remove(); window._commsRender && window._commsRender();">
              Fechar
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    _renderAll();
  }

  function _renderAll() {
    _renderFilterChips();
    _renderKpis();
    _renderList();
  }

  // ─── API pública (mantém arquitetura atual) ───
  window._commsSetFilter = function(filter) {
    state.filter = filter || 'all';
    _renderAll();
  };

  window._commsOpenNew = function() {
    _openNewModal();
  };

  window._commsSubmitNew = function() {
    _submitNew();
  };

  window._commsRenderTargets = function() {
    _renderSendTargetsArea();
  };

  window._commsToggleUser = function(email, checked) {
    const e = String(email || '').trim();
    if (!e) return;
    if (checked) state.selectedUsers.add(e);
    else state.selectedUsers.delete(e);
    _renderUserSelected();
    const q = document.getElementById('comms-user-search')?.value || '';
    _renderUserResults(q);
  };

  window._commsSearchUsers = function(q) {
    _renderUserResults(q);
  };

  window._commsToggleRole = function(role, checked) {
    const r = String(role || '').trim();
    if (!r) return;
    if (checked) state.selectedRoles.add(r);
    else state.selectedRoles.delete(r);
  };

  window._commsToggleTeam = function(teamId, checked) {
    const t = String(teamId || '').trim();
    if (!t) return;
    if (checked) state.selectedTeams.add(t);
    else state.selectedTeams.delete(t);
  };

  window._commsOpenItem = function(id) {
    _openItem(id);
  };

  window._commsRender = function() {
    _renderAll();
  };

  window._commsRenderPage = function() {
    const btnNew = document.getElementById('comms-btn-new');
    if (btnNew) btnNew.style.display = _canCreate() ? '' : 'none';
    if (!_canCreate() && btnNew) btnNew.setAttribute('title', 'Apenas Admin/Gerência/RH/Direção podem enviar comunicados.');
    _renderAll();
  };

  console.log('✅ Comunicação Interna carregada.');
})();

