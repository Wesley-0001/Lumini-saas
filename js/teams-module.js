/* =============================================
   TEAMS-MODULE.JS — Cadastro de Equipes de Produção
   Lumini — Gestão de Equipes
   
   Escopo: Apenas Setor de Produção
   Fonte dos membros: Banco de dados RH (rh-data.js)
   Supervisores no sistema (logins sup1–sup4@lumini): Daniel, Kauê, Toni, Hélcio.
   Demais perfis: gerente, diretor, administradores — ver DEMO_USERS (data.js).
   Líderes de campo no RH são mapeados em app.js (RH_LIDER_TO_SUPERVISOR).
============================================= */

/* ─── ESTADO LOCAL ─────────────────────────── */
let _teamsFilter = { search: '', lider: '' };
let _teamsPage   = 0;
const _TEAMS_PAGE_SIZE = 10;

/* ─── HELPERS ──────────────────────────────── */
function _teamsGetAll() {
  return (window._cache && window._cache.teams) ? window._cache.teams : [];
}

function _teamsSave(arr) {
  if (window._cache) window._cache.teams = arr;
  if (window.persistTeams) window.persistTeams(arr);
}

function _rhEmployees() {
  return window.getHREmployees ? window.getHREmployees() : (window.HR_EMPLOYEES_SEED || []);
}

function _productionEmployees() {
  return _rhEmployees().filter(e => e.setor === 'Produção');
}

function _productionLeaders() {
  const emps = _productionEmployees();
  const leaders = [...new Set(emps.map(e => e.lider).filter(Boolean))].sort();
  return leaders;
}

function _activeProductionEmployees() {
  return _productionEmployees().filter(e => e.situacao === 'ATIVO' || e.situacao === 'FÉRIAS');
}

function _getTeamColor(lider) {
  const colors = {
    'Samuel':  { bg: '#002B5B', light: '#E8EEF5', text: '#fff' },
    'Toni':    { bg: '#7B2D8B', light: '#F3E8F7', text: '#fff' },
    'Rogério': { bg: '#0891B2', light: '#E0F2F8', text: '#fff' },
    'André':   { bg: '#1B4F8A', light: '#E3EBF5', text: '#fff' },
    'Heleno':  { bg: '#065F46', light: '#D1FAE5', text: '#fff' },
    'Renato':  { bg: '#92400E', light: '#FEF3C7', text: '#fff' },
    'Davi':    { bg: '#5B21B6', light: '#EDE9FE', text: '#fff' },
    'Wesley':  { bg: '#1F2937', light: '#F9FAFB', text: '#fff' }
  };
  return colors[lider] || { bg: '#374151', light: '#F3F4F6', text: '#fff' };
}

function _getStatusBadge(situacao) {
  if (situacao === 'ATIVO')   return '<span class="team-badge active">✅ Ativo</span>';
  if (situacao === 'FÉRIAS')  return '<span class="team-badge ferias">🏖️ Férias</span>';
  return '<span class="team-badge desligado">❌ Desligado</span>';
}

function _getSectorBadge(setor) {
  const map = {
    'Produção':      { color: '#1B4F8A', bg: '#DBEAFE', icon: '🔵' },
    'Expedição':     { color: '#15803D', bg: '#DCFCE7', icon: '🟢' },
    'Designer':      { color: '#7C3AED', bg: '#EDE9FE', icon: '🟣' },
    'Vendas':        { color: '#B45309', bg: '#FEF3C7', icon: '🟡' },
    'Administrativo':{ color: '#374151', bg: '#F3F4F6', icon: '⚫' },
    'Facilities':    { color: '#DC2626', bg: '#FEE2E2', icon: '🔴' }
  };
  const s = map[setor] || { color: '#6B7280', bg: '#F3F4F6', icon: '⚪' };
  return `<span class="sector-badge" style="background:${s.bg};color:${s.color}">${s.icon} ${setor}</span>`;
}

/* ─── RENDER PRINCIPAL ─────────────────────── */

/**
 * Renderiza a página de gerenciamento de equipes de Produção
 * @param {string} containerId - ID do elemento container da página
 * @param {boolean} readOnly - Somente leitura (para boss/diretor)
 */
