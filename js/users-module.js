/* =============================================
   USERS-MODULE.JS — Gestão de Usuários
   Lumini — Gestão de Carreira & Polivalência

   Apenas Admin (Wesley) tem acesso.
   Usuários salvos em: localStorage (nt_users)
   + Firebase (coleção 'users') em background.
============================================= */

(function() {
'use strict';

// ─── Roles disponíveis ───────────────────────
const ROLES = [
  { value: 'admin',      label: 'Administrador',       icon: '🔑' },
  { value: 'manager',    label: 'Gerente de Produção',  icon: '📊' },
  { value: 'supervisor', label: 'Supervisor',           icon: '👷' },
  { value: 'boss',       label: 'Diretor Geral',        icon: '👑' },
  { value: 'rh',         label: 'Recursos Humanos',     icon: '❤️' },
  { value: 'employee',   label: 'Colaborador (Portal)', icon: '🌐' },
];

// ─── Helpers ────────────────────────────────
function _toast(msg, type = 'success') {
  if (window._ntShowToast) window._ntShowToast(msg, type);
}
async function _confirm(opts) {
  if (window._ntConfirm) return await window._ntConfirm(opts);
  return window.confirm(opts.message || 'Confirmar?');
}
function uid() { return 'usr-' + Date.now() + '-' + Math.random().toString(36).slice(2,7); }

// ─── Persistência ─────────────────────────── 
// Prioridade: Firebase cache → localStorage seed
function _getUsers() {
  const cached = window._cache?.users;
  if (cached && cached.length) return cached;
  // Fallback: seed dos DEMO_USERS + customizados
  return _getUsersFromStorage();
}

function _getUsersFromStorage() {
  try {
    const saved = localStorage.getItem('nt_users_custom');
    const custom = saved ? JSON.parse(saved) : [];
    // Funde DEMO_USERS (sem senha exposta) com customizados
    const demo = (window.DEMO_USERS || []).map(u => ({
      id:       'demo-' + u.email.replace(/[@.]/g,'_'),
      email:    u.email,
      name:     u.name,
      role:     u.role,
      active:   true,
      isDemo:   true,
      password: u.password // só usado localmente
    }));
    // Customizados substituem demo se mesmo email
    const demoFiltered = demo.filter(d => !custom.find(c => c.email === d.email));
    return [...demoFiltered, ...custom];
  } catch { return window.DEMO_USERS || []; }
}

function _saveUsers(users) {
  // Salva apenas usuários NÃO demo
  const custom = users.filter(u => !u.isDemo);
  localStorage.setItem('nt_users_custom', JSON.stringify(custom));
  // Atualiza cache
  if (window._cache) window._cache.users = users;
  // Persiste no Firebase em background (senha só para role employee — necessário ao login do portal)
  if (window.persistCollection) {
    const safe = users.map(u => {
      if (u.role === 'employee') {
        return { ...u };
      }
      const { password, ...rest } = u;
      return rest;
    });
    window.persistCollection('users', safe);
  }
}

// ─── RENDER PRINCIPAL ─────────────────────────
window._usersRender = function(containerId = 'page-admin-users') {
  if (window.currentUser?.role !== 'admin') {
    if (window._ntShowToast) window._ntShowToast('⛔ Acesso restrito ao Administrador.', 'error');
    return;
  }

  const container = document.getElementById(containerId);
  if (!container) return;

  const users = _getUsers();

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2><i class="fas fa-user-cog"></i> Gestão de Usuários</h2>
        <span class="page-sub">Crie, edite e controle as permissões de cada usuário</span>
      </div>
      <button class="btn-primary" onclick="window._usersOpenModal()">
        <i class="fas fa-plus"></i> Novo Usuário
      </button>
    </div>

    <!-- KPIs -->
    <div class="cards-grid" style="grid-template-columns:repeat(auto-fill,minmax(180px,1fr));margin-bottom:20px">
      <div class="stat-card blue">
        <div class="stat-icon"><i class="fas fa-users"></i></div>
        <div class="stat-info"><span class="stat-value">${users.length}</span><span class="stat-label">Total de Usuários</span></div>
      </div>
      <div class="stat-card green">
        <div class="stat-icon"><i class="fas fa-check-circle"></i></div>
        <div class="stat-info"><span class="stat-value">${users.filter(u=>u.active!==false).length}</span><span class="stat-label">Ativos</span></div>
      </div>
      <div class="stat-card orange">
        <div class="stat-icon"><i class="fas fa-ban"></i></div>
        <div class="stat-info"><span class="stat-value">${users.filter(u=>u.active===false).length}</span><span class="stat-label">Desativados</span></div>
      </div>
      <div class="stat-card purple">
        <div class="stat-icon"><i class="fas fa-user-plus"></i></div>
        <div class="stat-info"><span class="stat-value">${users.filter(u=>!u.isDemo).length}</span><span class="stat-label">Customizados</span></div>
      </div>
    </div>

    <!-- Busca -->
    <div class="rh-filter-bar" style="margin-bottom:16px">
      <div class="rh-search-wrap" style="flex:1;min-width:200px">
        <i class="fas fa-search" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#9CA3AF;font-size:13px"></i>
        <input type="text" id="users-search" placeholder="Buscar usuário..." style="padding-left:36px;width:100%"
          oninput="window._usersRender('${containerId}')">
      </div>
    </div>

    <!-- Tabela -->
    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th>Usuário</th>
            <th>E-mail</th>
            <th>Perfil</th>
            <th>Permissões</th>
            <th>Status</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>${_renderUsersRows(users)}</tbody>
      </table>
    </div>
  `;
};

function _renderUsersRows(users) {
  const q = document.getElementById('users-search')?.value?.toLowerCase() || '';
  let filtered = users;
  if (q) filtered = users.filter(u => u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q));

  if (!filtered.length) return `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted)">
    <div style="font-size:32px;margin-bottom:8px">👥</div>Nenhum usuário encontrado</td></tr>`;

  return filtered.map(u => {
    const role  = ROLES.find(r => r.value === u.role) || { label: u.role, icon: '👤' };
    const perms = window.getUserPermissions ? window.getUserPermissions(u.email, u.role) : {};
    const activeModules = Object.entries(perms).filter(([,v]) => v).length;
    const totalModules  = (window.ALL_MODULES || []).length;
    const isActive = u.active !== false;

    return `
    <tr style="${!isActive ? 'opacity:.55' : ''}">
      <td>
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#002B5B,#1B4F8A);display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:13px;flex-shrink:0">
            ${(u.name||'?')[0].toUpperCase()}
          </div>
          <div>
            <div style="font-weight:600;font-size:13px">${u.name || '—'}</div>
            ${u.isDemo ? '<span style="font-size:10px;background:#EEF2FF;color:#6366F1;padding:1px 6px;border-radius:4px;font-weight:600">DEMO</span>' : ''}
          </div>
        </div>
      </td>
      <td style="font-size:13px;color:var(--text-secondary)">${u.email}</td>
      <td><span class="users-role-badge role-${u.role}">${role.icon} ${role.label}</span></td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="flex:1;max-width:100px;height:6px;background:var(--border);border-radius:3px;overflow:hidden">
            <div style="height:100%;width:${Math.round((activeModules/totalModules)*100)}%;background:linear-gradient(90deg,#002B5B,#1B4F8A);border-radius:3px"></div>
          </div>
          <span style="font-size:12px;color:var(--text-secondary)">${activeModules}/${totalModules}</span>
          <button class="btn-icon" style="font-size:11px;padding:4px 8px;height:auto" onclick="window._usersOpenPermissions('${u.id}','${u.email}','${u.role}')" title="Editar permissões">
            <i class="fas fa-lock"></i>
          </button>
        </div>
      </td>
      <td>
        <span class="purch-badge ${isActive ? 'badge-success' : 'badge-danger'}" style="cursor:pointer" onclick="window._usersToggleActive('${u.id}')" title="${isActive ? 'Clique para desativar' : 'Clique para ativar'}">
          ${isActive ? '✅ Ativo' : '⛔ Inativo'}
        </span>
      </td>
      <td>
        <div style="display:flex;gap:4px">
          <button class="btn-icon" onclick="window._usersOpenModal('${u.id}')" title="Editar usuário" data-tooltip="Editar">
            <i class="fas fa-edit"></i>
          </button>
          ${!u.isDemo ? `<button class="btn-icon" style="color:#DC2626" onclick="window._usersDelete('${u.id}')" title="Excluir" data-tooltip="Excluir">
            <i class="fas fa-trash"></i>
          </button>` : ''}
        </div>
      </td>
    </tr>`;
  }).join('');
}

// ─── MODAL CRIAR / EDITAR ──────────────────────
window._usersOpenModal = function(editId) {
  const users = _getUsers();
  const existing = editId ? users.find(u => u.id === editId) : null;

  const html = `
  <div class="modal-overlay" id="usr-modal-overlay">
    <div class="modal" style="max-width:520px;width:calc(100%-32px)">
      <div class="modal-header">
        <h3><i class="fas fa-user-${editId ? 'edit' : 'plus'}"></i> ${editId ? 'Editar' : 'Novo'} Usuário</h3>
        <button class="modal-close" onclick="document.getElementById('usr-modal-overlay').remove()">×</button>
      </div>
      <div class="modal-body" style="padding:24px">
        <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div class="form-group" style="margin:0">
            <label>Nome completo <span class="required">*</span></label>
            <input type="text" id="usr-name" placeholder="Nome do usuário" value="${existing?.name || ''}">
          </div>
          <div class="form-group" style="margin:0">
            <label>E-mail / Login <span class="required">*</span></label>
            <input type="text" id="usr-email" placeholder="email@empresa" value="${existing?.email || ''}" ${existing?.isDemo ? 'disabled' : ''}>
          </div>
        </div>
        <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div class="form-group" style="margin:0">
            <label>${editId ? 'Nova senha (deixe em branco para manter)' : 'Senha'} ${!editId ? '<span class="required">*</span>' : ''}</label>
            <div class="input-icon-right">
              <input type="password" id="usr-password" placeholder="••••••••">
              <i class="fas fa-eye toggle-pass" onclick="var i=document.getElementById('usr-password');i.type=i.type==='password'?'text':'password'" style="cursor:pointer;color:#9CA3AF;font-size:13px;position:absolute;right:12px;top:50%;transform:translateY(-50%)"></i>
            </div>
          </div>
          <div class="form-group" style="margin:0">
            <label>Perfil <span class="required">*</span></label>
            <select id="usr-role" onchange="window._usersPreviewPerms(this.value);window._usersToggleEmployeeId(this.value)">
              ${ROLES.map(r => `<option value="${r.value}" ${existing?.role === r.value ? 'selected':''}>${r.icon} ${r.label}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="form-group" id="usr-employee-row" style="margin-bottom:12px;display:none">
          <label>ID do colaborador (coleção employees) <span class="required">*</span></label>
          <input type="text" id="usr-employee-id" placeholder="ID do documento no Firestore" value="${existing?.employeeId != null ? String(existing.employeeId).replace(/"/g, '&quot;') : ''}">
          <p style="font-size:11px;color:var(--text-muted);margin-top:6px">Use o ID do documento em employees (não a matrícula). Portal do Colaborador.</p>
        </div>

        <!-- Preview de permissões -->
        <div style="background:var(--bg-surface-2);border-radius:12px;padding:14px">
          <div style="font-size:12px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">
            <i class="fas fa-lock" style="margin-right:4px"></i>Permissões padrão do perfil
          </div>
          <div id="usr-perms-preview">
            ${_renderPermsPreview(existing?.role || 'supervisor', existing?.email)}
          </div>
        </div>
      </div>
      <div class="modal-footer" style="padding:16px 24px;display:flex;gap:10px;justify-content:flex-end;border-top:1px solid var(--border)">
        <button class="btn-outline" onclick="document.getElementById('usr-modal-overlay').remove()">Cancelar</button>
        <button class="btn-primary" onclick="window._usersSave('${editId || ''}')">
          <i class="fas fa-save"></i> ${editId ? 'Salvar' : 'Criar Usuário'}
        </button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  setTimeout(() => {
    window._usersToggleEmployeeId(document.getElementById('usr-role')?.value || 'supervisor');
  }, 0);
};

/** Exibe campo employeeId quando o perfil é Colaborador (Portal). */
window._usersToggleEmployeeId = function(role) {
  const row = document.getElementById('usr-employee-row');
  if (row) row.style.display = role === 'employee' ? '' : 'none';
};

function _renderPermsPreview(role, email) {
  const mods = window.ALL_MODULES || [];
  const perms = email ? (window.getUserPermissions ? window.getUserPermissions(email, role) : {}) : (window.DEFAULT_ROLE_PERMISSIONS?.[role] || {});
  return `<div style="display:flex;flex-wrap:wrap;gap:6px">` +
    mods.map(m => {
      const on = perms[m.key];
      return `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;background:${on?'#DCFCE7':'var(--bg-surface-3)'};color:${on?'#15803D':'var(--text-muted)'};border:1px solid ${on?'#BBF7D0':'var(--border)'}">
        <i class="fas ${on ? 'fa-check' : 'fa-times'}" style="font-size:9px"></i>${m.label}
      </span>`;
    }).join('') + `</div>`;
}

window._usersPreviewPerms = function(role) {
  const el = document.getElementById('usr-perms-preview');
  if (el) el.innerHTML = _renderPermsPreview(role);
};

// ─── SALVAR USUÁRIO ───────────────────────────
window._usersSave = function(editId) {
  const name     = document.getElementById('usr-name')?.value.trim();
  const email    = document.getElementById('usr-email')?.value.trim();
  const password = document.getElementById('usr-password')?.value.trim();
  const role     = document.getElementById('usr-role')?.value;
  const employeeId = document.getElementById('usr-employee-id')?.value.trim() || '';

  if (!name)  { _toast('Informe o nome do usuário.', 'warning'); return; }
  if (!email) { _toast('Informe o e-mail/login.', 'warning'); return; }
  if (!editId && !password) { _toast('Informe a senha.', 'warning'); return; }
  if (role === 'employee' && !employeeId) {
    _toast('Para Colaborador (Portal), informe o ID do documento em employees.', 'warning');
    return;
  }

  const users = _getUsers();

  if (editId) {
    const idx = users.findIndex(u => u.id === editId);
    if (idx >= 0) {
      users[idx] = {
        ...users[idx], name, role,
        ...(password ? { password } : {}),
        ...(role === 'employee' ? { employeeId } : { employeeId: '' }),
        updatedAt: Date.now()
      };
      // Atualiza DEMO_USERS em memória se for demo
      if (window.DEMO_USERS) {
        const di = window.DEMO_USERS.findIndex(u => u.email === users[idx].email);
        if (di >= 0) { window.DEMO_USERS[di].name = name; window.DEMO_USERS[di].role = role; if (password) window.DEMO_USERS[di].password = password; }
      }
      _toast('✅ Usuário atualizado!', 'success');
    }
  } else {
    // Verifica duplicata
    if (users.find(u => u.email === email)) { _toast('Este e-mail já está em uso.', 'warning'); return; }
    const newUser = {
      id: uid(), name, email, password, role, active: true, createdAt: Date.now(),
      ...(role === 'employee' ? { employeeId } : {})
    };
    users.push(newUser);
    // Colaboradores (portal) não entram no DEMO_USERS — login principal não usa esse perfil
    if (window.DEMO_USERS && role !== 'employee') {
      window.DEMO_USERS.push({ email, password, role, name, supervisor: role === 'supervisor' });
    }
    _toast('✅ Usuário criado com sucesso!', 'success');
  }

  _saveUsers(users);
  document.getElementById('usr-modal-overlay')?.remove();
  window._usersRender('page-admin-users');
};

// ─── ATIVAR / DESATIVAR ────────────────────────
window._usersToggleActive = async function(id) {
  const users = _getUsers();
  const u = users.find(x => x.id === id);
  if (!u) return;
  if (u.isDemo && window.currentUser?.email === u.email) {
    _toast('Não é possível desativar seu próprio usuário.', 'warning');
    return;
  }
  const newState = u.active === false;
  const ok = await _confirm({
    title: newState ? 'Ativar Usuário' : 'Desativar Usuário',
    message: `${newState ? 'Ativar' : 'Desativar'} o usuário "${u.name}"?`,
    icon: newState ? '✅' : '⛔',
    okText: newState ? 'Ativar' : 'Desativar',
    okClass: newState ? 'confirm-ok-primary' : ''
  });
  if (!ok) return;
  u.active = newState;
  _saveUsers(users);
  _toast(`Usuário ${newState ? 'ativado' : 'desativado'}.`, newState ? 'success' : 'info');
  window._usersRender('page-admin-users');
};

// ─── EXCLUIR ──────────────────────────────────
window._usersDelete = async function(id) {
  const u = _getUsers().find(x => x.id === id);
  if (!u || u.isDemo) return;
  const ok = await _confirm({ title:'Excluir Usuário', message:`Excluir "${u.name}"? Ação irreversível.`, icon:'🗑️', okText:'Excluir' });
  if (!ok) return;
  const users = _getUsers().filter(x => x.id !== id);
  _saveUsers(users);
  // Remove do DEMO_USERS se estiver lá
  if (window.DEMO_USERS) {
    const di = window.DEMO_USERS.findIndex(d => d.email === u.email);
    if (di >= 0) window.DEMO_USERS.splice(di, 1);
  }
  _toast('Usuário excluído.', 'info');
  window._usersRender('page-admin-users');
};

// ─── MODAL PERMISSÕES ─────────────────────────
window._usersOpenPermissions = function(id, email, role) {
  const mods  = window.ALL_MODULES || [];
  const perms = window.getUserPermissions ? window.getUserPermissions(email, role) : {};
  const users = _getUsers();
  const u = users.find(x => x.id === id);
  const userName = u?.name || email;

  const html = `
  <div class="modal-overlay" id="perm-modal-overlay">
    <div class="modal" style="max-width:480px;width:calc(100%-32px)">
      <div class="modal-header">
        <h3><i class="fas fa-lock"></i> Permissões — ${userName}</h3>
        <button class="modal-close" onclick="document.getElementById('perm-modal-overlay').remove()">×</button>
      </div>
      <div class="modal-body" style="padding:24px">
        <div style="background:var(--bg-surface-2);border-radius:10px;padding:10px 14px;margin-bottom:16px;font-size:12px;color:var(--text-secondary)">
          <i class="fas fa-info-circle" style="margin-right:4px"></i>
          Permissões customizadas sobrescrevem o padrão do perfil. Admin sempre tem acesso total.
        </div>
        <div id="perm-list">
          ${mods.map(m => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">
            <div style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:500">
              <i class="fas ${m.icon}" style="color:#002B5B;width:16px;text-align:center"></i>
              ${m.label}
            </div>
            <label class="perm-toggle" style="position:relative;width:44px;height:24px;cursor:pointer;flex-shrink:0">
              <input type="checkbox" id="perm-${m.key}" ${perms[m.key] ? 'checked' : ''} style="opacity:0;width:0;height:0;position:absolute">
              <span class="perm-toggle-track" style="position:absolute;inset:0;border-radius:24px;background:${perms[m.key]?'#16A34A':'var(--bg-surface-3)'};transition:background .2s;border:1.5px solid ${perms[m.key]?'#16A34A':'var(--border)'}"></span>
              <span class="perm-toggle-thumb" style="position:absolute;top:2px;left:${perms[m.key]?'20px':'2px'};width:18px;height:18px;border-radius:50%;background:white;box-shadow:0 1px 4px rgba(0,0,0,.3);transition:all .2s"></span>
            </label>
          </div>`).join('')}
        </div>
      </div>
      <div class="modal-footer" style="padding:16px 24px;display:flex;gap:10px;justify-content:space-between;border-top:1px solid var(--border)">
        <button class="btn-outline" onclick="window._usersResetPerms('${email}','${role}')">
          <i class="fas fa-undo"></i> Resetar para padrão
        </button>
        <div style="display:flex;gap:10px">
          <button class="btn-outline" onclick="document.getElementById('perm-modal-overlay').remove()">Cancelar</button>
          <button class="btn-primary" onclick="window._usersSavePerms('${email}','${role}')">
            <i class="fas fa-save"></i> Salvar Permissões
          </button>
        </div>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);

  // Torna os toggles interativos
  setTimeout(() => {
    (window.ALL_MODULES || []).forEach(m => {
      const cb = document.getElementById(`perm-${m.key}`);
      if (!cb) return;
      cb.addEventListener('change', function() {
        const track = this.closest('label').querySelector('.perm-toggle-track');
        const thumb = this.closest('label').querySelector('.perm-toggle-thumb');
        track.style.background = this.checked ? '#16A34A' : 'var(--bg-surface-3)';
        track.style.borderColor = this.checked ? '#16A34A' : 'var(--border)';
        thumb.style.left = this.checked ? '20px' : '2px';
      });
    });
  }, 50);
};

window._usersSavePerms = function(email, role) {
  const newPerms = {};
  (window.ALL_MODULES || []).forEach(m => {
    const cb = document.getElementById(`perm-${m.key}`);
    if (cb) newPerms[m.key] = cb.checked;
  });
  if (window.saveUserPermissions) window.saveUserPermissions(email, newPerms);
  _toast('✅ Permissões salvas!', 'success');
  document.getElementById('perm-modal-overlay')?.remove();
  window._usersRender('page-admin-users');
};

window._usersResetPerms = function(email, role) {
  (window.ALL_MODULES || []).forEach(m => {
    const base = window.DEFAULT_ROLE_PERMISSIONS?.[role] || {};
    const cb = document.getElementById(`perm-${m.key}`);
    if (!cb) return;
    cb.checked = !!base[m.key];
    const track = cb.closest('label').querySelector('.perm-toggle-track');
    const thumb = cb.closest('label').querySelector('.perm-toggle-thumb');
    if (track) { track.style.background = cb.checked ? '#16A34A' : 'var(--bg-surface-3)'; track.style.borderColor = cb.checked ? '#16A34A' : 'var(--border)'; }
    if (thumb)   thumb.style.left = cb.checked ? '20px' : '2px';
  });
  _toast('Permissões resetadas para o padrão do perfil.', 'info');
};

// ─── Expõe DEFAULT_ROLE_PERMISSIONS para o modal ──
// (importado do permissions.js via window)
window._usersRenderPage = function() { window._usersRender('page-admin-users'); };

console.log('✅ Users Module carregado.');
})();
