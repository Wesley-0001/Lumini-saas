/* =============================================
   PERMISSIONS.JS — Sistema RBAC Simples
   Lumini — Gestão de Carreira & Polivalência

   Módulos disponíveis:
   - rh, teams, turnover, careers, purchases,
     evaluations, reports, matrix, users
============================================= */

// ─── Permissões padrão por role ──────────────
const DEFAULT_ROLE_PERMISSIONS = {
  admin: {
    rh: true, teams: true, turnover: true, careers: true,
    purchases: true, evaluations: true, reports: true,
    matrix: true, users: true, comms: true
  },
  manager: {
    rh: false, teams: true, turnover: false, careers: true,
    purchases: true, evaluations: true, reports: true,
    matrix: true, users: false, comms: true
  },
  supervisor: {
    rh: false, teams: false, turnover: false, careers: true,
    purchases: false, evaluations: true, reports: false,
    matrix: true, users: false, comms: true
  },
  boss: {
    rh: true, teams: false, turnover: true, careers: false,
    purchases: true, evaluations: false, reports: true,
    matrix: true, users: false, comms: true
  },
  rh: {
    rh: true, teams: false, turnover: true, careers: false,
    purchases: false, evaluations: false, reports: true,
    matrix: false, users: false, comms: true
  },
  employee: {
    rh: false, teams: false, turnover: false, careers: false,
    purchases: false, evaluations: false, reports: false,
    matrix: false, users: false, comms: false
  }
};

// Expõe para acesso global
window.DEFAULT_ROLE_PERMISSIONS = DEFAULT_ROLE_PERMISSIONS;

// ─── Cache de permissões do usuário atual ────
window._userPermissions = null;

// ─── Inicializa permissões após login ────────
window.initPermissions = function(user) {
  if (!user) { window._userPermissions = {}; return; }

  // Parte da permissão padrão do role
  const rolePerms = DEFAULT_ROLE_PERMISSIONS[user.role] || {};

  // Mescla com permissões customizadas salvas (do Firebase/localStorage)
  const savedPerms = _loadSavedPermissions(user.email);

  window._userPermissions = Object.assign({}, rolePerms, savedPerms);
};

// ─── Verifica permissão ──────────────────────
window.hasPermission = function(module) {
  if (!window.currentUser) return false;
  // Admin sempre tem tudo
  if (window.currentUser.role === 'admin') return true;
  if (!window._userPermissions) return false;
  return window._userPermissions[module] === true;
};

// ─── Guarda permissões customizadas ─────────
// key: email do usuário, value: { module: bool }
function _loadSavedPermissions(email) {
  try {
    const raw = localStorage.getItem(`nt_perms_${email}`);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

window.saveUserPermissions = function(email, perms) {
  try {
    localStorage.setItem(`nt_perms_${email}`, JSON.stringify(perms));
    // Se for o usuário atual, atualiza em memória
    if (window.currentUser && window.currentUser.email === email) {
      const role = window.currentUser.role;
      const base = DEFAULT_ROLE_PERMISSIONS[role] || {};
      window._userPermissions = Object.assign({}, base, perms);
    }
  } catch(e) { console.error('Erro ao salvar permissões:', e); }
};

// ─── Bloqueia acesso a página sem permissão ──
window.guardPage = function(module, fallbackPage) {
  if (!window.hasPermission(module)) {
    if (window._ntShowToast) window._ntShowToast('⛔ Acesso negado a este módulo.', 'error');
    const fallback = fallbackPage ||
      (window.currentUser?.role === 'admin'   ? 'admin-dashboard' :
       window.currentUser?.role === 'boss'    ? 'boss-dashboard' :
       window.currentUser?.role === 'manager' ? 'supervisor-home' :
       window.currentUser?.role === 'rh'      ? 'rh-dashboard' : 'supervisor-home');
    setTimeout(() => window.navigateTo && window.navigateTo(fallback), 100);
    return false;
  }
  return true;
};

// ─── Lista todos os módulos com label ────────
window.ALL_MODULES = [
  { key: 'rh',          label: 'Módulo RH',              icon: 'fa-heartbeat' },
  { key: 'teams',       label: 'Equipes de Produção',     icon: 'fa-layer-group' },
  { key: 'turnover',    label: 'Turnover',                icon: 'fa-sync-alt' },
  { key: 'careers',     label: 'Trilha de Carreira',      icon: 'fa-sitemap' },
  { key: 'evaluations', label: 'Avaliações',              icon: 'fa-clipboard-list' },
  { key: 'reports',     label: 'Relatórios',              icon: 'fa-chart-bar' },
  { key: 'matrix',      label: 'Matriz de Polivalência',  icon: 'fa-th' },
  { key: 'purchases',   label: 'Compras',                 icon: 'fa-shopping-cart' },
  { key: 'users',       label: 'Usuários',                icon: 'fa-user-cog' },
  { key: 'comms',       label: 'Comunicados',             icon: 'fa-bullhorn' },
];

// ─── Retorna permissões de um usuário pelo email ──
window.getUserPermissions = function(email, role) {
  const base  = DEFAULT_ROLE_PERMISSIONS[role] || {};
  const saved = _loadSavedPermissions(email);
  return Object.assign({}, base, saved);
};

console.log('✅ Permissions Module carregado.');