window._teamsRender = function(containerId, readOnly) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const teams   = _teamsGetAll();
  const leaders = _productionLeaders();
  const prodEmps = _productionEmployees();
  const activeCount = prodEmps.filter(e => e.situacao === 'ATIVO' || e.situacao === 'FÉRIAS').length;

  // KPIs do topo
  const teamLeaders = [...new Set(teams.map(t => t.lider).filter(Boolean))];

  el.innerHTML = `
    <div class="page-header">
      <div>
        <h2><i class="fas fa-layer-group"></i> Equipes de Produção</h2>
        <span class="page-sub">Gerenciamento de equipes — Setor de Produção</span>
      </div>
      ${!readOnly ? `<button class="btn-primary" onclick="window._teamsOpenModal()">
        <i class="fas fa-plus"></i> Nova Equipe
      </button>` : ''}
    </div>

    <!-- KPIs -->
    <div class="cards-grid" style="margin-bottom:24px">
      <div class="stat-card blue">
        <div class="stat-icon"><i class="fas fa-layer-group"></i></div>
        <div class="stat-info">
          <span class="stat-value">${teams.length}</span>
          <span class="stat-label">Equipes Cadastradas</span>
        </div>
      </div>
      <div class="stat-card green">
        <div class="stat-icon"><i class="fas fa-users"></i></div>
        <div class="stat-info">
          <span class="stat-value">${activeCount}</span>
          <span class="stat-label">Colaboradores Ativos</span>
        </div>
      </div>
      <div class="stat-card orange">
        <div class="stat-icon"><i class="fas fa-user-tie"></i></div>
        <div class="stat-info">
          <span class="stat-value">${leaders.length}</span>
          <span class="stat-label">Líderes no RH</span>
        </div>
      </div>
      <div class="stat-card purple">
        <div class="stat-icon"><i class="fas fa-industry"></i></div>
        <div class="stat-info">
          <span class="stat-value">${prodEmps.length}</span>
          <span class="stat-label">Total Produção (histórico)</span>
        </div>
      </div>
    </div>

    <!-- Filtros -->
    <div class="rh-filter-bar" style="margin-bottom:20px">
      <div class="rh-search-wrap">
        <i class="fas fa-search"></i>
        <input type="text" id="teams-search" placeholder="Buscar equipe ou líder..." 
          value="${_teamsFilter.search}" 
          oninput="_teamsApplyFilter()" />
      </div>
      <select id="teams-fil-lider" class="rh-select" onchange="_teamsApplyFilter()">
        <option value="">Todos os Líderes</option>
        ${leaders.map(l => `<option value="${l}" ${_teamsFilter.lider === l ? 'selected' : ''}>${l}</option>`).join('')}
      </select>
      ${!readOnly ? `<button class="btn-outline btn-sm" onclick="window._teamsAutoPopulate()" title="Gerar equipes automaticamente a partir do banco de dados RH">
        <i class="fas fa-magic"></i> Auto-popular do RH
      </button>` : ''}
    </div>

    <!-- Lista de equipes -->
    <div id="teams-list-container">
      ${_teamsRenderList(teams, readOnly)}
    </div>
  `;
};

/**
 * Renderiza a lista de equipes com paginação
 */
function _teamsRenderList(allTeams, readOnly) {
  const q  = (_teamsFilter.search || '').toLowerCase();
  const lf = _teamsFilter.lider || '';

  let filtered = allTeams.filter(t => {
    const matchSearch = !q || 
      (t.nome || '').toLowerCase().includes(q) ||
      (t.lider || '').toLowerCase().includes(q) ||
      (t.descricao || '').toLowerCase().includes(q);
    const matchLider = !lf || t.lider === lf;
    return matchSearch && matchLider;
  });

  filtered.sort((a, b) => (a.lider || '').localeCompare(b.lider || ''));

  if (!filtered.length) {
    return `<div class="empty-state">
      <i class="fas fa-layer-group" style="font-size:48px;color:#D1D5DB;margin-bottom:12px"></i>
      <p style="color:#9CA3AF;font-size:15px">Nenhuma equipe encontrada</p>
      ${!readOnly ? `<button class="btn-primary" onclick="window._teamsOpenModal()" style="margin-top:12px">
        <i class="fas fa-plus"></i> Criar primeira equipe
      </button>` : ''}
    </div>`;
  }

  const total = filtered.length;
  const pages = Math.ceil(total / _TEAMS_PAGE_SIZE);
  _teamsPage  = Math.min(_teamsPage, Math.max(0, pages - 1));
  const slice = filtered.slice(_teamsPage * _TEAMS_PAGE_SIZE, (_teamsPage + 1) * _TEAMS_PAGE_SIZE);

  const cards = slice.map(team => _teamsRenderCard(team, readOnly)).join('');

  const pag = pages > 1 ? `
    <div class="rh-pagination" style="margin-top:20px">
      <span class="rh-pag-info">${total} equipe${total !== 1 ? 's' : ''} · página ${_teamsPage + 1} de ${pages}</span>
      <div class="rh-pag-btns">
        <button class="rh-pag-btn" onclick="_teamsChangePage(-1)" ${_teamsPage === 0 ? 'disabled' : ''}>
          <i class="fas fa-chevron-left"></i>
        </button>
        <button class="rh-pag-btn" onclick="_teamsChangePage(1)" ${_teamsPage >= pages - 1 ? 'disabled' : ''}>
          <i class="fas fa-chevron-right"></i>
        </button>
      </div>
    </div>` : '';

  return `<div class="teams-grid">${cards}</div>${pag}`;
}

function _teamsRenderCard(team, readOnly) {
  const colors  = _getTeamColor(team.lider);
  const members = team.membros || [];
  const activeMembers = members.filter(m => m.situacao === 'ATIVO' || m.situacao === 'FÉRIAS');

  const preview = activeMembers.slice(0, 4).map(m => `
    <div class="team-member-mini" title="${m.nome} — ${m.cargo}">
      <div class="team-member-avatar" style="background:${colors.bg}20;color:${colors.bg}">${_getInitials(m.nome)}</div>
    </div>`).join('');

  const extra = activeMembers.length > 4 
    ? `<button class="team-member-mini-extra" style="background:${colors.bg}20;color:${colors.bg};border:none;cursor:pointer;font-weight:700;font-size:12px;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center" onclick="window._teamsViewMembers('${team.id}')" title="Ver todos os ${activeMembers.length} membros">+${activeMembers.length - 4}</button>` 
    : '';

  const createdAt = team.criadoEm ? new Date(team.criadoEm).toLocaleDateString('pt-BR') : '—';

  return `
  <div class="team-card" id="team-card-${team.id}">
    <div class="team-card-header" style="background:${colors.bg}">
      <div class="team-card-header-info">
        <div class="team-card-avatar" style="background:rgba(255,255,255,0.2)">${_getInitials(team.lider || '?')}</div>
        <div>
          <div class="team-card-name">${team.nome || 'Equipe sem nome'}</div>
          <div class="team-card-leader"><i class="fas fa-user-tie"></i> ${team.lider || '—'}</div>
        </div>
      </div>
      <div class="team-card-count-badge" style="background:rgba(255,255,255,0.2)">
        <span>${activeMembers.length}</span>
        <small>ativos</small>
      </div>
    </div>

    <div class="team-card-body">
      ${team.descricao ? `<p class="team-card-desc">${team.descricao}</p>` : ''}
      
      <div class="team-card-stats">
        <div class="team-card-stat">
          <i class="fas fa-users" style="color:${colors.bg}"></i>
          <span>${members.length} membro${members.length !== 1 ? 's' : ''} total</span>
        </div>
        <div class="team-card-stat">
          <i class="fas fa-check-circle" style="color:#16A34A"></i>
          <span>${activeMembers.length} ativo${activeMembers.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="team-card-stat">
          <i class="fas fa-calendar-alt" style="color:#6B7280"></i>
          <span>Criada ${createdAt}</span>
        </div>
      </div>

      ${activeMembers.length > 0 ? `
      <div class="team-members-preview">
        ${preview}${extra}
        <span class="team-members-label">Membros ativos</span>
      </div>
      ${activeMembers.length > 4 ? `
      <button class="team-see-all-btn" onclick="window._teamsViewMembers('${team.id}')">
        <i class="fas fa-users"></i> Ver todos os ${activeMembers.length} membros
      </button>` : ''}
      ` : `<div class="team-no-members"><i class="fas fa-user-plus"></i> Nenhum membro ativo</div>`}
    </div>

    <div class="team-card-footer">
      <button class="btn-outline btn-sm" onclick="window._teamsViewMembers('${team.id}')">
        <i class="fas fa-eye"></i> Ver Equipe
      </button>
      ${!readOnly ? `
      <button class="btn-outline btn-sm" onclick="window._teamsOpenModal('${team.id}')">
        <i class="fas fa-edit"></i> Editar
      </button>
      <button class="btn-icon red" onclick="window._teamsDelete('${team.id}')" title="Excluir equipe">
        <i class="fas fa-trash"></i>
      </button>` : ''}
    </div>
  </div>`;
}

window._teamsApplyFilter = function() {
  _teamsFilter.search = document.getElementById('teams-search')?.value || '';
  _teamsFilter.lider  = document.getElementById('teams-fil-lider')?.value || '';
  _teamsPage = 0;
  const el = document.getElementById('teams-list-container');
  if (el) el.innerHTML = _teamsRenderList(_teamsGetAll(), window.currentUser?.role !== 'boss');
};

window._teamsChangePage = function(dir) {
  _teamsPage = Math.max(0, _teamsPage + dir);
  const el = document.getElementById('teams-list-container');
  if (el) el.innerHTML = _teamsRenderList(_teamsGetAll(), window.currentUser?.role !== 'boss');
};

/* ─── MODAL NOVA/EDITAR EQUIPE ─────────────── */
window._teamsOpenModal = function(teamId) {
  const teams   = _teamsGetAll();
  const team    = teamId ? teams.find(t => t.id === teamId) : null;
  const leaders = _productionLeaders();
  const isEdit  = !!team;

  // Produção: membros ativos no RH
  const prodAtivos = _activeProductionEmployees();

  const selectedLider   = team?.lider || '';
  const selectedMembros = (team?.membros || []).map(m => m.matricula);

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'teams-modal-overlay';
  modal.innerHTML = `
    <div class="modal" style="max-width:680px">
      <div class="modal-header">
        <h3><i class="fas fa-layer-group"></i> ${isEdit ? 'Editar Equipe' : 'Nova Equipe de Produção'}</h3>
        <button class="modal-close" onclick="document.getElementById('teams-modal-overlay').remove()">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="modal-body">
        <!-- Nome da Equipe -->
        <div class="form-group">
          <label>Nome da Equipe *</label>
          <input type="text" id="team-nome" placeholder="Ex: Equipe Calandra A, Equipe Revisão Noturno..." 
            value="${team?.nome || ''}" maxlength="80" />
        </div>

        <!-- Líder -->
        <div class="form-row">
          <div class="form-group">
            <label>Líder da Equipe *</label>
            <select id="team-lider" onchange="_teamsFilterMembersByLider()">
              <option value="">— Selecione o líder —</option>
              ${leaders.map(l => `<option value="${l}" ${selectedLider === l ? 'selected' : ''}>${l}</option>`).join('')}
              <option value="outro" ${selectedLider === 'outro' ? 'selected' : ''}>Outro / Personalizado</option>
            </select>
          </div>
          <div class="form-group" id="team-lider-custom-wrap" style="display:${selectedLider === 'outro' ? '' : 'none'}">
            <label>Nome do Líder (personalizado)</label>
            <input type="text" id="team-lider-custom" placeholder="Nome do líder..." value="${selectedLider === 'outro' ? (team?.liderCustom || '') : ''}" />
          </div>
        </div>

        <!-- Descrição -->
        <div class="form-group">
          <label>Descrição / Observações</label>
          <textarea id="team-descricao" rows="2" placeholder="Turno, máquinas, área de atuação...">${team?.descricao || ''}</textarea>
        </div>

        <!-- Membros -->
        <div class="form-group">
          <label><i class="fas fa-users"></i> Membros da Equipe (Setor de Produção)</label>
          <div class="team-member-search-wrap">
            <i class="fas fa-search"></i>
            <input type="text" id="team-member-search" placeholder="Buscar colaborador por nome, matrícula ou cargo..." 
              oninput="_teamsFilterMembers()" />
          </div>
          <div class="team-member-filter-row">
            <label class="team-filter-toggle">
              <input type="checkbox" id="team-filter-lider" onchange="_teamsFilterMembers()" />
              <span>Mostrar apenas membros do líder selecionado</span>
            </label>
            <label class="team-filter-toggle">
              <input type="checkbox" id="team-filter-ativo" checked onchange="_teamsFilterMembers()" />
              <span>Apenas ativos</span>
            </label>
          </div>
          <div id="team-members-list" class="team-members-checklist">
            ${_teamsRenderMembersList(prodAtivos, selectedMembros, selectedLider)}
          </div>
          <div id="team-selected-count" class="team-selected-count">
            ${selectedMembros.length} membro(s) selecionado(s)
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-outline" onclick="document.getElementById('teams-modal-overlay').remove()">Cancelar</button>
        <button class="btn-primary" onclick="window._teamsSave('${teamId || ''}')">
          <i class="fas fa-save"></i> ${isEdit ? 'Salvar Alterações' : 'Criar Equipe'}
        </button>
      </div>
    </div>`;

  document.body.appendChild(modal);

  // Atualiza filtro ao mudar líder
  document.getElementById('team-lider').addEventListener('change', function() {
    const wrap = document.getElementById('team-lider-custom-wrap');
    if (wrap) wrap.style.display = this.value === 'outro' ? '' : 'none';
    _teamsFilterMembersByLider();
  });
};

function _teamsRenderMembersList(employees, selectedMatriculas, filterLider) {
  let list = employees;
  
  // Aplica filtros do modal
  const searchInput = document.getElementById('team-member-search');
  const filterLiderCb = document.getElementById('team-filter-lider');
  const filterAtivoCb = document.getElementById('team-filter-ativo');

  const q     = (searchInput?.value || '').toLowerCase();
  const onlyLider = filterLiderCb?.checked;
  const onlyAtivo = filterAtivoCb?.checked !== false;

  if (onlyAtivo) {
    list = list.filter(e => e.situacao === 'ATIVO' || e.situacao === 'FÉRIAS');
  } else {
    list = _productionEmployees();
  }

  if (q) {
    list = list.filter(e => 
      (e.nome || '').toLowerCase().includes(q) ||
      (e.matricula || '').toLowerCase().includes(q) ||
      (e.cargo || '').toLowerCase().includes(q)
    );
  }

  if (onlyLider && filterLider) {
    const ldr = document.getElementById('team-lider')?.value;
    if (ldr && ldr !== 'outro') {
      list = list.filter(e => e.lider === ldr);
    }
  }

  if (!list.length) {
    return `<div style="padding:20px;text-align:center;color:#9CA3AF">
      <i class="fas fa-user-slash"></i> Nenhum colaborador encontrado
    </div>`;
  }

  return list.map(emp => {
    const checked   = selectedMatriculas.includes(emp.matricula) ? 'checked' : '';
    const admFmt    = emp.admissao ? emp.admissao.split('-').reverse().join('/') : '—';
    const statusCls = emp.situacao === 'ATIVO' ? 'active' : emp.situacao === 'FÉRIAS' ? 'ferias' : 'desligado';
    return `
    <label class="team-member-item ${checked ? 'selected' : ''}">
      <input type="checkbox" value="${emp.matricula}" ${checked} 
        onchange="_teamsUpdateSelectedCount(this)" class="team-member-checkbox" />
      <div class="team-member-avatar-sm">${_getInitials(emp.nome)}</div>
      <div class="team-member-info">
        <div class="team-member-name">${emp.nome}</div>
        <div class="team-member-details">
          <span>${emp.cargo}</span>
          <span class="team-badge ${statusCls}" style="font-size:10px;padding:1px 6px">${emp.situacao}</span>
          <span style="color:#9CA3AF">Mat. ${emp.matricula}</span>
          <span style="color:#9CA3AF">Adm. ${admFmt}</span>
        </div>
      </div>
    </label>`;
  }).join('');
}

window._teamsFilterMembers = function() {
  const listEl = document.getElementById('team-members-list');
  if (!listEl) return;
  const checked = [...document.querySelectorAll('.team-member-checkbox:checked')].map(cb => cb.value);
  const lider   = document.getElementById('team-lider')?.value || '';
  const allEmps = _productionEmployees();
  listEl.innerHTML = _teamsRenderMembersList(allEmps, checked, lider);
  _teamsUpdateCount(checked.length);
};

window._teamsFilterMembersByLider = function() {
  const cb = document.getElementById('team-filter-lider');
  if (cb) cb.checked = false; // reset ao trocar líder
  window._teamsFilterMembers();
};

window._teamsUpdateSelectedCount = function(checkbox) {
  const label = checkbox.closest('label');
  if (label) label.classList.toggle('selected', checkbox.checked);
  const total = document.querySelectorAll('.team-member-checkbox:checked').length;
  _teamsUpdateCount(total);
};

function _teamsUpdateCount(n) {
  const el = document.getElementById('team-selected-count');
  if (el) el.textContent = `${n} membro(s) selecionado(s)`;
}

/* ─── SALVAR EQUIPE ────────────────────────── */
window._teamsSave = function(editId) {
  const nome    = document.getElementById('team-nome')?.value.trim();
  const lider   = document.getElementById('team-lider')?.value;
  const liderCustom = document.getElementById('team-lider-custom')?.value.trim();
  const desc    = document.getElementById('team-descricao')?.value.trim();

  const finalLider = lider === 'outro' ? (liderCustom || lider) : lider;

  if (!nome)        { alert('⚠️ Informe o nome da equipe!'); return; }
  if (!finalLider)  { alert('⚠️ Selecione o líder da equipe!'); return; }

  // Membros selecionados
  const checkedMatriculas = [...document.querySelectorAll('.team-member-checkbox:checked')].map(cb => cb.value);
  const allRhEmps = _rhEmployees();
  const membros = checkedMatriculas.map(mat => {
    const emp = allRhEmps.find(e => e.matricula === mat);
    if (!emp) return null;
    return {
      matricula: emp.matricula,
      nome:      emp.nome,
      cargo:     emp.cargo,
      situacao:  emp.situacao,
      admissao:  emp.admissao,
      horario:   emp.horario,
      setor:     emp.setor
    };
  }).filter(Boolean);

  const teams = _teamsGetAll();

  if (editId) {
    const idx = teams.findIndex(t => t.id === editId);
    if (idx !== -1) {
      teams[idx] = { ...teams[idx], nome, lider: finalLider, liderCustom: lider === 'outro' ? liderCustom : '', descricao: desc, membros, atualizadoEm: Date.now() };
    }
  } else {
    teams.push({
      id:         'team-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      nome,
      lider:      finalLider,
      liderCustom: lider === 'outro' ? liderCustom : '',
      descricao:  desc,
      setor:      'Produção',
      membros,
      criadoEm:   Date.now(),
      atualizadoEm: Date.now()
    });
  }

  _teamsSave(teams);
  document.getElementById('teams-modal-overlay')?.remove();

  // Re-renderiza a página atual
  _teamsRefreshCurrentPage();
  _teamsShowToast(editId ? '✅ Equipe atualizada com sucesso!' : '✅ Equipe criada com sucesso!');
};

/* ─── EXCLUIR EQUIPE ───────────────────────── */
window._teamsDelete = function(teamId) {
  const team = _teamsGetAll().find(t => t.id === teamId);
  if (!team) return;
  if (!confirm(`⚠️ Deseja excluir a equipe "${team.nome}"?\n\nEssa ação não pode ser desfeita.`)) return;

  const teams = _teamsGetAll().filter(t => t.id !== teamId);
  _teamsSave(teams);
  _teamsRefreshCurrentPage();
  _teamsShowToast('🗑️ Equipe excluída.');
};

/* ─── VER MEMBROS (modal de detalhes) ──────── */
window._teamsViewMembers = function(teamId) {
  const team = _teamsGetAll().find(t => t.id === teamId);
  if (!team) return;

  const colors  = _getTeamColor(team.lider);
  const members = team.membros || [];
  const ativos  = members.filter(m => m.situacao === 'ATIVO' || m.situacao === 'FÉRIAS');
  const demis   = members.filter(m => m.situacao === 'DESLIGADO');

  // Busca dados atualizados no RH
  const rhEmps = _rhEmployees();
  const membersUpdated = members.map(m => {
    const current = rhEmps.find(e => e.matricula === m.matricula) || m;
    return current;
  });

  const renderMemberRow = (emp) => {
    const admFmt = emp.admissao ? emp.admissao.split('-').reverse().join('/') : '—';
    return `
    <tr>
      <td>
        <div class="emp-name-cell">
          <div class="emp-avatar-sm" style="background:${colors.bg}20;color:${colors.bg}">${_getInitials(emp.nome)}</div>
          <div>
            <div class="emp-name">${emp.nome}</div>
            <div class="emp-meta">Mat. ${emp.matricula}</div>
          </div>
        </div>
      </td>
      <td>${emp.cargo || '—'}</td>
      <td>${admFmt}</td>
      <td>${emp.horario || '—'}</td>
      <td>${_getStatusBadge(emp.situacao)}</td>
    </tr>`;
  };

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'teams-view-modal';
  modal.innerHTML = `
    <div class="modal" style="max-width:760px">
      <div class="modal-header" style="background:${colors.bg};color:#fff;border-radius:12px 12px 0 0">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;font-weight:700">
            ${_getInitials(team.lider || '?')}
          </div>
          <div>
            <h3 style="margin:0;color:#fff">${team.nome}</h3>
            <span style="font-size:13px;opacity:0.85"><i class="fas fa-user-tie"></i> Líder: ${team.lider}</span>
          </div>
        </div>
        <button class="modal-close" style="color:#fff;opacity:0.8" onclick="document.getElementById('teams-view-modal').remove()">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="modal-body">
        ${team.descricao ? `<p style="color:#6B7280;margin-bottom:16px;font-style:italic"><i class="fas fa-info-circle"></i> ${team.descricao}</p>` : ''}
        
        <!-- Stats rápidas -->
        <div style="display:flex;gap:16px;margin-bottom:20px;flex-wrap:wrap">
          <div style="background:#DBEAFE;color:#1D4ED8;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600">
            <i class="fas fa-users"></i> ${members.length} membros total
          </div>
          <div style="background:#DCFCE7;color:#15803D;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600">
            <i class="fas fa-check-circle"></i> ${ativos.length} ativos
          </div>
          ${demis.length > 0 ? `<div style="background:#FEE2E2;color:#DC2626;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600">
            <i class="fas fa-user-minus"></i> ${demis.length} desligados
          </div>` : ''}
        </div>

        ${ativos.length > 0 ? `
        <h4 style="margin-bottom:12px;color:#374151"><i class="fas fa-check-circle" style="color:#16A34A"></i> Colaboradores Ativos</h4>
        <div class="table-wrapper" style="margin-bottom:20px">
          <table class="data-table">
            <thead><tr><th>Colaborador</th><th>Cargo</th><th>Admissão</th><th>Horário</th><th>Status</th></tr></thead>
            <tbody>${membersUpdated.filter(m => m.situacao === 'ATIVO' || m.situacao === 'FÉRIAS').map(renderMemberRow).join('')}</tbody>
          </table>
        </div>` : `<div class="empty-state" style="padding:20px"><i class="fas fa-user-slash"></i><p>Nenhum membro ativo nesta equipe</p></div>`}

        ${demis.length > 0 ? `
        <details style="margin-top:16px">
          <summary style="cursor:pointer;color:#9CA3AF;font-size:13px;font-weight:600">
            <i class="fas fa-user-minus"></i> Ver desligados (${demis.length})
          </summary>
          <div class="table-wrapper" style="margin-top:12px">
            <table class="data-table">
              <thead><tr><th>Colaborador</th><th>Cargo</th><th>Admissão</th><th>Horário</th><th>Status</th></tr></thead>
              <tbody>${membersUpdated.filter(m => m.situacao === 'DESLIGADO').map(renderMemberRow).join('')}</tbody>
            </table>
          </div>
        </details>` : ''}
      </div>
      <div class="modal-footer">
        <button class="btn-outline" onclick="document.getElementById('teams-view-modal').remove()">Fechar</button>
        ${window.currentUser?.role !== 'boss' ? `
        <button class="btn-primary" onclick="document.getElementById('teams-view-modal').remove(); window._teamsOpenModal('${team.id}')">
          <i class="fas fa-edit"></i> Editar Equipe
        </button>` : ''}
      </div>
    </div>`;

  document.body.appendChild(modal);
};

/* ─── AUTO-POPULAR DO RH ───────────────────── */
window._teamsAutoPopulate = function() {
  const existing = _teamsGetAll();
  const prodEmps = _activeProductionEmployees();
  const leaders  = _productionLeaders();

  if (existing.length > 0) {
    if (!confirm(`⚠️ Já existem ${existing.length} equipe(s) cadastrada(s).\n\nDeseja ADICIONAR as equipes que ainda não existem (sem excluir as existentes)?`)) return;
  }

  const teams = [...existing];
  let added   = 0;

  leaders.forEach(lider => {
    // Verifica se já existe equipe para esse líder
    const alreadyExists = teams.some(t => t.lider === lider);
    if (alreadyExists) return;

    const membros = prodEmps
      .filter(e => e.lider === lider)
      .map(emp => ({
        matricula: emp.matricula,
        nome:      emp.nome,
        cargo:     emp.cargo,
        situacao:  emp.situacao,
        admissao:  emp.admissao,
        horario:   emp.horario,
        setor:     emp.setor
      }));

    teams.push({
      id:          'team-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6) + '-' + lider.replace(/\s/g,''),
      nome:        `Equipe ${lider}`,
      lider:       lider,
      liderCustom: '',
      descricao:   `Equipe de Produção gerada automaticamente do banco de dados RH`,
      setor:       'Produção',
      membros,
      criadoEm:    Date.now(),
      atualizadoEm: Date.now()
    });
    added++;
  });

  if (added === 0) {
    alert('ℹ️ Todas as equipes dos líderes já estão cadastradas!');
    return;
  }

  _teamsSave(teams);
  _teamsRefreshCurrentPage();
  _teamsShowToast(`✅ ${added} equipe(s) criada(s) automaticamente do banco de dados RH!`);
};

/* ─── HELPERS INTERNOS ─────────────────────── */
function _getInitials(name) {
  if (!name) return '??';
  return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
}

function _teamsRefreshCurrentPage() {
  if (window.currentPage === 'admin-teams') {
    window._teamsRender('page-admin-teams', false);
  } else if (window.currentPage === 'boss-teams') {
    window._teamsRender('page-boss-teams', true);
  } else if (window.currentPage === 'supervisor-teams') {
    window._teamsRender('page-supervisor-teams', false);
  } else if (window.currentPage === 'manager-teams') {
    window._teamsRender('page-manager-teams', false);
  }
}

function _teamsShowToast(msg) {
  const t = document.createElement('div');
  t.className = 'teams-toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3000);
}

/* ─── EXPÕE RENDER FUNCTIONS POR ROLE ──────── */
window._teamsRenderAdmin   = function() { window._teamsRender('page-admin-teams',      false); };
window._teamsRenderBoss    = function() { window._teamsRender('page-boss-teams',        true);  };
window._teamsRenderManager = function() { window._teamsRender('page-manager-teams',    false); };
window._teamsRenderSup     = function() { window._teamsRender('page-supervisor-teams', false); };

console.log('✅ Teams Module carregado.');
