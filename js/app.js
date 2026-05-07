/* =============================================
   APP.JS — Lógica Principal
   Lumini — Gestão de Carreira & Polivalência
============================================= */

// ═══════════════════════════════════════════
//  DARK MODE — Toggle Sol/Lua
//  Persiste preferência em localStorage.
//  Aplicado ANTES do boot para evitar flash.
// ═══════════════════════════════════════════
(function _applyDarkModeEarly() {
  const saved = localStorage.getItem('nt_dark_mode');
  // Aplica imediatamente se salvo, ou segue preferência do SO
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const shouldDark  = saved !== null ? saved === 'true' : prefersDark;
  if (shouldDark) document.body.classList.add('dark-mode');
})();

window.toggleDarkMode = function(isDark) {
  document.body.classList.toggle('dark-mode', isDark);
  localStorage.setItem('nt_dark_mode', String(isDark));

  // Sincroniza o checkbox (pode ser chamado programaticamente)
  const cb = document.getElementById('dark-mode-checkbox');
  if (cb) cb.checked = isDark;

  // Atualiza tooltip
  const label = document.getElementById('dark-toggle-label');
  if (label) label.title = isDark ? 'Modo claro' : 'Modo escuro';
};

// Inicializa o estado visual do toggle ao DOM estar pronto
function _initDarkToggle() {
  const isDark = document.body.classList.contains('dark-mode');
  const cb = document.getElementById('dark-mode-checkbox');
  if (cb) cb.checked = isDark;
  const label = document.getElementById('dark-toggle-label');
  if (label) label.title = isDark ? 'Modo claro' : 'Modo escuro';
}

// ─── STATE ──────────────────────────────────
let currentUser = null;
let currentPage = '';
let currentEvalEmployeeId = null;
let starRating = 0;
let chartStatus = null;
let chartPie = null;
let chartEval = null;

// ─── STORAGE HELPERS ────────────────────────
function loadData(key, fallback) { return fallback; }
function saveData(key, value) {}

// ─── INIT ────────────────────────────────────
window.bootApp = function() {
  const saved = sessionStorage.getItem('cp_user');
  if (saved) {
    let user = JSON.parse(saved);
    const leg = window.LUMINI_LEGACY_EMAIL_MAP || {};
    const key = String(user.email || '').toLowerCase();
    if (leg[key]) {
      const fromDemo = DEMO_USERS.find(u => u.email === leg[key]);
      user = fromDemo || { ...user, email: leg[key] };
      sessionStorage.setItem('cp_user', JSON.stringify(user));
    }
    currentUser = user;
    startApp();
  }
};

window.refreshCurrentPage = function() {
  if (!currentUser || !currentPage) return;
  const refreshable = [
    'admin-dashboard','admin-employees','admin-evaluations',
    'admin-matrix','admin-reports','supervisor-home',
    'supervisor-employees','supervisor-team-attendance','supervisor-promo-history',
    'supervisor-excecoes','manager-excecoes',
    'manager-promo-approvals','boss-dashboard','boss-promo-approvals',
    'rh-dashboard','rh-employees','rh-turnover','rh-promocoes','rh-holerites',
    'admin-rh-dashboard','admin-rh-employees','admin-rh-turnover','admin-rh-holerites',
    'boss-rh-dashboard','boss-rh-turnover',
    'admin-teams','boss-teams','supervisor-teams','manager-teams',
    'purchases','admin-users',
    'admin-careers',
    'comms'
  ];
  if (refreshable.includes(currentPage)) navigateTo(currentPage);
};

// ─── LOGIN ────────────────────────────────────
function doLogin() {
  const email = document.getElementById('login-email').value.trim().toLowerCase();
  const pass  = document.getElementById('login-password').value.trim();
  const errEl = document.getElementById('login-error');

  const user = DEMO_USERS.find(u => u.email.toLowerCase() === email && u.password === pass);
  if (!user) { errEl.classList.remove('hidden'); return; }
  errEl.classList.add('hidden');
  currentUser = user;
  sessionStorage.setItem('cp_user', JSON.stringify(user));
  startApp();
}

function startApp() {
  document.getElementById('page-login').classList.remove('active');
  document.getElementById('page-login').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  applyUserTheme();

  const initials = currentUser.name.split(' ').slice(0,2).map(n=>n[0]).join('');
  document.getElementById('user-initials').textContent = initials;
  document.getElementById('user-menu-name').textContent = currentUser.name;
  document.getElementById('user-menu-role').textContent =
    currentUser.role === 'admin'   ? 'Administrador' :
    currentUser.role === 'manager' ? 'Gerente de Produção' :
    currentUser.role === 'boss'    ? 'Diretor Geral' :
    currentUser.role === 'rh'      ? 'Recursos Humanos' : 'Supervisor';

  // Inicializa permissões do usuário
  if (window.initPermissions) window.initPermissions(currentUser);

  if (currentUser.role === 'admin') {
    document.getElementById('menu-admin').classList.remove('hidden');
    navigateTo('admin-dashboard');
  } else if (currentUser.role === 'boss') {
    document.getElementById('menu-boss').classList.remove('hidden');
    navigateTo('boss-dashboard');
  } else if (currentUser.role === 'manager') {
    document.getElementById('menu-manager').classList.remove('hidden');
    navigateTo('supervisor-home');
  } else if (currentUser.role === 'rh') {
    document.getElementById('menu-rh').classList.remove('hidden');
    navigateTo('rh-dashboard');
  } else {
    document.getElementById('menu-supervisor').classList.remove('hidden');
    navigateTo('supervisor-home');
  }

  // Mostra itens de menu condicionais por permissão
  _applyMenuPermissions();

  if (window._ntSubscribeInAppNotifications) {
    window._ntSubscribeInAppNotifications(currentUser.email);
  }
  if (window._ntInitInAppNotifications) window._ntInitInAppNotifications();
  updateNotifBadge();
  initNotifications();
  updateExcecoesBadges();

  // Inicia onboarding automaticamente no primeiro acesso
  if (window._onboardingAutoStart) {
    setTimeout(() => {
      window._onboardingAutoStart();
      // Esconde badge "NOVO" se tour já foi feito
      const badge = document.getElementById('help-tour-badge');
      if (badge && window._ntIsTourDone && window._ntIsTourDone()) {
        badge.style.display = 'none';
      }
    }, 800);
  }
}

function _applyMenuPermissions() {
  // Mostra/esconde itens com data-permission
  document.querySelectorAll('[data-permission]').forEach(el => {
    const mod = el.getAttribute('data-permission');
    const show = window.hasPermission ? window.hasPermission(mod) : true;
    el.style.display = show ? '' : 'none';
  });
}

function applyUserTheme() {
  document.body.classList.remove('theme-sup1','theme-sup2','theme-admin','theme-andre','theme-carlos','theme-rh');
  if (!currentUser) return;
  const themeMap = {
    'sup1@lumini':    'theme-sup1',
    'sup2@lumini':    'theme-sup2',
    'sup3@lumini':    'theme-sup1',
    'sup4@lumini':    'theme-sup2',
    'admin@lumini':   'theme-admin',
    'admin2@lumini':  'theme-admin',
    'gerente@lumini': 'theme-andre',
    'diretor@lumini': 'theme-carlos',
    'rh@lumini':      'theme-rh'
  };
  const theme = themeMap[currentUser.email.toLowerCase()];
  if (theme) document.body.classList.add(theme);
}

function doLogout() {
  sessionStorage.removeItem('cp_user');
  document.body.classList.remove('theme-sup1','theme-sup2','theme-admin','theme-andre','theme-carlos');
  if (_notifCheckInterval) { clearInterval(_notifCheckInterval); _notifCheckInterval = null; }
  if (window._ntUnsubscribeInAppNotifications) window._ntUnsubscribeInAppNotifications();
  currentUser = null;
  location.reload();
}

Object.defineProperty(window, 'currentUser', { get: () => currentUser, set: v => { currentUser = v; } });
Object.defineProperty(window, 'currentPage',  { get: () => currentPage,  set: v => { currentPage  = v; } });

function togglePass() {
  const inp = document.getElementById('login-password');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

// ─── NAVIGATION ──────────────────────────────
function navigateTo(page) {
  document.querySelectorAll('.page-section').forEach(s => s.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const section = document.getElementById('page-' + page);
  if (section) section.classList.remove('hidden');

  document.querySelectorAll(`[data-page="${page}"]`).forEach(n => n.classList.add('active'));

  currentPage = page;
  closeSidebar();
  window.scrollTo(0,0);

  const renders = {
    'admin-dashboard':          renderAdminDashboard,
    'admin-employees':          renderEmployeesTable,
    'admin-careers':            renderCareers,
    'admin-supervisors':        renderSupervisorsOverview,
    'admin-evaluations':        renderEvaluationsList,
    'admin-matrix':             renderMatrix,
    'admin-reports':            renderReports,
    'supervisor-home':          renderSupervisorHome,
    'supervisor-employees':     renderSupervisorTeam,
    'supervisor-team-attendance': () => { if (window._dailyAttendanceRenderPage) window._dailyAttendanceRenderPage(); },
    'supervisor-promo-history': renderSupervisorPromoPage,
    'supervisor-excecoes':      renderSupExcecoes,
    'manager-excecoes':         renderMgrExcecoes,
    'manager-promo-approvals':  renderMgrPromoApprovals,
    'boss-dashboard':           renderBossDashboard,
    'boss-promo-approvals':     renderBossPromoApprovals,
    // RH pages — loaded from rh-module.js
    'rh-dashboard':  () => { if (window._rhRenderDashboard)  window._rhRenderDashboard(); },
    'rh-employees':  () => { if (window._rhRenderEmployees)  window._rhRenderEmployees(); },
    'rh-turnover':   () => { if (window._rhRenderTurnover)   window._rhRenderTurnover(); },
    'rh-promocoes':  () => { if (window._rhRenderPromocoes)  window._rhRenderPromocoes(); },
    'rh-holerites':  () => { if (window._rhRenderHolerites)  window._rhRenderHolerites('page-rh-holerites'); },
    // Admin aliases for RH pages
    'admin-rh-dashboard':  () => { if (window._rhRenderDashboardIn)  window._rhRenderDashboardIn('page-admin-rh-dashboard'); },
    'admin-rh-employees':  () => { if (window._rhRenderEmployeesIn)  window._rhRenderEmployeesIn('page-admin-rh-employees'); },
    'admin-rh-turnover':   () => { if (window._rhRenderTurnoverIn)   window._rhRenderTurnoverIn('page-admin-rh-turnover'); },
    'admin-rh-holerites':  () => { if (window._rhRenderHolerites)  window._rhRenderHolerites('page-admin-rh-holerites'); },
    // Boss aliases for RH dashboards (read-only, no CRUD)
    'boss-rh-dashboard':   () => { if (window._rhRenderDashboardIn)  window._rhRenderDashboardIn('page-boss-rh-dashboard', true); },
    'boss-rh-turnover':    () => { if (window._rhRenderTurnoverIn)   window._rhRenderTurnoverIn('page-boss-rh-turnover', true); },
    // Equipes de Produção
    'admin-teams':       () => { if (window._teamsRenderAdmin)   window._teamsRenderAdmin(); },
    'boss-teams':        () => { if (window._teamsRenderBoss)    window._teamsRenderBoss(); },
    'supervisor-teams':  () => { if (window._teamsRenderSup)     window._teamsRenderSup(); },
    'manager-teams':     () => { if (window._teamsRenderManager) window._teamsRenderManager(); },
    // Compras
    'purchases':         () => { if (window._purchRenderPage) window._purchRenderPage(); },
    // Gestão de Usuários
    'admin-users':       () => { if (window._usersRenderPage) window._usersRenderPage(); },
    // Comunicados
    'comms':             () => { if (window._commsRenderPage) window._commsRenderPage(); },
  };
  if (renders[page]) renders[page]();
}

function goBack() {
  if (currentUser.role === 'boss') navigateTo('boss-dashboard');
  else if (currentUser.role === 'supervisor' || currentUser.role === 'manager') navigateTo('supervisor-home');
  else navigateTo('admin-evaluations');
}

function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sidebar-overlay');
  const isOpen = sb.classList.toggle('open');
  if (ov) ov.classList.toggle('active', isOpen);
  // Previne scroll do body quando sidebar aberta
  document.body.style.overflow = isOpen ? 'hidden' : '';
}
function closeSidebar() {
  const sb = document.getElementById('sidebar');
  if (sb) sb.classList.remove('open');
  const ov = document.getElementById('sidebar-overlay');
  if (ov) ov.classList.remove('active');
  document.body.style.overflow = '';
}
function toggleUserMenu() { document.getElementById('user-menu').classList.toggle('hidden'); }
document.addEventListener('click', (e) => {
  const menu = document.getElementById('user-menu');
  if (menu && !menu.classList.contains('hidden')) {
    if (!e.target.closest('.topbar-right')) menu.classList.add('hidden');
  }
});

// Suporte touch para fechar sidebar deslizando para esquerda
(function() {
  let touchStartX = 0, touchStartY = 0;
  document.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY);
    const sb = document.getElementById('sidebar');
    // Deslizou para esquerda (>60px) e movimento mais horizontal que vertical
    if (dx < -60 && dy < 80 && sb && sb.classList.contains('open')) {
      closeSidebar();
    }
  }, { passive: true });
})();

// ─── UTILS ───────────────────────────────────
function calcTenure(admissionDate) {
  const now = new Date(), adm = new Date(admissionDate);
  let months = (now.getFullYear()-adm.getFullYear())*12 + (now.getMonth()-adm.getMonth());
  return months < 0 ? 0 : months;
}

function tenureText(months) {
  const y = Math.floor(months/12), m = months%12;
  const parts = [];
  if (y > 0) parts.push(`${y} ano${y>1?'s':''}`);
  if (m > 0) parts.push(`${m} mês${m>1?'es':''}`);
  return parts.length ? parts.join(' e ') : 'Recém admitido';
}

function getStatusInfo(employee) {
  const months = calcTenure(employee.admission);
  if (!employee.desiredRole || employee.status === 'registered') {
    return { label: '📋 Cadastrado', cls: 'status-registered', pct: 0, months };
  }
  const pct = Math.min(100, Math.round((months/employee.minMonths)*100));
  if (employee.status === 'promoted')               return { label: '⭐ Promovido',             cls: 'status-promoted',              pct, months };
  if (employee.status === 'approved')               return { label: '✅ Aprovado',               cls: 'status-approved',              pct, months };
  if (employee.status === 'pending_carlos')         return { label: '👑 Aguardando Diretor',     cls: 'status-pending-carlos',        pct, months };
  if (employee.status === 'pending_samuel')         return { label: '⏳ Ag. Samuel',             cls: 'status-pending-samuel',        pct, months };
  if (employee.status === 'pending_samuel_return')  return { label: '↩️ Retorno do Diretor',     cls: 'status-pending-samuel-return', pct, months };
  if (months >= employee.minMonths)                 return { label: '🟡 Apto para Avaliação',   cls: 'status-ready',                 pct: 100, months };
  return { label: '🔴 Em Período', cls: 'status-period', pct, months };
}

function getProgressColor(pct) {
  if (pct >= 100) return 'green';
  if (pct >= 50)  return 'yellow';
  return 'red';
}

/** Promoção normal exige tempo de casa ≥ mínimo do cargo destino (comparado em calcTenure vs career.minMonths). */
function isEligibleForNormalPromotionTenure(emp) {
  const months = calcTenure(emp.admission);
  const targets = getCareers().filter(c => c.name !== emp.currentRole);
  return targets.some(c => months >= c.minMonths);
}

function hasPendingExcecao(empId) {
  return getExcecoes().some(ex => ex.employeeId === empId && ex.status === 'pending');
}

const _PROMO_BLOCKED_STATUSES = ['pending_samuel', 'pending_samuel_return', 'pending_carlos', 'approved', 'promoted'];

function isSupervisorPromoFlowBlocked(e) {
  return _PROMO_BLOCKED_STATUSES.includes(e.status);
}

/** Botão "Promoção" (solicitação normal): só quando ainda sem cargo desejado e já há algum destino possível dentro do tempo. */
function canShowSupervisorPromoButton(e) {
  if (hasPendingExcecao(e.id)) return false;
  if (e.desiredRole || isSupervisorPromoFlowBlocked(e)) return false;
  return isEligibleForNormalPromotionTenure(e);
}

/**
 * Botão "Exceção": avaliação antecipada — sem tempo para promoção normal (nenhum cargo alcançável)
 * ou já cadastrado com cargo desejado mas abaixo do mínimo.
 */
function canShowSupervisorExcecaoButton(e) {
  if (hasPendingExcecao(e.id)) return false;
  if (isSupervisorPromoFlowBlocked(e)) return false;
  const months = calcTenure(e.admission);
  if (e.desiredRole && e.minMonths != null && months < e.minMonths && e.status === 'registered') return true;
  if (!e.desiredRole && !isEligibleForNormalPromotionTenure(e)) return true;
  return false;
}

/** Indicador quando já existe solicitação pendente (sem ação repetida). */
function supervisorExcecaoPendingButton() {
  return `<button type="button" class="btn-outline btn-sm" disabled title="Já existe solicitação em análise"><i class="fas fa-hourglass-half"></i> Exceção pendente</button>`;
}

function getInitials(name) {
  return name.split(' ').slice(0,2).map(n=>n[0]).join('').toUpperCase();
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const [y,m,d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function updateNotifBadge() {
  let count = 0;
  if (window._ntGetUnreadInAppCount) {
    count = window._ntGetUnreadInAppCount();
  }
  const badge = document.getElementById('badge-count');
  if (badge) {
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.style.display = count > 0 ? 'flex' : 'none';
  }
  updatePromoApprovalBadges();
}

function uuid() {
  return 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2,8);
}

// ─── ADMIN DASHBOARD ─────────────────────────
function renderAdminDashboard() {
  const employees   = getEmployees();
  const evaluations = getEvaluations();

  const total    = employees.length;
  const apt      = employees.filter(e => e.minMonths && calcTenure(e.admission) >= e.minMonths).length;
  const pending  = employees.filter(e => e.status === 'ready').length;
  const promoted = employees.filter(e => ['promoted','approved','pending_samuel','pending_samuel_return','pending_carlos'].includes(e.status)).length;

  document.getElementById('stat-total').textContent    = total;
  document.getElementById('stat-apt').textContent      = apt;
  document.getElementById('stat-pending').textContent  = pending;
  document.getElementById('stat-promoted').textContent = promoted;

  const eligible = employees.filter(e => e.status === 'ready');
  const listEl   = document.getElementById('recent-eligible-list');
  if (listEl) {
    if (!eligible.length) {
      listEl.innerHTML = `<div class="empty-state"><i class="fas fa-check-circle"></i><p>Nenhum funcionário aguardando avaliação</p></div>`;
    } else {
      listEl.innerHTML = eligible.map(e => {
        const months = calcTenure(e.admission);
        const supUser = DEMO_USERS.find(u => u.email === e.supervisor);
        return `<div class="recent-item">
          <div class="recent-avatar">${getInitials(e.name)}</div>
          <div class="recent-info">
            <div class="recent-name">${e.name}</div>
            <div class="recent-detail">${e.currentRole}${e.desiredRole?' → '+e.desiredRole:''} · ${supUser?supUser.name:e.supervisor}</div>
          </div>
          <span class="recent-badge">${tenureText(months)}</span>
        </div>`;
      }).join('');
    }
  }

  const teamMap = {
    'sup1@lumini':    { name: 'Daniel', color: '#003366' },
    'sup2@lumini':    { name: 'Kauê',   color: '#1B4F8A' },
    'sup3@lumini':    { name: 'Toni',   color: '#0F766E' },
    'sup4@lumini':    { name: 'Hélcio', color: '#92400E' },
    'gerente@lumini': { name: 'Samuel', color: '#7B2D8B' },
    'diretor@lumini': { name: 'Carlos', color: '#B45309' }
  };

  const teamCounts = {};
  employees.forEach(e => {
    const k = e.supervisor || 'outro';
    teamCounts[k] = (teamCounts[k]||0)+1;
  });
  const teamKeys   = Object.keys(teamCounts);
  const teamLabels = teamKeys.map(k => (teamMap[k]||{name:k}).name);
  const teamData   = teamKeys.map(k => teamCounts[k]);
  const teamBgs    = teamKeys.map(k => (teamMap[k]||{color:'#9CA3AF'}).color);

  window._selectedTeam = window._selectedTeam || null;

  function buildRoleChart(filterKey) {
    const source = filterKey ? employees.filter(e => e.supervisor === filterKey) : employees;
    const counts = {};
    source.forEach(e => { const r = e.currentRole||'Sem Cargo'; counts[r]=(counts[r]||0)+1; });
    const sorted = Object.entries(counts).sort((a,b)=>b[1]-a[1]);
    const labels = sorted.map(([r])=>r);
    const data   = sorted.map(([,n])=>n);
    const palette = ['#002B5B','#1B4F8A','#003366','#FFBED4','#FF6B9D','#7B2D8B','#B45309','#0891B2','#059669','#9333EA','#C2410C','#0F766E','#6D28D9','#BE185D','#1D4ED8'];
    const baseColor = filterKey ? (teamMap[filterKey]||{color:'#002B5B'}).color : null;
    const bgColors  = labels.map((_,i) => baseColor ? baseColor+(i===0?'FF':Math.max(60,255-i*28).toString(16).padStart(2,'0')) : palette[i%palette.length]);

    const titleEl  = document.getElementById('chart-role-title');
    const filterEl = document.getElementById('chart-role-filter-tag');
    if (titleEl) {
      if (filterKey) {
        const nm = (teamMap[filterKey]||{name:filterKey}).name;
        const cl = (teamMap[filterKey]||{color:'#002B5B'}).color;
        titleEl.textContent = `Cargos — Equipe ${nm}`;
        if (filterEl) filterEl.innerHTML = `<span class="role-filter-tag" style="background:${cl}20;color:${cl};border-color:${cl}40"><i class="fas fa-filter"></i> ${nm}<button onclick="window._clearTeamFilter()" title="Limpar filtro">✕</button></span>`;
      } else {
        titleEl.textContent = 'Funcionários por Cargo';
        if (filterEl) filterEl.innerHTML = '';
      }
    }

    if (window._chartByRole) { window._chartByRole.destroy(); window._chartByRole = null; }
    const ctx = document.getElementById('chart-by-role');
    if (!ctx) return;

    window._chartByRole = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: [{ label:'Funcionários', data, backgroundColor:bgColors, hoverBackgroundColor:bgColors.map(c=>c.slice(0,7)+'BB'), borderRadius:7, borderSkipped:false, borderWidth:0 }] },
      options: {
        indexAxis: 'y', responsive:true, maintainAspectRatio:false, animation:{duration:400,easing:'easeOutQuart'},
        plugins: { legend:{display:false}, tooltip:{ backgroundColor:'#1F2937', padding:10, cornerRadius:8, callbacks:{ title:ctx=>ctx[0].label, label:ctx=>` ${ctx.parsed.x} funcionário${ctx.parsed.x!==1?'s':''}` } } },
        scales: {
          x: { beginAtZero:true, ticks:{stepSize:1,font:{size:11},color:'#9CA3AF'}, grid:{color:'#F3F4F6'}, border:{display:false} },
          y: { ticks:{ font:{size:11,weight:'500'}, color:'#374151', callback:function(val,i){ const lbl=this.getLabelForValue(val); return lbl.length>22?lbl.slice(0,20)+'…':lbl; } }, grid:{display:false}, border:{display:false} }
        }
      }
    });
  }

  function highlightTeam(filterKey) {
    window._selectedTeam = filterKey;
    buildRoleChart(filterKey);
    if (window._chartByTeam) {
      const ds = window._chartByTeam.data.datasets[0];
      ds.backgroundColor = teamKeys.map((k,i) => !filterKey||k===filterKey ? teamBgs[i] : teamBgs[i]+'40');
      ds.borderWidth = teamKeys.map((k,i) => filterKey&&k===filterKey?4:2);
      window._chartByTeam.update('none');
    }
    document.querySelectorAll('.team-legend-item').forEach((el,i) => {
      if (!filterKey||teamKeys[i]===filterKey) { el.classList.remove('legend-dim'); el.classList.toggle('legend-active',!!filterKey&&teamKeys[i]===filterKey); }
      else { el.classList.add('legend-dim'); el.classList.remove('legend-active'); }
    });
  }

  window._clearTeamFilter = function() { highlightTeam(null); };

  if (window._chartByTeam) { window._chartByTeam.destroy(); window._chartByTeam = null; }
  const teamCtx = document.getElementById('chart-by-team');
  if (teamCtx) {
    window._chartByTeam = new Chart(teamCtx, {
      type: 'doughnut',
      data: { labels:teamLabels, datasets:[{ data:teamData, backgroundColor:teamBgs, borderWidth:2, borderColor:'#fff', hoverOffset:12 }] },
      options: {
        responsive:true, maintainAspectRatio:false, cutout:'62%', layout:{padding:6}, animation:{duration:350},
        plugins: { legend:{display:false}, tooltip:{ backgroundColor:'#1F2937', padding:10, cornerRadius:8, callbacks:{ label:ctx=>` ${ctx.label}: ${ctx.parsed} funcionário${ctx.parsed!==1?'s':''}` } } },
        onClick(evt,elements) {
          if (!elements.length) { highlightTeam(null); return; }
          const idx = elements[0].index;
          const key = teamKeys[idx];
          highlightTeam(window._selectedTeam===key?null:key);
        }
      }
    });
  }

  const legendEl = document.getElementById('chart-team-legend');
  if (legendEl) {
    const maxTeam = Math.max(...teamData,1);
    legendEl.innerHTML = teamKeys.map((k,i) => {
      const pct = Math.round((teamData[i]/maxTeam)*100);
      const color = teamBgs[i];
      return `<div class="team-legend-item" onclick="window._legendTeamClick('${k}')" title="Filtrar por ${teamLabels[i]}">
        <span class="team-legend-dot" style="background:${color}"></span>
        <span class="team-legend-name">${teamLabels[i]}</span>
        <span class="team-legend-count-bar"><span class="team-legend-count-fill" style="width:${pct}%;background:${color}"></span></span>
        <span class="team-legend-val" style="color:${color}">${teamData[i]}</span>
      </div>`;
    }).join('');
  }

  window._legendTeamClick = function(key) { highlightTeam(window._selectedTeam===key?null:key); };

  buildRoleChart(window._selectedTeam);
  window._selectedTeam = null;

  const statusPeriod   = employees.filter(e => !e.minMonths||calcTenure(e.admission)<e.minMonths).length;
  const statusReady    = employees.filter(e => e.status==='ready').length;
  const statusApproved = employees.filter(e => e.status==='approved').length;
  const statusPromoted = employees.filter(e => e.status==='promoted').length;
  const statusPSamuel  = employees.filter(e => ['pending_samuel','pending_samuel_return'].includes(e.status)).length;
  const statusPCarlos  = employees.filter(e => e.status==='pending_carlos').length;
  const statusReg      = employees.filter(e => e.status==='registered'&&(!e.minMonths||calcTenure(e.admission)<e.minMonths)).length;

  if (chartStatus) { chartStatus.destroy(); chartStatus = null; }
  const ctx = document.getElementById('chart-status');
  if (ctx) {
    chartStatus = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Cadastrado','Em Período','Apto p/ Aval.','Ag. Samuel','Ag. Carlos','Aprovado','Promovido'], // Ag. Samuel = pending_samuel (gerente)
        datasets: [{ label:'Funcionários', data:[statusReg,statusPeriod,statusReady,statusPSamuel,statusPCarlos,statusApproved,statusPromoted], backgroundColor:['#E0E7FF','#FEE2E2','#FEF3C7','#FDE68A','#DDD6FE','#DCFCE7','#EDE9FE'], borderColor:['#6366F1','#DC2626','#D97706','#B45309','#7C3AED','#16A34A','#5D36C5'], borderWidth:2, borderRadius:8 }]
      },
      options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label:ctx=>` ${ctx.parsed.y} funcionário${ctx.parsed.y!==1?'s':''}` } } }, scales:{ y:{beginAtZero:true,ticks:{stepSize:1},grid:{color:'#F3F4F6'}}, x:{grid:{display:false},ticks:{font:{size:11}}} } }
    });
  }

  renderPromoHistory('', null);
}

// ─── PROMO HISTORY DASHBOARD ─────────────────
function renderPromoHistory(prefix, filteredEmployees) {
  const employees   = filteredEmployees || getEmployees();
  const evaluations = getEvaluations();
  const ENTRY_ROLE  = 'Ajudante de Produção';

  const promoted   = employees.filter(e => e.currentRole !== ENTRY_ROLE);
  const stillEntry = employees.filter(e => e.currentRole === ENTRY_ROLE);
  const approved   = employees.filter(e => ['approved','pending_samuel','pending_samuel_return','pending_carlos'].includes(e.status));
  const total      = employees.length;
  const taxaPct    = total > 0 ? Math.round((promoted.length/total)*100) : 0;

  const kpisEl = document.getElementById(prefix+'promo-kpis');
  if (kpisEl) {
    kpisEl.innerHTML = `
      <div class="promo-kpi"><div class="promo-kpi-icon" style="background:#DCFCE7;color:#16A34A">🚀</div><div class="promo-kpi-val">${promoted.length}</div><div class="promo-kpi-label">Promovidos</div></div>
      <div class="promo-kpi"><div class="promo-kpi-icon" style="background:#FFF7ED;color:#F97316">⏳</div><div class="promo-kpi-val">${stillEntry.length}</div><div class="promo-kpi-label">Ainda Ajudantes</div></div>
      <div class="promo-kpi"><div class="promo-kpi-icon" style="background:#DBEAFE;color:#2563EB">✅</div><div class="promo-kpi-val">${approved.length}</div><div class="promo-kpi-label">Aprovados</div></div>
      <div class="promo-kpi"><div class="promo-kpi-icon" style="background:#EDE9FE;color:#7C3AED">📊</div><div class="promo-kpi-val">${taxaPct}%</div><div class="promo-kpi-label">Taxa de Promoção</div></div>`;
  }

  const destCounts = {};
  promoted.forEach(e => { const r=e.currentRole||'Outro'; destCounts[r]=(destCounts[r]||0)+1; });
  const destSorted = Object.entries(destCounts).sort((a,b)=>b[1]-a[1]);
  const maxDest    = Math.max(...destSorted.map(([,n])=>n),1);

  const destEl = document.getElementById(prefix+'promo-dest-chart');
  if (destEl) {
    if (!destSorted.length) {
      destEl.innerHTML = `<div class="empty-state" style="padding:20px"><i class="fas fa-info-circle"></i><p>Nenhum promovido ainda</p></div>`;
    } else {
      const colors = ['#002B5B','#1B4F8A','#003366','#FF6B9D','#FFBED4','#7B2D8B','#B45309','#0891B2'];
      destEl.innerHTML = destSorted.map(([role,count],i) => {
        const pct = Math.round((count/maxDest)*100);
        const color = colors[i%colors.length];
        return `<div class="promo-dest-row">
          <div class="promo-dest-label">${role}</div>
          <div class="promo-dest-bar-wrap"><div class="promo-dest-bar" style="width:${pct}%;background:${color}"></div></div>
          <div class="promo-dest-count" style="color:${color}">${count}</div>
        </div>`;
      }).join('');
    }
  }

  const promoEvs  = evaluations.filter(e => e.result==='approved'||e.result==='promoted');
  const sorted    = [...promoEvs].sort((a,b)=>new Date(b.date)-new Date(a.date));
  const timelineEl = document.getElementById(prefix+'promo-timeline');
  if (timelineEl) {
    if (!sorted.length) {
      timelineEl.innerHTML = `<div class="empty-state" style="padding:20px"><i class="fas fa-history"></i><p>Nenhum histórico ainda</p></div>`;
    } else {
      timelineEl.innerHTML = sorted.slice(0,8).map(ev => {
        const emp = employees.find(e=>e.id===ev.employeeId);
        const name = emp?emp.name:'Funcionário';
        return `<div class="promo-timeline-item">
          <div class="promo-tl-dot"></div>
          <div class="promo-tl-content">
            <div class="promo-tl-name">${name}</div>
            <div class="promo-tl-detail">${ev.fromRole||'—'} → ${ev.toRole||'—'}</div>
            <div class="promo-tl-date">${formatDate(ev.date)}</div>
          </div>
        </div>`;
      }).join('');
    }
  }

  const tableEl  = document.getElementById(prefix+'promo-detail-table');
  const countEl  = document.getElementById(prefix+'promo-table-count');
  if (tableEl) {
    const allPromoted = employees.filter(e => e.currentRole !== ENTRY_ROLE || ['approved','pending_samuel','pending_samuel_return','pending_carlos','promoted'].includes(e.status));
    if (countEl) countEl.textContent = `${allPromoted.length} registro${allPromoted.length!==1?'s':''}`;
    if (!allPromoted.length) {
      tableEl.innerHTML = `<div class="empty-state"><i class="fas fa-list-alt"></i><p>Nenhum registro de promoção</p></div>`;
    } else {
      tableEl.innerHTML = `<div class="table-wrapper"><table class="data-table"><thead><tr><th>Funcionário</th><th>Cargo Atual</th><th>Supervisor</th><th>Admissão</th><th>Tempo de Casa</th><th>Status</th></tr></thead><tbody>${
        allPromoted.map(e => {
          const months = calcTenure(e.admission);
          const supUser = DEMO_USERS.find(u=>u.email===e.supervisor);
          const si = getStatusInfo(e);
          return `<tr><td><strong>${e.name}</strong></td><td>${e.currentRole}</td><td>${supUser?supUser.name:e.supervisor||'—'}</td><td>${formatDate(e.admission)}</td><td>${tenureText(months)}</td><td><span class="status-badge ${si.cls}">${si.label}</span></td></tr>`;
        }).join('')
      }</tbody></table></div>`;
    }
  }
}

// ─── EMPLOYEES TABLE (Admin) ──────────────────
function renderEmployeesTable() {
  const employees = getEmployees();
  const query     = (document.getElementById('search-employees')?.value||'').toLowerCase();
  const filtered  = employees.filter(e => e.name.toLowerCase().includes(query) || (e.currentRole||'').toLowerCase().includes(query));

  // Aviso: funcionários sem vínculo com o RH
  const semVinculo = employees.filter(e => !e.rhMatricula);
  const warningEl  = document.getElementById('emp-no-rh-warning');
  if (warningEl) {
    if (semVinculo.length > 0) {
      warningEl.style.display = '';
      warningEl.innerHTML = `<i class="fas fa-exclamation-triangle"></i>
        <span><strong>${semVinculo.length} funcionário(s)</strong> foram cadastrados manualmente e não têm vínculo com o banco de dados RH.
        Para vincular: exclua-os e reimporte usando o botão <strong>Importar do RH</strong>.</span>`;
    } else {
      warningEl.style.display = 'none';
    }
  }

  const tbody = document.getElementById('employees-tbody');
  if (!tbody) return;

  if (!filtered.length) {
    const isEmpty = employees.length === 0;
    tbody.innerHTML = isEmpty
      ? `<tr><td colspan="6" class="empty-cell">
          <div style="padding:24px;text-align:center">
            <i class="fas fa-users" style="font-size:36px;color:#D1D5DB;display:block;margin-bottom:12px"></i>
            <p style="color:#9CA3AF;margin-bottom:16px;font-size:14px">Nenhum funcionário cadastrado na trilha de carreira ainda.<br>Importe direto do banco de dados RH ou faça o cadastro manual.</p>
            <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
              <button class="btn-primary" onclick="openImportFromRH()">
                <i class="fas fa-file-import"></i> Importar do banco de dados RH
              </button>
              <button class="btn-outline" onclick="openAddEmployee()">
                <i class="fas fa-plus"></i> Cadastro manual
              </button>
            </div>
          </div>
        </td></tr>`
      : `<tr><td colspan="6" class="empty-cell"><i class="fas fa-user-slash"></i> Nenhum funcionário encontrado para "${query}"</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(e => {
    const months  = calcTenure(e.admission);
    const si      = getStatusInfo(e);
    const pctColor= getProgressColor(si.pct);
    const supUser = DEMO_USERS.find(u=>u.email===e.supervisor);
    const supName = supUser ? supUser.name : (e.supervisor||'—');
    // Mostra líder de campo (do RH) se diferente do supervisor do sistema
    const liderLabel = e.rhLider && e.rhLider !== supName ? ` · Líder: ${e.rhLider}` : '';
    return `<tr>
      <td>
        <div class="emp-name-cell">
          <div class="emp-avatar-sm">${getInitials(e.name)}</div>
          <div>
            <div class="emp-name">${e.name}${e.rhMatricula?` <span style="font-size:10px;color:#9CA3AF;font-weight:400">Mat.${e.rhMatricula}</span>`:''}</div>
            <div class="emp-meta">${supName}${liderLabel} · ${e.sector||'Produção'}</div>
          </div>
        </div>
      </td>
      <td>
        <div class="role-cell">
          <span class="role-current">${e.currentRole||'—'}</span>
          ${e.desiredRole?`<span class="role-arrow">→</span><span class="role-desired">${e.desiredRole}</span>`:''}
        </div>
      </td>
      <td>${tenureText(months)}</td>
      <td>
        <div class="progress-wrap">
          <div class="progress-bar-bg"><div class="progress-bar-fill ${pctColor}" style="width:${si.pct}%"></div></div>
          <span class="progress-pct">${si.pct}%</span>
        </div>
      </td>
      <td><span class="status-badge ${si.cls}">${si.label}</span></td>
      <td>
        <div class="action-btns">
          <button class="btn-icon" onclick="openEditEmployee('${e.id}')" title="Editar"><i class="fas fa-edit"></i></button>
          <button class="btn-icon red" onclick="deleteEmployee('${e.id}')" title="Excluir"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

// ─── MAPEAMENTO: LÍDER RH → SUPERVISOR SISTEMA ─
// Líderes de campo do RH são agrupados sob os supervisores do sistema (e-mails estáveis em employees).
// Daniel/Kauê/Toni/Hélcio = supervisores; Samuel = gerente; Carlos = diretor.
const RH_LIDER_TO_SUPERVISOR = {
  'Heleno':  'sup2@lumini',
  'Renato':  'sup1@lumini',
  'Daniel':  'sup1@lumini',
  'Kauê':    'sup2@lumini',
  'Kaue':    'sup2@lumini',
  'André':   'gerente@lumini',
  'Samuel':  'gerente@lumini',
  'Toni':    'sup3@lumini',
  'Hélcio':  'sup4@lumini',
  'Helcio':  'sup4@lumini',
  'Rogério': 'sup2@lumini',
  'Davi':    'sup1@lumini',
  'Carlos':  'diretor@lumini',
  'Wesley':  'admin@lumini',
};

function _rhLiderToSupervisor(lider) {
  if (!lider) return '';
  // Busca exata primeiro
  if (RH_LIDER_TO_SUPERVISOR[lider]) return RH_LIDER_TO_SUPERVISOR[lider];
  // Busca parcial (ex: "André Rocha" → André)
  for (const [key, val] of Object.entries(RH_LIDER_TO_SUPERVISOR)) {
    if (lider.toLowerCase().startsWith(key.toLowerCase())) return val;
  }
  return 'sup2@lumini'; // fallback
}

// ─── MODAL: ADD/EDIT EMPLOYEE ─────────────────
function openAddEmployee() {
  openEmployeeModal();
}
function openEditEmployee(id) {
  const emp = getEmployees().find(e=>e.id===id);
  if (emp) openEmployeeModal(emp);
}

function openEmployeeModal(emp = null) {
  const isEdit  = !!emp;
  const careers = getCareers();

  // Pré-carrega colaboradores de Produção do banco RH para seleção rápida
  const rhEmps = window.getHREmployees ? window.getHREmployees() : (window.HR_EMPLOYEES_SEED || []);
  const prodRhEmps = rhEmps.filter(e =>
    e.setor === 'Produção' && (e.situacao === 'ATIVO' || e.situacao === 'FÉRIAS')
  );
  // Exclui quem já está cadastrado no sistema de carreira
  const alreadyIds = getEmployees().map(e => e.rhMatricula).filter(Boolean);
  const availableRh = prodRhEmps.filter(e => !alreadyIds.includes(e.matricula));

  const modal = document.createElement('div');
  modal.id = 'emp-modal-overlay';
  modal.className = 'modal-overlay';

  if (isEdit) {
    // Modo edição: formulário manual (mantém compatibilidade)
    modal.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3>✏️ Editar Funcionário</h3>
          <button class="modal-close" onclick="document.getElementById('emp-modal-overlay').remove()"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <div class="form-group">
              <label>Nome Completo *</label>
              <input type="text" id="emp-name" value="${emp.name||''}" />
            </div>
            <div class="form-group">
              <label>Data de Admissão *</label>
              <input type="date" id="emp-admission" value="${emp.admission||''}" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Cargo Atual *</label>
              <select id="emp-current-role">
                <option value="">-- Selecione --</option>
                ${careers.map(c=>`<option value="${c.name}" ${emp.currentRole===c.name?'selected':''}>${c.name}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Supervisor *</label>
              <select id="emp-supervisor">
                <option value="">-- Selecione --</option>
                <option value="sup1@lumini" ${emp.supervisor==='sup1@lumini'?'selected':''}>Daniel</option>
                <option value="sup2@lumini" ${emp.supervisor==='sup2@lumini'?'selected':''}>Kauê</option>
                <option value="sup3@lumini" ${emp.supervisor==='sup3@lumini'?'selected':''}>Toni</option>
                <option value="sup4@lumini" ${emp.supervisor==='sup4@lumini'?'selected':''}>Hélcio</option>
                <option value="gerente@lumini"  ${emp.supervisor==='gerente@lumini'?'selected':''}>Samuel (Gerente)</option>
                <option value="diretor@lumini" ${emp.supervisor==='diretor@lumini'?'selected':''}>Carlos (Diretor)</option>
              </select>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-outline" onclick="document.getElementById('emp-modal-overlay').remove()">Cancelar</button>
          <button class="btn-primary" onclick="saveEmployee_modal('${emp.id}')">
            <i class="fas fa-save"></i> Salvar Alterações
          </button>
        </div>
      </div>`;
  } else {
    // Modo NOVO: duas abas — "Buscar no RH" e "Manual"
    modal.innerHTML = `
      <div class="modal" style="max-width:700px">
        <div class="modal-header">
          <h3>➕ Novo Funcionário</h3>
          <button class="modal-close" onclick="document.getElementById('emp-modal-overlay').remove()"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body">

          <!-- Abas -->
          <div class="emp-modal-tabs">
            <button class="emp-modal-tab active" id="tab-rh-btn" onclick="_empSwitchTab('rh')">
              <i class="fas fa-database"></i> Buscar no Banco de Dados RH
            </button>
            <button class="emp-modal-tab" id="tab-manual-btn" onclick="_empSwitchTab('manual')">
              <i class="fas fa-keyboard"></i> Cadastro Manual
            </button>
          </div>

          <!-- ABA: RH -->
          <div id="emp-tab-rh">
            <p class="emp-rh-hint">
              <i class="fas fa-info-circle"></i>
              Selecione um colaborador do setor de <strong>Produção</strong> já cadastrado no RH.
              Os dados (nome, admissão, cargo, líder) são preenchidos automaticamente.
            </p>
            <div class="rh-search-wrap" style="margin-bottom:10px">
              <i class="fas fa-search"></i>
              <input type="text" id="emp-rh-search" placeholder="Buscar por nome, matrícula ou cargo..." 
                oninput="_empFilterRhList()" />
            </div>
            <div id="emp-rh-list" class="emp-rh-list">
              ${_buildRhPickerList(availableRh, careers)}
            </div>
            ${availableRh.length === 0 ? '' : `
            <div style="margin-top:12px;font-size:12px;color:#9CA3AF;text-align:center">
              Mostrando colaboradores ativos de Produção ainda não cadastrados na trilha de carreira
            </div>`}
          </div>

          <!-- ABA: MANUAL -->
          <div id="emp-tab-manual" style="display:none">
            <div class="form-row">
              <div class="form-group">
                <label>Nome Completo *</label>
                <input type="text" id="emp-name" placeholder="Nome do funcionário" />
              </div>
              <div class="form-group">
                <label>Data de Admissão *</label>
                <input type="date" id="emp-admission" />
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Cargo Atual *</label>
                <select id="emp-current-role">
                  <option value="">-- Selecione --</option>
                  ${careers.map(c=>`<option value="${c.name}">${c.name}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label>Supervisor *</label>
                <select id="emp-supervisor">
                  <option value="">-- Selecione --</option>
                  <option value="sup1@lumini">Daniel</option>
                  <option value="sup2@lumini">Kauê</option>
                  <option value="sup3@lumini">Toni</option>
                  <option value="sup4@lumini">Hélcio</option>
                  <option value="gerente@lumini">Samuel (Gerente)</option>
                  <option value="diretor@lumini">Carlos (Diretor)</option>
                </select>
              </div>
            </div>
            <div class="info-box">
              <i class="fas fa-info-circle"></i>
              O cargo desejado pode ser configurado depois via <strong>Solicitação de Promoção</strong>.
            </div>
          </div>

        </div>
        <div class="modal-footer" id="emp-modal-footer">
          <button class="btn-outline" onclick="document.getElementById('emp-modal-overlay').remove()">Cancelar</button>
          <button class="btn-primary" id="emp-save-btn" onclick="saveEmployee_modal('')" style="display:none">
            <i class="fas fa-save"></i> Adicionar Funcionário
          </button>
        </div>
      </div>`;
  }

  document.body.appendChild(modal);

  // Guarda dados do RH selecionado
  window._empSelectedRh = null;
}

// Constrói a lista de seleção do RH
function _buildRhPickerList(rhEmps, careers) {
  if (!rhEmps.length) {
    return `<div class="emp-rh-empty">
      <i class="fas fa-check-circle" style="color:#16A34A;font-size:24px"></i>
      <p>Todos os colaboradores ativos de Produção já estão cadastrados!</p>
    </div>`;
  }
  return rhEmps.map(emp => {
    const admFmt  = emp.admissao ? emp.admissao.split('-').reverse().join('/') : '—';
    const supName = _rhLiderToSupervisorName(emp.lider);
    const supEmail = _rhLiderToSupervisor(emp.lider);
    const careerMatch = careers.find(c => {
      const cn = c.name.toLowerCase();
      const cg = (emp.cargo||'').toLowerCase();
      return cg.includes(cn) || cn.includes(cg.split(' ')[0]);
    });
    return `
    <div class="emp-rh-item" id="rhi-${emp.matricula}" onclick="_empSelectRh('${emp.matricula}')" data-mat="${emp.matricula}">
      <div class="emp-rh-avatar">${getInitials(emp.nome)}</div>
      <div class="emp-rh-info">
        <div class="emp-rh-name">${emp.nome} <span class="emp-rh-mat">Mat. ${emp.matricula}</span></div>
        <div class="emp-rh-details">
          <span><i class="fas fa-briefcase"></i> ${emp.cargo}</span>
          <span><i class="fas fa-user-tie"></i> ${supName}</span>
          <span><i class="fas fa-calendar-alt"></i> Adm. ${admFmt}</span>
        </div>
      </div>
      <div class="emp-rh-check"><i class="fas fa-circle" style="color:#E5E7EB"></i></div>
    </div>`;
  }).join('');
}

function _rhLiderToSupervisorName(lider) {
  const email = _rhLiderToSupervisor(lider);
  const u = DEMO_USERS.find(u => u.email === email);
  return u ? `${u.name}${u.role==='manager'?' (Gerente)':u.role==='boss'?' (Diretor)':''}` : (lider || '—');
}

// Filtro da lista RH no picker
window._empFilterRhList = function() {
  const q = (document.getElementById('emp-rh-search')?.value || '').toLowerCase();
  document.querySelectorAll('.emp-rh-item').forEach(el => {
    const mat  = el.dataset.mat || '';
    const text = el.textContent.toLowerCase();
    el.style.display = (!q || text.includes(q) || mat.includes(q)) ? '' : 'none';
  });
};

// Troca de aba no modal
window._empSwitchTab = function(tab) {
  document.getElementById('emp-tab-rh').style.display     = tab === 'rh'     ? '' : 'none';
  document.getElementById('emp-tab-manual').style.display = tab === 'manual' ? '' : 'none';
  document.getElementById('tab-rh-btn').classList.toggle('active',     tab === 'rh');
  document.getElementById('tab-manual-btn').classList.toggle('active', tab === 'manual');
  // Botão salvar só aparece no manual (no RH aparece ao selecionar)
  const saveBtn = document.getElementById('emp-save-btn');
  if (saveBtn) saveBtn.style.display = tab === 'manual' ? '' : 'none';
  if (tab === 'rh') { window._empSelectedRh = null; }
};

// Seleciona um funcionário do picker RH
window._empSelectRh = function(matricula) {
  // Desmarca anterior
  document.querySelectorAll('.emp-rh-item').forEach(el => {
    el.classList.remove('selected');
    const icon = el.querySelector('.emp-rh-check i');
    if (icon) { icon.className = 'fas fa-circle'; icon.style.color = '#E5E7EB'; }
  });

  const el = document.getElementById('rhi-' + matricula);
  if (!el) return;
  el.classList.add('selected');
  const icon = el.querySelector('.emp-rh-check i');
  if (icon) { icon.className = 'fas fa-check-circle'; icon.style.color = '#16A34A'; }

  // Encontra o colaborador
  const rhEmps = window.getHREmployees ? window.getHREmployees() : (window.HR_EMPLOYEES_SEED || []);
  const emp = rhEmps.find(e => e.matricula === matricula);
  if (!emp) return;

  window._empSelectedRh = emp;

  // Mostra botão salvar
  const saveBtn = document.getElementById('emp-save-btn');
  if (saveBtn) saveBtn.style.display = '';

  // Atualiza footer com preview
  const footer = document.getElementById('emp-modal-footer');
  if (footer) {
    const supName  = _rhLiderToSupervisorName(emp.lider);
    const admFmt   = emp.admissao ? emp.admissao.split('-').reverse().join('/') : '—';
    const existing = footer.querySelector('.emp-rh-preview');
    if (existing) existing.remove();
    const prev = document.createElement('div');
    prev.className = 'emp-rh-preview';
    prev.innerHTML = `<i class="fas fa-user-check" style="color:#16A34A"></i> <strong>${emp.nome}</strong> · ${emp.cargo} · ${supName} · Adm. ${admFmt}`;
    footer.insertBefore(prev, footer.firstChild);
  }
};

function saveEmployee_modal(editId) {
  const employees = getEmployees();

  if (editId) {
    // ── Salvar edição manual ──
    const name       = document.getElementById('emp-name')?.value.trim();
    const admission  = document.getElementById('emp-admission')?.value;
    const currentRole= document.getElementById('emp-current-role')?.value;
    const supervisor = document.getElementById('emp-supervisor')?.value;
    if (!name||!admission||!currentRole||!supervisor) {
      alert('Preencha todos os campos obrigatórios!'); return;
    }
    const idx = employees.findIndex(e=>e.id===editId);
    if (idx >= 0) {
      employees[idx] = { ...employees[idx], name, admission, currentRole, supervisor };
    }
    saveEmployees(employees);
    document.getElementById('emp-modal-overlay')?.remove();
    renderEmployeesTable();
    return;
  }

  // ── Novo: verifica aba ativa ──
  const tabRh = document.getElementById('emp-tab-rh');
  const isRhTab = tabRh && tabRh.style.display !== 'none';

  if (isRhTab) {
    // ── Salvar via RH ──
    const rhEmp = window._empSelectedRh;
    if (!rhEmp) { alert('Selecione um colaborador do banco de dados RH!'); return; }

    const careers = getCareers();
    // Tenta mapear o cargo do RH para um cargo da trilha de carreira
    const careerMatch = _matchCareerFromRhCargo(rhEmp.cargo, careers);
    const supervisor  = _rhLiderToSupervisor(rhEmp.lider);

    employees.push({
      id:          uuid(),
      rhMatricula: rhEmp.matricula,
      name:        rhEmp.nome,
      admission:   rhEmp.admissao || '',
      sector:      rhEmp.setor   || 'Produção',
      currentRole: careerMatch ? careerMatch.name : (rhEmp.cargo || 'Ajudante de Produção'),
      desiredRole: null,
      minMonths:   careerMatch ? careerMatch.minMonths : null,
      supervisor,
      rhLider:     rhEmp.lider || '',
      status:      'registered',
      promoObs:    '',
      skills:      {}
    });

  } else {
    // ── Salvar via formulário manual ──
    const name       = document.getElementById('emp-name')?.value.trim();
    const admission  = document.getElementById('emp-admission')?.value;
    const currentRole= document.getElementById('emp-current-role')?.value;
    const supervisor = document.getElementById('emp-supervisor')?.value;
    if (!name||!admission||!currentRole||!supervisor) {
      alert('Preencha todos os campos obrigatórios!'); return;
    }
    const allCareers = getCareers();
    const career = allCareers.find(c=>c.name===currentRole);
    employees.push({
      id: uuid(), rhMatricula: null, name, admission, sector: 'Produção', currentRole,
      desiredRole: null, minMonths: career ? career.minMonths : null,
      supervisor, status: 'registered', promoObs: '', skills: {}
    });
  }

  saveEmployees(employees);
  document.getElementById('emp-modal-overlay')?.remove();
  renderEmployeesTable();
}

// ─── IMPORTAR DO RH (lote) ─────────────────────
function openImportFromRH() {
  const rhEmps    = window.getHREmployees ? window.getHREmployees() : (window.HR_EMPLOYEES_SEED || []);
  const careers   = getCareers();
  const existing  = getEmployees();
  const existMats = existing.map(e => e.rhMatricula).filter(Boolean);

  // Apenas Produção, ativos, não cadastrados ainda
  const candidates = rhEmps.filter(e =>
    e.setor === 'Produção' &&
    (e.situacao === 'ATIVO' || e.situacao === 'FÉRIAS') &&
    !existMats.includes(e.matricula)
  );

  const modal = document.createElement('div');
  modal.id = 'import-modal-overlay';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal" style="max-width:780px">
      <div class="modal-header">
        <h3><i class="fas fa-file-import"></i> Importar Colaboradores do RH</h3>
        <button class="modal-close" onclick="document.getElementById('import-modal-overlay').remove()">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="modal-body">
        <div class="import-rh-info">
          <i class="fas fa-info-circle" style="color:#2563EB"></i>
          <span>Selecione os colaboradores do setor de <strong>Produção</strong> que deseja incluir na <strong>Trilha de Carreira</strong>.
          O cargo e supervisor são mapeados automaticamente do banco de dados RH.
          ${existing.length > 0 ? `<br><span style="color:#16A34A"><i class="fas fa-check"></i> ${existing.length} funcionário(s) já cadastrado(s) não aparecem nesta lista.</span>` : ''}</span>
        </div>

        ${candidates.length === 0 ? `
        <div class="emp-rh-empty">
          <i class="fas fa-check-circle" style="color:#16A34A;font-size:32px"></i>
          <p>Todos os colaboradores ativos de Produção já estão cadastrados na trilha de carreira!</p>
        </div>` : `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
          <div class="rh-search-wrap" style="flex:1;min-width:200px">
            <i class="fas fa-search"></i>
            <input type="text" id="import-search" placeholder="Buscar por nome, matrícula ou cargo..." oninput="_importFilterList()" />
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn-outline btn-sm" onclick="_importSelectAll(true)"><i class="fas fa-check-square"></i> Todos</button>
            <button class="btn-outline btn-sm" onclick="_importSelectAll(false)"><i class="fas fa-square"></i> Nenhum</button>
          </div>
        </div>
        <div id="import-rh-list" class="emp-rh-list" style="max-height:380px">
          ${candidates.map(emp => {
            const admFmt  = emp.admissao ? emp.admissao.split('-').reverse().join('/') : '—';
            const supName = _rhLiderToSupervisorName(emp.lider);
            const career  = _matchCareerFromRhCargo(emp.cargo, careers);
            const carLabel = career ? career.name : `<span style="color:#D97706">${emp.cargo} <i class="fas fa-exclamation-triangle" title="Cargo não mapeado — será registrado como está"></i></span>`;
            return `
            <label class="emp-rh-item import-item" data-mat="${emp.matricula}">
              <input type="checkbox" class="import-checkbox" value="${emp.matricula}" checked style="width:16px;height:16px;accent-color:#4361ee;flex-shrink:0;cursor:pointer" />
              <div class="emp-rh-avatar">${getInitials(emp.nome)}</div>
              <div class="emp-rh-info" style="flex:1">
                <div class="emp-rh-name">${emp.nome} <span class="emp-rh-mat">Mat. ${emp.matricula}</span></div>
                <div class="emp-rh-details">
                  <span><i class="fas fa-briefcase"></i> Trilha: ${carLabel}</span>
                  <span><i class="fas fa-user-tie"></i> ${supName}</span>
                  <span><i class="fas fa-calendar-alt"></i> ${admFmt}</span>
                </div>
              </div>
            </label>`;
          }).join('')}
        </div>
        <div id="import-count-label" style="text-align:right;font-size:12px;color:#6B7280;margin-top:8px">
          ${candidates.length} selecionados de ${candidates.length}
        </div>`}
      </div>
      <div class="modal-footer">
        <button class="btn-outline" onclick="document.getElementById('import-modal-overlay').remove()">Cancelar</button>
        ${candidates.length > 0 ? `<button class="btn-primary" onclick="saveImportFromRH()">
          <i class="fas fa-file-import"></i> Importar Selecionados
        </button>` : ''}
      </div>
    </div>`;
  document.body.appendChild(modal);

  // Atualiza contador ao marcar/desmarcar
  modal.querySelectorAll('.import-checkbox').forEach(cb => {
    cb.addEventListener('change', _importUpdateCount);
  });
}

window._importFilterList = function() {
  const q = (document.getElementById('import-search')?.value || '').toLowerCase();
  document.querySelectorAll('.import-item').forEach(el => {
    const text = el.textContent.toLowerCase();
    const mat  = el.dataset.mat || '';
    el.style.display = (!q || text.includes(q) || mat.includes(q)) ? '' : 'none';
  });
};

window._importSelectAll = function(checked) {
  document.querySelectorAll('.import-checkbox').forEach(cb => { cb.checked = checked; });
  _importUpdateCount();
};

function _importUpdateCount() {
  const total    = document.querySelectorAll('.import-checkbox').length;
  const selected = document.querySelectorAll('.import-checkbox:checked').length;
  const el = document.getElementById('import-count-label');
  if (el) el.textContent = `${selected} selecionados de ${total}`;
}

window.saveImportFromRH = function() {
  const rhEmps  = window.getHREmployees ? window.getHREmployees() : (window.HR_EMPLOYEES_SEED || []);
  const careers = getCareers();
  const checked = [...document.querySelectorAll('.import-checkbox:checked')].map(cb => cb.value);

  if (!checked.length) { alert('Selecione pelo menos um colaborador!'); return; }

  const employees = getEmployees();
  let imported = 0;

  checked.forEach(mat => {
    const rh = rhEmps.find(e => e.matricula === mat);
    if (!rh) return;
    // Evita duplicata
    if (employees.some(e => e.rhMatricula === mat)) return;

    const career     = _matchCareerFromRhCargo(rh.cargo, careers);
    const supervisor = _rhLiderToSupervisor(rh.lider);

    employees.push({
      id:          uuid(),
      rhMatricula: rh.matricula,
      name:        rh.nome,
      admission:   rh.admissao || '',
      sector:      rh.setor   || 'Produção',
      currentRole: career ? career.name : (rh.cargo || 'Ajudante de Produção'),
      desiredRole: null,
      minMonths:   career ? career.minMonths : null,
      supervisor,
      rhLider:     rh.lider || '',
      status:      'registered',
      promoObs:    '',
      skills:      {}
    });
    imported++;
  });

  saveEmployees(employees);
  document.getElementById('import-modal-overlay')?.remove();
  renderEmployeesTable();

  // Toast de confirmação
  const t = document.createElement('div');
  t.className = 'teams-toast';
  t.textContent = `✅ ${imported} colaborador(es) importado(s) do banco de dados RH!`;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 4000);
};

// Mapeia cargo do RH para cargo da trilha de carreira
function _matchCareerFromRhCargo(cargo, careers) {
  if (!cargo || !careers) return null;
  const cg = cargo.toLowerCase().trim();
  // Busca exata primeiro
  let match = careers.find(c => c.name.toLowerCase() === cg);
  if (match) return match;
  // Busca parcial: nome do cargo na trilha está contido no cargo RH
  match = careers.find(c => cg.includes(c.name.toLowerCase()));
  if (match) return match;
  // Busca parcial inversa
  match = careers.find(c => c.name.toLowerCase().split(' ').slice(0,2).join(' ') && cg.includes(c.name.toLowerCase().split(' ').slice(0,2).join(' ')));
  if (match) return match;
  // Específicos: calandra sem número → Operador de Calandra 1
  if (cg.includes('calandra') && !cg.includes('2') && !cg.includes('3')) return careers.find(c=>c.name==='Operador de Calandra 1') || null;
  if (cg.includes('revisor') && !cg.includes('2') && !cg.includes('3')) return careers.find(c=>c.name==='Revisor 1') || null;
  if (cg.includes('impressor') && !cg.includes('2') && !cg.includes('3')) return careers.find(c=>c.name==='Impressor Digital 1') || null;
  if (cg.includes('ajudante')) return careers.find(c=>c.name==='Ajudante de Produção') || null;
  return null;
}

function deleteEmployee(id) {
  if (!confirm('Excluir este funcionário da trilha de carreira?\n\nOs dados RH não serão afetados.')) return;
  const employees = getEmployees().filter(e=>e.id!==id);
  saveEmployees(employees);
  renderEmployeesTable();
}

// ─── CAREERS (Admin) ──────────────────────────
function _careerTrailCardMarkup(c) {
  const compLen = (c.competencies || []).length;
  const lid = `career-trigger-${c.id}`;
  const pid = `career-panel-${c.id}`;
  return `<div class="trail-card-slot">
  <div class="trail-card-accordion">
    <button type="button" class="trail-card trail-card-trigger" id="${lid}" data-career-id="${c.id}"
      onclick="toggleCareerTrailCard(this)" aria-expanded="false" aria-controls="${pid}">
      <span class="trail-card-head">
        <span class="trail-card-name">${c.name}</span>
        <span class="trail-card-months">${c.minMonths} meses mín.</span>
      </span>
      <span class="trail-card-chevron" aria-hidden="true"><i class="fas fa-chevron-down"></i></span>
    </button>
    <div class="trail-card-panel" id="${pid}" role="region" aria-labelledby="${lid}" aria-hidden="true">
      <div class="trail-card-panel-inner">
        <dl class="trail-card-dl">
          <div><dt>Nível</dt><dd>${c.level || 0}</dd></div>
          <div><dt>Tempo mínimo</dt><dd>${c.minMonths} meses</dd></div>
          <div><dt>Competências</dt><dd><span class="competencies-count">${compLen} competências</span></dd></div>
        </dl>
        <div class="trail-card-panel-actions action-btns">
          <button type="button" class="btn-icon" onclick="viewCareer('${c.id}')" title="Ver competências"><i class="fas fa-eye"></i></button>
          <button type="button" class="btn-icon" onclick="openEditCareer('${c.id}')" title="Editar cargo"><i class="fas fa-edit"></i></button>
        </div>
      </div>
    </div>
  </div>
</div>`;
}

function toggleCareerTrailCard(btn) {
  const acc = btn && btn.closest('.trail-card-accordion');
  if (!acc) return;
  acc.classList.toggle('is-open');
  const nowOpen = acc.classList.contains('is-open');
  btn.setAttribute('aria-expanded', nowOpen ? 'true' : 'false');
  const panel = acc.querySelector('.trail-card-panel');
  if (panel) panel.setAttribute('aria-hidden', nowOpen ? 'false' : 'true');
}

function renderCareers() {
  if (window.guardPage && !window.guardPage('careers')) return;
  const careers = getCareers();

  const flowEl = document.getElementById('career-trail-flow');
  if (flowEl) {
    const levels = {};
    careers.forEach(c => { const l=c.level||0; (levels[l]=levels[l]||[]).push(c); });
    flowEl.innerHTML = Object.keys(levels).sort().map(l => `
      <div class="trail-level" data-career-level="${l}">
        <div class="trail-level-label">Nível ${l}</div>
        <div class="trail-cards">
          ${levels[l].map(c => _careerTrailCardMarkup(c)).join('<div class="trail-arrow"><i class="fas fa-arrow-right"></i></div>')}
        </div>
      </div>`).join('<div class="trail-connector"><i class="fas fa-chevron-down"></i></div>');
  }

  const tbody = document.getElementById('careers-tbody');
  if (!tbody) return;
  tbody.innerHTML = careers.map(c => `
    <tr>
      <td><strong>${c.name}</strong> <span class="level-badge">Nível ${c.level||0}</span></td>
      <td>${c.minMonths} meses</td>
      <td><span class="competencies-count">${(c.competencies||[]).length} competências</span></td>
      <td>
        <div class="action-btns">
          <button class="btn-icon" onclick="viewCareer('${c.id}')" title="Ver competências"><i class="fas fa-eye"></i></button>
          <button class="btn-icon" onclick="openEditCareer('${c.id}')" title="Editar"><i class="fas fa-edit"></i></button>
        </div>
      </td>
    </tr>`).join('');
}

function viewCareer(id) {
  const career = getCareers().find(c=>c.id===id);
  if (!career) return;
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3>📋 ${career.name}</h3>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body">
        <p><strong>Tempo Mínimo:</strong> ${career.minMonths} meses</p>
        <p><strong>Nível:</strong> ${career.level||0}</p>
        <h4 style="margin-top:16px">Competências Exigidas:</h4>
        <ul class="competencies-list">
          ${(career.competencies||[]).map(c=>`<li>${c}</li>`).join('')}
        </ul>
      </div>
      <div class="modal-footer">
        <button class="btn-primary" onclick="this.closest('.modal-overlay').remove()">Fechar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

function openAddCareer() { openCareerModal(); }
function openEditCareer(id) {
  const career = getCareers().find(c=>c.id===id);
  if (career) openCareerModal(career);
}

function openCareerModal(career=null) {
  const isEdit = !!career;
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3>${isEdit?'✏️ Editar Cargo':'➕ Novo Cargo'}</h3>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body">
        <div class="form-row">
          <div class="form-group">
            <label>Nome do Cargo *</label>
            <input type="text" id="career-name" value="${career?.name||''}" placeholder="Ex: Operador de Calandra 2" />
          </div>
          <div class="form-group">
            <label>Nível</label>
            <input type="number" id="career-level" value="${career?.level||0}" min="0" max="10" />
          </div>
        </div>
        <div class="form-group">
          <label>Tempo Mínimo (meses) *</label>
          <input type="number" id="career-months" value="${career?.minMonths||3}" min="1" />
        </div>
        <div class="form-group">
          <label>Competências (uma por linha)</label>
          <textarea id="career-competencies" rows="6" placeholder="Digite cada competência em uma linha...">${(career?.competencies||[]).join('\n')}</textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-outline" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
        <button class="btn-primary" onclick="saveCareer_modal('${isEdit?career.id:''}')">
          <i class="fas fa-save"></i> ${isEdit?'Salvar':'Adicionar Cargo'}
        </button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

function saveCareer_modal(editId) {
  const name         = document.getElementById('career-name')?.value.trim();
  const level        = parseInt(document.getElementById('career-level')?.value)||0;
  const minMonths    = parseInt(document.getElementById('career-months')?.value)||3;
  const competencies = document.getElementById('career-competencies')?.value.split('\n').map(s=>s.trim()).filter(Boolean);

  if (!name) { alert('Nome do cargo é obrigatório!'); return; }

  const careers = getCareers();
  if (editId) {
    const idx = careers.findIndex(c=>c.id===editId);
    if (idx >= 0) careers[idx] = { ...careers[idx], name, level, minMonths, competencies };
  } else {
    careers.push({ id:uuid(), name, level, minMonths, competencies });
  }

  saveCareers(careers);
  document.querySelector('.modal-overlay')?.remove();
  renderCareers();
}

// ─── SUPERVISORS OVERVIEW (Admin + Gerente) ──────────────────────
const SUP_COLORS = {
  'sup1@lumini':    { bg:'#003366', light:'#E0E9F5', text:'#fff' },
  'sup2@lumini':    { bg:'#1B4F8A', light:'#D5E4F5', text:'#fff' },
  'sup3@lumini':    { bg:'#0F766E', light:'#CCFBF1', text:'#fff' },
  'sup4@lumini':    { bg:'#92400E', light:'#FEF3C7', text:'#fff' },
  'gerente@lumini': { bg:'#7B2D8B', light:'#F0E4F6', text:'#fff' },
  'diretor@lumini': { bg:'#B45309', light:'#FEF3C7', text:'#fff' },
};

let _supOvData = [];

function renderSupervisorsOverview() {
  const employees   = getEmployees();
  const evaluations = getEvaluations();
  const supervisors = DEMO_USERS.filter(u => u.role==='supervisor'||u.role==='manager');

  const kpisEl = document.getElementById('sup-overview-kpis');
  if (kpisEl) {
    const totalEmps   = employees.length;
    const totalReady  = employees.filter(e=>e.status==='ready').length;
    const totalPromo  = employees.filter(e=>['promoted','approved','pending_samuel','pending_samuel_return','pending_carlos'].includes(e.status)).length;
    const totalEvals  = evaluations.length;
    kpisEl.innerHTML = `
      <div class="stat-card blue"><div class="stat-icon"><i class="fas fa-users"></i></div><div class="stat-info"><span class="stat-value">${totalEmps}</span><span class="stat-label">Total Funcionários</span></div></div>
      <div class="stat-card orange"><div class="stat-icon"><i class="fas fa-clock"></i></div><div class="stat-info"><span class="stat-value">${totalReady}</span><span class="stat-label">Aguardam Avaliação</span></div></div>
      <div class="stat-card green"><div class="stat-icon"><i class="fas fa-trophy"></i></div><div class="stat-info"><span class="stat-value">${totalPromo}</span><span class="stat-label">Em Promoção</span></div></div>
      <div class="stat-card yellow"><div class="stat-icon"><i class="fas fa-clipboard-list"></i></div><div class="stat-info"><span class="stat-value">${totalEvals}</span><span class="stat-label">Avaliações Feitas</span></div></div>`;
  }

  _supOvData = supervisors.map(sup => {
    const team     = employees.filter(e=>e.supervisor===sup.email);
    const ready    = team.filter(e=>e.status==='ready').length;
    const promoted = team.filter(e=>['promoted','approved','pending_samuel','pending_samuel_return','pending_carlos'].includes(e.status)).length;
    const evalsDone= evaluations.filter(ev=>team.some(e=>e.id===ev.employeeId)).length;
    // Eficiência = % de funcionários SEM pendências (não em status 'ready').
    // Só exibe valor real se a equipe tem pelo menos 1 funcionário cadastrado.
    // Equipe vazia → mostra '—' (sem dados suficientes p/ calcular)
    const efficiency = team.length > 0 ? Math.round(((team.length - ready) / team.length) * 100) : null;
    const colors   = SUP_COLORS[sup.email] || { bg:'#6B7280', light:'#F3F4F6', text:'#fff' };
    return { sup, team, ready, promoted, evalsDone, efficiency, colors };
  });

  filterSupOverview();
}

function filterSupOverview() {
  const query  = (document.getElementById('sup-ov-search')?.value||'').toLowerCase();
  const sort   = document.getElementById('sup-ov-sort')?.value||'name';
  const listEl = document.getElementById('supervisors-overview-list');
  if (!listEl) return;

  let data = _supOvData.filter(d => {
    if (!query) return true;
    return d.sup.name.toLowerCase().includes(query) || d.team.some(e=>e.name.toLowerCase().includes(query));
  });

  data.sort((a,b) => {
    if (sort==='name')       return a.sup.name.localeCompare(b.sup.name);
    if (sort==='team')       return b.team.length-a.team.length;
    if (sort==='pending')    return b.ready-a.ready;
    if (sort==='efficiency') return b.efficiency-a.efficiency;
    return 0;
  });

  if (!data.length) {
    listEl.innerHTML = `<div class="empty-state"><i class="fas fa-search"></i><p>Nenhum resultado encontrado</p></div>`;
    return;
  }

  listEl.innerHTML = data.map(({sup,team,ready,promoted,evalsDone,efficiency,colors}) => {
    const roleLabel = sup.role==='manager'?'Gerente':sup.role==='boss'?'Diretor':'Supervisor';
    return `
    <div class="sup-ov-card">
      <div class="sup-ov-header" style="background:${colors.bg}">
        <div class="sup-ov-avatar" style="background:rgba(255,255,255,0.2)">${getInitials(sup.name)}</div>
        <div class="sup-ov-info">
          <div class="sup-ov-name">${sup.name}</div>
          <div class="sup-ov-role">${roleLabel}</div>
        </div>
        <div class="sup-ov-efficiency">
          <div class="sup-ov-eff-value">${efficiency !== null ? efficiency + '%' : '—'}</div>
          <div class="sup-ov-eff-label">${efficiency !== null ? 'Eficiência' : 'Sem dados'}</div>
        </div>
      </div>
      <div class="sup-ov-stats">
        <div class="sup-ov-stat"><span class="sup-stat-val">${team.length}</span><span class="sup-stat-lbl">Equipe</span></div>
        <div class="sup-ov-stat"><span class="sup-stat-val" style="color:#D97706">${ready}</span><span class="sup-stat-lbl">Aguardam Aval.</span></div>
        <div class="sup-ov-stat"><span class="sup-stat-val" style="color:#16A34A">${promoted}</span><span class="sup-stat-lbl">Em Promoção</span></div>
        <div class="sup-ov-stat"><span class="sup-stat-val" style="color:#7C3AED">${evalsDone}</span><span class="sup-stat-lbl">Avaliações</span></div>
      </div>
      <div class="sup-ov-team-list">
        ${team.length===0?`<div class="sup-ov-empty">Nenhum funcionário nesta equipe</div>`:
          team.slice(0,5).map(e=>{
            const si=getStatusInfo(e);
            return `<div class="sup-ov-emp"><div class="sup-ov-emp-avatar" style="background:${colors.bg}20;color:${colors.bg}">${getInitials(e.name)}</div><div class="sup-ov-emp-info"><div class="sup-ov-emp-name">${e.name}</div><div class="sup-ov-emp-role">${e.currentRole}</div></div><span class="status-badge ${si.cls}" style="font-size:10px">${si.label}</span></div>`;
          }).join('')+
          (team.length>5?`<button class="sup-ov-more" onclick="_supOvToggleAll(this)" data-sup="${sup.email}">+${team.length-5} mais funcionários</button>`:'')
        }
      </div>
    </div>`;
  }).join('');
}

// Expande/recolhe a lista completa de funcionários no card do supervisor
function _supOvToggleAll(btn) {
  const supEmail = btn.dataset.sup;
  const d = _supOvData.find(x => x.sup.email === supEmail);
  if (!d) return;

  const listEl = btn.closest('.sup-ov-team-list');
  if (!listEl) return;

  const isExpanded = btn.dataset.expanded === 'true';

  if (isExpanded) {
    // Recolhe: mostra só os 5 primeiros
    const colors = d.colors;
    listEl.innerHTML =
      d.team.slice(0, 5).map(e => {
        const si = getStatusInfo(e);
        return `<div class="sup-ov-emp">
          <div class="sup-ov-emp-avatar" style="background:${colors.bg}20;color:${colors.bg}">${getInitials(e.name)}</div>
          <div class="sup-ov-emp-info">
            <div class="sup-ov-emp-name">${e.name}</div>
            <div class="sup-ov-emp-role">${e.currentRole}</div>
          </div>
          <span class="status-badge ${si.cls}" style="font-size:10px">${si.label}</span>
        </div>`;
      }).join('') +
      `<button class="sup-ov-more" onclick="_supOvToggleAll(this)" data-sup="${supEmail}" data-expanded="false">
        +${d.team.length - 5} mais funcionários
      </button>`;
  } else {
    // Expande: mostra todos
    const colors = d.colors;
    listEl.innerHTML =
      d.team.map(e => {
        const si = getStatusInfo(e);
        return `<div class="sup-ov-emp">
          <div class="sup-ov-emp-avatar" style="background:${colors.bg}20;color:${colors.bg}">${getInitials(e.name)}</div>
          <div class="sup-ov-emp-info">
            <div class="sup-ov-emp-name">${e.name}</div>
            <div class="sup-ov-emp-role">${e.currentRole}</div>
          </div>
          <span class="status-badge ${si.cls}" style="font-size:10px">${si.label}</span>
        </div>`;
      }).join('') +
      `<button class="sup-ov-more" onclick="_supOvToggleAll(this)" data-sup="${supEmail}" data-expanded="true" style="background:#DBEAFE;color:#1B4F8A">
        <i class="fas fa-chevron-up"></i> Recolher lista
      </button>`;
  }
}

// ─── EVALUATIONS LIST (Admin) ─────────────────
function renderEvaluationsList() {
  const evaluations = getEvaluations();
  const employees   = getEmployees();
  const listEl      = document.getElementById('evaluations-list');
  if (!listEl) return;

  if (!evaluations.length) {
    listEl.innerHTML = `<div class="empty-state"><i class="fas fa-clipboard-list"></i><p>Nenhuma avaliação registrada ainda</p></div>`;
    return;
  }

  const sorted = [...evaluations].sort((a,b)=>new Date(b.date)-new Date(a.date));
  listEl.innerHTML = sorted.map(ev => {
    const emp     = employees.find(e=>e.id===ev.employeeId);
    const name    = emp?emp.name:'Funcionário';
    const supUser = DEMO_USERS.find(u=>u.email===ev.supervisor);
    const pct     = ev.score||0;
    return `
    <div class="eval-card">
      <div class="eval-card-header">
        <div class="eval-avatar">${getInitials(name)}</div>
        <div class="eval-info">
          <div class="eval-name">${name}</div>
          <div class="eval-meta">${ev.fromRole||'—'} → ${ev.toRole||'—'} · ${supUser?supUser.name:ev.supervisor||'—'} · ${formatDate(ev.date)}</div>
        </div>
        <div class="eval-score-badge ${pct>=75?'green':pct>=50?'yellow':'red'}">${pct}%</div>
      </div>
      <div class="eval-sections">
        ${Object.entries(ev.sections||{}).map(([sec,data])=>`
        <div class="eval-section-mini">
          <span class="eval-sec-label">${sec==='tecnica'?'Técnica':sec==='comportamento'?'Comportamento':sec==='seguranca'?'Segurança':'Potencial'}</span>
          <div class="eval-sec-bar"><div class="eval-sec-fill" style="width:${data.pct||0}%;background:${data.pct>=75?'#16A34A':data.pct>=50?'#D97706':'#DC2626'}"></div></div>
          <span class="eval-sec-pct">${data.pct||0}%</span>
        </div>`).join('')}
      </div>
      ${ev.justification?`<div class="eval-justification"><i class="fas fa-quote-left"></i> ${ev.justification}</div>`:''}
    </div>`;
  }).join('');
}

function printEvaluations() { window.print(); }

// ─── MATRIX DE POLIVALÊNCIA ───────────────────
function renderMatrix() {
  const employees = getEmployees();
  const skills    = DEMO_MATRIX_SKILLS || [];
  const filterVal = document.getElementById('matrix-sector-filter')?.value||'';

  const sectors   = [...new Set(employees.map(e=>e.sector||'Produção'))];
  const filterEl  = document.getElementById('matrix-sector-filter');
  if (filterEl && filterEl.options.length === 1) {
    sectors.forEach(s => { const opt=document.createElement('option'); opt.value=s; opt.textContent=s; filterEl.appendChild(opt); });
  }

  const filtered = filterVal ? employees.filter(e=>(e.sector||'Produção')===filterVal) : employees;
  const container = document.getElementById('matrix-container');
  if (!container) return;

  if (!filtered.length) {
    container.innerHTML = `<div class="empty-state"><i class="fas fa-th"></i><p>Nenhum funcionário cadastrado</p></div>`;
    return;
  }

  const SKILL_LEVELS = { 0:'', 1:'red', 2:'yellow', 3:'green', 4:'star' };
  const SKILL_ICONS  = { 0:'—', 1:'✕', 2:'◐', 3:'✓', 4:'★' };
  const SKILL_LABELS = { 0:'Não avaliado', 1:'Não Treinado', 2:'Em Treinamento', 3:'Competente', 4:'Referência' };

  container.innerHTML = `
    <div class="matrix-table-wrap">
      <table class="matrix-table">
        <thead>
          <tr>
            <th class="matrix-name-th">Funcionário</th>
            ${skills.map(s=>`<th class="matrix-skill-th">${s}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${filtered.map(emp => `
          <tr>
            <td class="matrix-emp-cell">
              <div class="matrix-emp-name">${emp.name}</div>
              <div class="matrix-emp-role">${emp.currentRole||''}</div>
            </td>
            ${skills.map(skill => {
              const lvl = (emp.skills||{})[skill]||0;
              return `<td class="matrix-skill-cell" onclick="cycleSkill('${emp.id}','${skill}',${lvl})">
                <span class="matrix-dot ${SKILL_LEVELS[lvl]}" title="${SKILL_LABELS[lvl]}">${SKILL_ICONS[lvl]}</span>
              </td>`;
            }).join('')}
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function cycleSkill(empId, skill, currentLevel) {
  const employees = getEmployees();
  const emp = employees.find(e=>e.id===empId);
  if (!emp) return;
  if (!emp.skills) emp.skills = {};
  emp.skills[skill] = (currentLevel+1)%5;
  saveEmployees(employees);
  renderMatrix();
}

// ─── REPORTS ─────────────────────────────────
function renderReports() {
  const employees   = getEmployees();
  const evaluations = getEvaluations();

  if (chartPie) { chartPie.destroy(); chartPie = null; }
  const pieCounts = {
    'Cadastrado': employees.filter(e=>e.status==='registered').length,
    'Em Período': employees.filter(e=>calcTenure(e.admission)<(e.minMonths||999)&&!['ready','promoted','approved','pending_samuel','pending_samuel_return','pending_carlos'].includes(e.status)).length,
    'Apto p/ Aval.': employees.filter(e=>e.status==='ready').length,
    'Em Promoção': employees.filter(e=>['pending_samuel','pending_samuel_return','pending_carlos'].includes(e.status)).length,
    'Aprovado': employees.filter(e=>e.status==='approved').length,
    'Promovido': employees.filter(e=>e.status==='promoted').length,
  };
  const pieCtx = document.getElementById('chart-pie-status');
  if (pieCtx) {
    chartPie = new Chart(pieCtx, {
      type: 'pie',
      data: { labels:Object.keys(pieCounts), datasets:[{ data:Object.values(pieCounts), backgroundColor:['#E0E7FF','#FEE2E2','#FEF3C7','#DDD6FE','#DCFCE7','#EDE9FE'], borderWidth:2 }] },
      options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'right' } } }
    });
  }

  if (chartEval) { chartEval.destroy(); chartEval = null; }
  const evalApproved = evaluations.filter(e=>e.result==='approved').length;
  const evalReproved = evaluations.filter(e=>e.result==='reproved').length;
  const evalPending  = evaluations.filter(e=>e.result==='pending').length;
  const evalCtx = document.getElementById('chart-eval-result');
  if (evalCtx) {
    chartEval = new Chart(evalCtx, {
      type: 'bar',
      data: { labels:['Aprovados','Reprovados','Pendentes'], datasets:[{ data:[evalApproved,evalReproved,evalPending], backgroundColor:['#DCFCE7','#FEE2E2','#FEF3C7'], borderColor:['#16A34A','#DC2626','#D97706'], borderWidth:2, borderRadius:8 }] },
      options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ y:{beginAtZero:true,ticks:{stepSize:1}}, x:{grid:{display:false}} } }
    });
  }

  const tbody = document.getElementById('report-tbody');
  if (!tbody) return;
  tbody.innerHTML = employees.map(e => {
    const months = calcTenure(e.admission);
    const evals  = getEvaluations().filter(ev=>ev.employeeId===e.id);
    const last   = evals.sort((a,b)=>new Date(b.date)-new Date(a.date))[0];
    const si     = getStatusInfo(e);
    return `<tr>
      <td>${e.name}</td>
      <td>${e.currentRole||'—'}</td>
      <td>${e.desiredRole||'—'}</td>
      <td>${tenureText(months)}</td>
      <td>${last?formatDate(last.date):'—'}</td>
      <td>${last?`<span class="${last.score>=75?'text-green':last.score>=50?'text-yellow':'text-red'}">${last.score}%</span>`:'—'}</td>
      <td><span class="status-badge ${si.cls}">${si.label}</span></td>
    </tr>`;
  }).join('');
}

// ─── SUPERVISOR HOME ──────────────────────────
function renderSupervisorHome() {
  const employees = getEmployees();
  const myTeam    = currentUser.role==='supervisor' ? employees.filter(e=>e.supervisor===currentUser.email) : employees;
  const eligible  = myTeam.filter(e => e.minMonths && calcTenure(e.admission)>=e.minMonths && e.status==='ready');
  const pending   = myTeam.filter(e => ['pending_samuel','pending_samuel_return','pending_carlos'].includes(e.status));

  document.getElementById('supervisor-greeting').textContent = `Olá, ${currentUser.name}! 👋`;

  const alertEl = document.getElementById('supervisor-alert');
  const alertTxt= document.getElementById('supervisor-alert-text');
  if (eligible.length > 0) {
    alertEl.classList.remove('hidden');
    alertTxt.textContent = `Você tem ${eligible.length} funcionário${eligible.length>1?'s':''} aguardando avaliação!`;
  } else {
    alertEl.classList.add('hidden');
  }

  document.getElementById('sup-stat-total').textContent   = myTeam.length;
  document.getElementById('sup-stat-pending').textContent = eligible.length;

  const eligibleEl = document.getElementById('sup-eligible-list');
  if (eligibleEl) {
    if (!eligible.length) {
      eligibleEl.innerHTML = `<div class="empty-state"><i class="fas fa-check-circle"></i><p>Nenhum funcionário aguardando avaliação</p></div>`;
    } else {
      eligibleEl.innerHTML = eligible.map(e => buildEmployeeCard(e, true)).join('');
    }
  }

  const allEl = document.getElementById('sup-all-list');
  if (allEl) {
    const non_eligible = myTeam.filter(e => !eligible.includes(e));
    if (!non_eligible.length && !eligible.length) {
      allEl.innerHTML = `<div class="empty-state"><i class="fas fa-users"></i><p>Nenhum funcionário na equipe ainda</p></div>`;
    } else {
      allEl.innerHTML = non_eligible.map(e => buildEmployeeCard(e, false)).join('');
    }
  }

  // Banner de promoções em andamento
  const bannerContainer = document.getElementById('promo-shortcut-banner-container');
  if (bannerContainer && pending.length > 0) {
    bannerContainer.style.display = '';
    const countEl = document.getElementById('promo-pipeline-count');
    if (countEl) countEl.textContent = pending.length;
  } else if (bannerContainer) {
    bannerContainer.style.display = 'none';
  }
}

function buildEmployeeCard(e, isEligible) {
  const months = calcTenure(e.admission);
  const si     = getStatusInfo(e);
  const pct    = si.pct;
  const pColor = getProgressColor(pct);

  let actionBtn = '';
  // Nunca mostra "Avaliar" se já está em fluxo de promoção
  const blockedStatuses = _PROMO_BLOCKED_STATUSES;
  if (e.status === 'ready' && isEligible && !blockedStatuses.includes(e.status)) {
    actionBtn = `<button class="btn-primary btn-sm" onclick="startEvaluation('${e.id}')"><i class="fas fa-star"></i> Avaliar Agora</button>`;
  } else if (e.status === 'pending_samuel') {
    actionBtn = `<button class="btn-outline btn-sm" disabled><i class="fas fa-hourglass-half"></i> Aguardando Samuel...</button>`;
  } else if (e.status === 'pending_carlos') {
    actionBtn = `<button class="btn-outline btn-sm" disabled><i class="fas fa-crown"></i> Aguardando Carlos...</button>`;
  } else if (e.status === 'pending_samuel_return') {
    actionBtn = `<button class="btn-outline btn-sm" disabled><i class="fas fa-arrow-left"></i> Retorno do Diretor</button>`;
  } else if (e.status === 'promoted') {
    actionBtn = `<div class="promo-badge-celebrate">🎉 Promovido!</div>`;
  } else if (hasPendingExcecao(e.id)) {
    actionBtn = supervisorExcecaoPendingButton();
  } else if (canShowSupervisorExcecaoButton(e)) {
    actionBtn = `<button class="btn-outline btn-sm" onclick="openExceptionRequest('${e.id}')"><i class="fas fa-file-signature"></i> Exceção</button>`;
  } else if (canShowSupervisorPromoButton(e)) {
    actionBtn = `<button class="btn-outline btn-sm" onclick="openPromoRequest('${e.id}')"><i class="fas fa-rocket"></i> Solicitar Promoção</button>`;
  }

  return `
  <div class="emp-card ${e.status==='promoted'?'emp-card-promoted':''}">
    <div class="emp-card-avatar">${getInitials(e.name)}</div>
    <div class="emp-card-info">
      <div class="emp-card-name">${e.name}</div>
      <div class="emp-card-role">${e.currentRole}${e.desiredRole?` → ${e.desiredRole}`:''}</div>
      <div class="emp-card-tenure">${tenureText(months)} · Admitido em ${formatDate(e.admission)}</div>
      <div class="emp-card-status"><span class="status-badge ${si.cls}">${si.label}</span></div>
      <div class="progress-wrap mt-8">
        <div class="progress-bar-bg"><div class="progress-bar-fill ${pColor}" style="width:${pct}%"></div></div>
        <span class="progress-pct">${pct}%</span>
      </div>
    </div>
    <div class="emp-card-actions">${actionBtn}</div>
  </div>`;
}

// ─── SUPERVISOR TEAM ──────────────────────────
function renderSupervisorTeam() {
  const employees = getEmployees();
  const myTeam    = currentUser.role==='supervisor' ? employees.filter(e=>e.supervisor===currentUser.email) : employees;
  const query     = (document.getElementById('search-sup-employees')?.value||'').toLowerCase();
  const filtered  = myTeam.filter(e => e.name.toLowerCase().includes(query)||(e.currentRole||'').toLowerCase().includes(query));

  const tbody = document.getElementById('sup-employees-tbody');
  if (!tbody) return;

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-cell"><i class="fas fa-user-slash"></i> Nenhum funcionário encontrado</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(e => {
    const months  = calcTenure(e.admission);
    const si      = getStatusInfo(e);
    const pColor  = getProgressColor(si.pct);
    return `<tr>
      <td>
        <div class="emp-name-cell">
          <div class="emp-avatar-sm">${getInitials(e.name)}</div>
          <div><div class="emp-name">${e.name}</div><div class="emp-meta">${e.sector||'Produção'}</div></div>
        </div>
      </td>
      <td><div class="role-cell"><span class="role-current">${e.currentRole||'—'}</span>${e.desiredRole?`<span class="role-arrow">→</span><span class="role-desired">${e.desiredRole}</span>`:''}</div></td>
      <td>${tenureText(months)}</td>
      <td><div class="progress-wrap"><div class="progress-bar-bg"><div class="progress-bar-fill ${pColor}" style="width:${si.pct}%"></div></div><span class="progress-pct">${si.pct}%</span></div></td>
      <td><span class="status-badge ${si.cls}">${si.label}</span></td>
      <td>
        <div class="action-btns">
          ${e.status==='ready'&&!_PROMO_BLOCKED_STATUSES.includes(e.status)?`<button class="btn-primary btn-sm" onclick="startEvaluation('${e.id}')"><i class="fas fa-star"></i> Avaliar</button>`:''}
          ${hasPendingExcecao(e.id)?supervisorExcecaoPendingButton():''}
          ${!hasPendingExcecao(e.id)&&canShowSupervisorExcecaoButton(e)?`<button class="btn-outline btn-sm" onclick="openExceptionRequest('${e.id}')"><i class="fas fa-file-signature"></i> Exceção</button>`:''}
          ${canShowSupervisorPromoButton(e)?`<button class="btn-outline btn-sm" onclick="openPromoRequest('${e.id}')"><i class="fas fa-rocket"></i> Promoção</button>`:''}
        </div>
      </td>
    </tr>`;
  }).join('');
}

// ─── PROMO REQUEST ────────────────────────────
function validatePromoRoleEligibility() {
  const overlay = document.querySelector('.modal-overlay[data-promo-emp-id]');
  const empId = overlay?.dataset?.promoEmpId;
  const sel = document.getElementById('promo-desired-role');
  const submitBtn = document.getElementById('promo-submit-btn');
  const hint = document.getElementById('promo-tenure-hint');
  if (!empId || !sel || !submitBtn) return;
  const emp = getEmployees().find(e => e.id === empId);
  if (!emp) return;
  const months = calcTenure(emp.admission);
  const opt = sel.options[sel.selectedIndex];
  const minM = parseInt(opt?.dataset?.months, 10) || 0;
  if (!sel.value) {
    submitBtn.disabled = true;
    if (hint) { hint.style.display = 'none'; hint.innerHTML = ''; }
    return;
  }
  if (months < minM) {
    submitBtn.disabled = true;
    if (hint) {
      hint.style.display = 'block';
      hint.innerHTML = `Este colaborador tem ${tenureText(months)} de casa; o cargo selecionado exige ${minM} meses. Para avaliação antes do tempo mínimo, use <strong>Solicitação de Exceção</strong> (menu Minha Equipe ou página de exceções).`;
    }
  } else {
    submitBtn.disabled = false;
    if (hint) { hint.style.display = 'none'; hint.innerHTML = ''; }
  }
}

function updateMinMonthsAndValidatePromo() {
  const sel = document.getElementById('promo-desired-role');
  const inp = document.getElementById('promo-min-months');
  if (!sel || !inp) return;
  const opt = sel.options[sel.selectedIndex];
  inp.value = opt?.dataset?.months || '';
  validatePromoRoleEligibility();
}

function openPromoRequest(empId) {
  const emp     = getEmployees().find(e=>e.id===empId);
  const careers = getCareers();
  if (!emp) return;

  if (!emp.desiredRole && !isEligibleForNormalPromotionTenure(emp)) {
    alert('Este colaborador ainda não atingiu o tempo mínimo para promoção regular. Use a ação "Exceção" para solicitar avaliação antecipada ao gerente.');
    return;
  }

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.dataset.promoEmpId = emp.id;
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3>🚀 Solicitação de Promoção</h3>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body">
        <div class="promo-req-employee">
          <div class="emp-avatar-lg">${getInitials(emp.name)}</div>
          <div>
            <div class="promo-req-name">${emp.name}</div>
            <div class="promo-req-role">${emp.currentRole} · ${tenureText(calcTenure(emp.admission))}</div>
          </div>
        </div>
        <div class="form-group">
          <label>Cargo Desejado *</label>
          <select id="promo-desired-role" onchange="updateMinMonthsAndValidatePromo()">
            <option value="">-- Selecione o cargo destino --</option>
            ${careers.filter(c=>c.name!==emp.currentRole).map(c=>`<option value="${c.name}" data-months="${c.minMonths}">${c.name} (mín. ${c.minMonths} meses)</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Tempo Mínimo Exigido</label>
          <input type="number" id="promo-min-months" placeholder="Será preenchido automaticamente" readonly />
        </div>
        <div id="promo-tenure-hint" class="info-box" style="display:none;margin-top:8px"></div>
        <div class="form-group">
          <label>Justificativa / Observações</label>
          <textarea id="promo-obs" rows="4" placeholder="Descreva os motivos da promoção...">${emp.promoObs||''}</textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-outline" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
        <button type="button" class="btn-primary" id="promo-submit-btn" disabled onclick="savePromoRequest('${emp.id}')"><i class="fas fa-rocket"></i> Enviar Solicitação</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  validatePromoRoleEligibility();
}

function savePromoRequest(empId) {
  const desiredRole = document.getElementById('promo-desired-role')?.value;
  const minMonths   = parseInt(document.getElementById('promo-min-months')?.value, 10) || null;
  const promoObs    = document.getElementById('promo-obs')?.value.trim();

  if (!desiredRole) { alert('Selecione o cargo desejado!'); return; }

  const employees = getEmployees();
  const idx = employees.findIndex(e=>e.id===empId);
  if (idx < 0) return;

  const months = calcTenure(employees[idx].admission);
  if (minMonths != null && months < minMonths) {
    alert('Não é possível enviar solicitação de promoção regular: o colaborador ainda não atingiu o tempo mínimo para o cargo selecionado. Use Solicitação de Exceção para avaliação antecipada.');
    return;
  }

  employees[idx].desiredRole = desiredRole;
  employees[idx].minMonths   = minMonths;
  employees[idx].promoObs    = promoObs;
  employees[idx].status      = months >= (minMonths||0) ? 'ready' : 'registered';

  saveEmployees(employees);
  document.querySelector('.modal-overlay')?.remove();
  renderSupervisorHome();
  updateNotifBadge();
  if (typeof renderSupervisorTeam === 'function') renderSupervisorTeam();
}

// ─── EVALUATION FORM ──────────────────────────
function startEvaluation(empId) {
  currentEvalEmployeeId = empId;
  const emp = getEmployees().find(e=>e.id===empId);
  if (!emp) return;

  const modal = document.createElement('div');
  modal.className = 'modal-overlay eval-modal-overlay';
  modal.id = 'eval-modal-overlay';

  const sections = EVAL_QUESTIONS;
  let html = `
    <div class="modal eval-modal">
      <div class="modal-header">
        <h3>⭐ Avaliação de Promoção</h3>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body">
        <div class="eval-employee-info">
          <div class="emp-avatar-lg">${getInitials(emp.name)}</div>
          <div>
            <div class="eval-emp-name">${emp.name}</div>
            <div class="eval-emp-detail">${emp.currentRole} → ${emp.desiredRole||'?'} · ${tenureText(calcTenure(emp.admission))}</div>
          </div>
        </div>

        <div class="eval-star-section">
          <label>Avaliação Geral (estrelas)</label>
          <div class="star-rating" id="star-rating">
            ${[1,2,3,4,5].map(i=>`<span class="star" onclick="setStarRating(${i})" title="${STAR_LABELS[i]}">☆</span>`).join('')}
          </div>
          <div class="star-label" id="star-label">Clique para avaliar</div>
        </div>`;

  Object.entries(sections).forEach(([secKey, questions]) => {
    const secLabel = secKey==='tecnica'?'🔧 Competência Técnica':secKey==='comportamento'?'🤝 Comportamento':secKey==='seguranca'?'🦺 Segurança & Qualidade':'🌟 Potencial';
    html += `<div class="eval-section"><h4>${secLabel}</h4>`;
    questions.forEach((q,i) => {
      html += `<div class="eval-question">
        <div class="eval-q-text">${q}</div>
        <div class="eval-q-options">
          <label><input type="radio" name="${secKey}_${i}" value="sim" /> ✅ Sim</label>
          <label><input type="radio" name="${secKey}_${i}" value="nao" /> ❌ Não</label>
          <label><input type="radio" name="${secKey}_${i}" value="parcial" /> 🔶 Parcial</label>
        </div>
      </div>`;
    });
    html += `</div>`;
  });

  html += `
        <div class="eval-section">
          <h4>📝 Observações do Supervisor</h4>
          <div class="form-group">
            <label>Justificativa da Promoção</label>
            <textarea id="eval-justification" rows="3" placeholder="Por que este funcionário merece a promoção?">${emp.promoObs||''}</textarea>
          </div>
          <div class="form-group">
            <label>Pontos Fortes</label>
            <textarea id="eval-strengths" rows="2" placeholder="Principais pontos fortes..."></textarea>
          </div>
          <div class="form-group">
            <label>Pontos a Desenvolver</label>
            <textarea id="eval-improvements" rows="2" placeholder="O que ainda precisa melhorar..."></textarea>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-outline" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
        <button class="btn-primary" onclick="submitEvaluation()"><i class="fas fa-check"></i> Enviar Avaliação</button>
      </div>
    </div>`;

  modal.innerHTML = html;
  document.body.appendChild(modal);
  starRating = 0;
}

function setStarRating(rating) {
  starRating = rating;
  const stars = document.querySelectorAll('#star-rating .star');
  stars.forEach((s,i) => { s.textContent = i<rating?'★':'☆'; s.classList.toggle('active',i<rating); });
  const label = document.getElementById('star-label');
  if (label) label.textContent = STAR_LABELS[rating]||'';
}

function submitEvaluation() {
  const emp = getEmployees().find(e=>e.id===currentEvalEmployeeId);
  if (!emp) return;

  const sections = EVAL_QUESTIONS;
  const results  = {};
  let totalQ=0, passedQ=0;

  Object.entries(sections).forEach(([secKey,questions]) => {
    let secTotal=0, secPassed=0;
    questions.forEach((_,i) => {
      const val = document.querySelector(`input[name="${secKey}_${i}"]:checked`)?.value;
      if (!val) return;
      secTotal++; totalQ++;
      if (val==='sim') { secPassed++; passedQ++; }
      else if (val==='parcial') { secPassed+=0.5; passedQ+=0.5; }
    });
    results[secKey] = { total:secTotal, passed:secPassed, pct:secTotal>0?Math.round((secPassed/secTotal)*100):0 };
  });

  if (totalQ === 0) { alert('Por favor, responda ao menos uma pergunta!'); return; }

  const score         = Math.round((passedQ/totalQ)*100);
  const justification = document.getElementById('eval-justification')?.value.trim();
  const strengths     = document.getElementById('eval-strengths')?.value.trim();
  const improvements  = document.getElementById('eval-improvements')?.value.trim();
  const approved      = score >= 75;

  const evaluation = {
    id: uuid(),
    employeeId: emp.id,
    supervisor: currentUser.email,
    date: new Date().toISOString().split('T')[0],
    fromRole: emp.currentRole,
    toRole: emp.desiredRole,
    score,
    stars: starRating,
    sections: results,
    justification,
    strengths,
    improvements,
    result: approved ? 'approved' : 'reproved'
  };

  const evaluations = getEvaluations();
  evaluations.push(evaluation);
  saveEvaluations(evaluations);

  const employees = getEmployees();
  const idx = employees.findIndex(e=>e.id===emp.id);
  if (idx >= 0) {
    employees[idx].status = approved ? 'pending_samuel' : 'registered';
  }
  saveEmployees(employees);

  // Marca exceção como usada (evita botão "Avaliar Agora" aparecer de novo)
  const excecoes = getExcecoes();
  const excIdx = excecoes.findIndex(ex => ex.employeeId === emp.id && ex.status === 'approved');
  if (excIdx >= 0) {
    excecoes[excIdx].status = 'used';
    saveExcecoes(excecoes);
  }

  document.querySelector('.modal-overlay')?.remove();

  if (approved) {
    showSuccessModal(`✅ Avaliação aprovada! (${score}%) O funcionário foi encaminhado para aprovação do Gerente Samuel.`);
  } else {
    showSuccessModal(`❌ Avaliação com resultado abaixo do mínimo (${score}%). O funcionário permanece em desenvolvimento.`);
  }

  renderSupervisorHome();
  updateNotifBadge();
  updateExcecoesBadges();
}

// ─── EXCEPTIONS (Supervisor) ──────────────────
function renderSupExcecoes() {
  const excecoes = getExcecoes().filter(ex=>ex.supervisor===currentUser.email);
  const listEl   = document.getElementById('sup-excecoes-list');
  if (!listEl) return;

  if (!excecoes.length) {
    listEl.innerHTML = `<div class="empty-state"><i class="fas fa-paper-plane"></i><p>Nenhuma solicitação enviada</p></div>`;
    return;
  }

  listEl.innerHTML = excecoes.map(ex => {
    const emp = getEmployees().find(e=>e.id===ex.employeeId);
    const statusLabel = ex.status==='pending'?'⏳ Pendente':ex.status==='approved'?'✅ Aprovada':'❌ Recusada';
    const statusCls   = ex.status==='pending'?'status-period':ex.status==='approved'?'status-approved':'status-registered';
    return `
    <div class="excecao-card">
      <div class="excecao-header">
        <div class="excecao-emp">${emp?.name||'—'}</div>
        <span class="status-badge ${statusCls}">${statusLabel}</span>
      </div>
      <div class="excecao-detail">
        <div><strong>Cargo:</strong> ${emp?.currentRole||'—'} → ${emp?.desiredRole||'—'}</div>
        <div><strong>Motivo:</strong> ${ex.reason||'—'}</div>
        <div><strong>Data:</strong> ${formatDate(ex.date)}</div>
        ${ex.managerReply?`<div class="excecao-reply"><strong>Resposta:</strong> ${ex.managerReply}</div>`:''}
      </div>
      ${ex.status==='approved'?`<div class="excecao-actions"><button class="btn-primary btn-sm" onclick="startEvaluation('${ex.employeeId}')"><i class="fas fa-star"></i> Avaliar Agora</button></div>`:''}
      ${ex.status==='used'?`<div class="excecao-actions"><button class="btn-outline btn-sm" disabled><i class="fas fa-check-circle"></i> Avaliação Realizada</button></div>`:''}
    </div>`;
  }).join('');
}

/** Colaboradores para os quais faz sentido abrir solicitação de exceção (sem tempo para promoção regular ou já cadastrados abaixo do mínimo). */
function getSupervisorTeamExceptionCandidates() {
  return getEmployees().filter(e => e.supervisor === currentUser.email && canShowSupervisorExcecaoButton(e));
}

function syncExcExceptionDesiredRoleUI() {
  const sel = document.getElementById('exc-employee');
  const wrap = document.getElementById('exc-desired-role-wrap');
  const minWrap = document.getElementById('exc-min-wrap');
  const roleSel = document.getElementById('exc-desired-role');
  const minInp = document.getElementById('exc-min-months');
  const careers = getCareers();
  const emp = getEmployees().find(e => e.id === sel?.value);
  if (!wrap || !roleSel || !minInp) return;
  if (!emp) {
    wrap.style.display = 'none';
    if (minWrap) minWrap.style.display = 'none';
    return;
  }
  if (emp.desiredRole) {
    wrap.style.display = 'none';
    minInp.value = emp.minMonths != null ? String(emp.minMonths) : '';
    if (minWrap) minWrap.style.display = 'none';
    return;
  }
  wrap.style.display = '';
  if (minWrap) minWrap.style.display = '';
  roleSel.innerHTML = `<option value="">-- Selecione o cargo destino --</option>` +
    careers.filter(c => c.name !== emp.currentRole).map(c =>
      `<option value="${c.name}" data-months="${c.minMonths}">${c.name} (mín. ${c.minMonths} meses)</option>`
    ).join('');
  minInp.value = '';
}

function updateExcMinMonthsFromSelect() {
  const roleSel = document.getElementById('exc-desired-role');
  const minInp = document.getElementById('exc-min-months');
  if (!roleSel || !minInp) return;
  const opt = roleSel.options[roleSel.selectedIndex];
  minInp.value = opt?.dataset?.months || '';
}

function openExceptionRequest(prefillEmpId) {
  const employees = getSupervisorTeamExceptionCandidates();
  if (!employees.length) {
    alert('Não há colaboradores elegíveis para solicitação de exceção no momento (tempo mínimo já atingido para promoção regular ou fluxo de promoção em andamento).');
    return;
  }

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3>📨 Solicitação de Exceção</h3>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body">
        <div class="info-box"><i class="fas fa-info-circle"></i> Solicite ao gerente a aprovação de avaliação antecipada (antes do tempo mínimo do cargo de destino).</div>
        <div class="form-group">
          <label>Funcionário *</label>
          <select id="exc-employee" onchange="syncExcExceptionDesiredRoleUI()">
            <option value="">-- Selecione --</option>
            ${employees.map(e => {
              const sub = e.desiredRole ? `${e.currentRole} → ${e.desiredRole}` : `${e.currentRole} (definir destino)`;
              return `<option value="${e.id}">${e.name} (${sub})</option>`;
            }).join('')}
          </select>
        </div>
        <div id="exc-desired-role-wrap" class="form-group" style="display:none">
          <label>Cargo desejado (promoção) *</label>
          <select id="exc-desired-role" onchange="updateExcMinMonthsFromSelect()"></select>
        </div>
        <div id="exc-min-wrap" class="form-group" style="display:none">
          <label>Tempo mínimo do cargo</label>
          <input type="number" id="exc-min-months" placeholder="—" readonly />
        </div>
        <div class="form-group">
          <label>Motivo da Exceção *</label>
          <textarea id="exc-reason" rows="4" placeholder="Explique por que este funcionário merece avaliação antecipada..."></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-outline" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
        <button class="btn-primary" onclick="sendExceptionRequest()"><i class="fas fa-paper-plane"></i> Enviar Solicitação</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  const excEmp = document.getElementById('exc-employee');
  if (prefillEmpId && excEmp) excEmp.value = prefillEmpId;
  syncExcExceptionDesiredRoleUI();
}

function sendExceptionRequest() {
  const empId  = document.getElementById('exc-employee')?.value;
  const reason = document.getElementById('exc-reason')?.value.trim();
  if (!empId || !reason) { alert('Preencha todos os campos obrigatórios.'); return; }

  const employees = getEmployees();
  const idx = employees.findIndex(e => e.id === empId);
  if (idx < 0) return;
  const emp = employees[idx];

  if (!emp.desiredRole) {
    const dRole = document.getElementById('exc-desired-role')?.value;
    const career = getCareers().find(c => c.name === dRole);
    const minM = career ? career.minMonths : null;
    if (!dRole || minM == null) { alert('Selecione o cargo desejado para a promoção.'); return; }
    const months = calcTenure(emp.admission);
    if (months >= minM) {
      alert('Para este cargo o colaborador já atinge o tempo mínimo. Use a solicitação de promoção regular (Promoção).');
      return;
    }
    employees[idx].desiredRole = dRole;
    employees[idx].minMonths = minM;
    employees[idx].status = 'registered';
    saveEmployees(employees);
  }

  const excecoes = getExcecoes();
  excecoes.push({ id: uuid(), employeeId: empId, supervisor: currentUser.email, reason, date: new Date().toISOString().split('T')[0], status: 'pending', managerReply: '' });
  saveExcecoes(excecoes);
  document.querySelector('.modal-overlay')?.remove();
  renderSupExcecoes();
  updateExcecoesBadges();
  renderSupervisorHome();
  if (typeof renderSupervisorTeam === 'function') renderSupervisorTeam();
  showSuccessModal('✅ Solicitação enviada ao Gerente Samuel!');
}

// ─── MANAGER: APPROVE EXCEPTIONS ─────────────
function renderMgrExcecoes() {
  const excecoes = getExcecoes().filter(ex=>ex.status==='pending');
  const listEl   = document.getElementById('mgr-excecoes-list');
  if (!listEl) return;

  if (!excecoes.length) {
    listEl.innerHTML = `<div class="empty-state"><i class="fas fa-shield-alt"></i><p>Nenhuma solicitação pendente</p></div>`;
    return;
  }

  listEl.innerHTML = excecoes.map(ex => {
    const emp = getEmployees().find(e=>e.id===ex.employeeId);
    const sup = DEMO_USERS.find(u=>u.email===ex.supervisor);
    return `
    <div class="excecao-card">
      <div class="excecao-header">
        <div class="excecao-emp">${emp?.name||'—'} <span class="excecao-sup">Supervisor: ${sup?.name||'—'}</span></div>
      </div>
      <div class="excecao-detail">
        <div><strong>Cargo:</strong> ${emp?.currentRole||'—'} → ${emp?.desiredRole||'—'}</div>
        <div><strong>Tempo de Casa:</strong> ${tenureText(calcTenure(emp?.admission||''))}</div>
        <div><strong>Mínimo Exigido:</strong> ${emp?.minMonths||'?'} meses</div>
        <div><strong>Motivo:</strong> ${ex.reason||'—'}</div>
        <div><strong>Data:</strong> ${formatDate(ex.date)}</div>
      </div>
      <div class="form-group" style="margin-top:12px">
        <label>Resposta</label>
        <input type="text" id="reply-${ex.id}" placeholder="Mensagem de resposta (opcional)..." />
      </div>
      <div class="excecao-actions">
        <button class="btn-primary btn-sm" onclick="resolveExcecao('${ex.id}','approved')"><i class="fas fa-check"></i> Aprovar</button>
        <button class="btn-outline btn-sm red" onclick="resolveExcecao('${ex.id}','rejected')"><i class="fas fa-times"></i> Recusar</button>
      </div>
    </div>`;
  }).join('');
}

function resolveExcecao(excId, status) {
  const reply   = document.getElementById(`reply-${excId}`)?.value.trim();
  const excecoes= getExcecoes();
  const idx     = excecoes.findIndex(e=>e.id===excId);
  if (idx < 0) return;

  excecoes[idx].status      = status;
  excecoes[idx].managerReply= reply||'';
  excecoes[idx].resolvedAt  = new Date().toISOString().split('T')[0];

  if (status==='approved') {
    const empId    = excecoes[idx].employeeId;
    const employees= getEmployees();
    const empIdx   = employees.findIndex(e=>e.id===empId);
    if (empIdx >= 0) employees[empIdx].status = 'ready';
    saveEmployees(employees);
  }

  saveExcecoes(excecoes);
  renderMgrExcecoes();
  updateExcecoesBadges();
  showSuccessModal(status==='approved'?'✅ Exceção aprovada! O funcionário pode ser avaliado agora.':'❌ Solicitação recusada.');
}

// ─── MANAGER: APPROVE PROMOTIONS ─────────────
function renderMgrPromoApprovals() {
  const employees   = getEmployees();
  const pending     = employees.filter(e=>['pending_samuel','pending_samuel_return'].includes(e.status));
  const evaluations = getEvaluations();
  const container   = document.getElementById('mgr-promo-list');
  if (!container) return;

  if (!pending.length) {
    container.innerHTML = `<div class="empty-state"><i class="fas fa-user-check"></i><p>Nenhuma promoção aguardando sua aprovação</p></div>`;
    return;
  }

  container.innerHTML = pending.map(emp => buildPromoReport(emp, evaluations, 'manager')).join('');
}

// ─── BOSS DASHBOARD ───────────────────────────
function renderBossDashboard() {
  const employees   = getEmployees();
  const evaluations = getEvaluations();

  const total       = employees.length;
  const inProgress  = employees.filter(e=>['pending_samuel','pending_samuel_return','pending_carlos'].includes(e.status)).length;
  const awaitBoss   = employees.filter(e=>e.status==='pending_carlos').length;
  const promoted    = employees.filter(e=>e.status==='promoted').length;
  const evaluated   = evaluations.length;
  const apt         = employees.filter(e=>e.minMonths&&calcTenure(e.admission)>=e.minMonths).length;

  const kpiIds = ['boss-kpi-total','boss-kpi-progress','boss-kpi-await','boss-kpi-promoted','boss-kpi-evals','boss-kpi-apt'];
  const kpiVals= [total,inProgress,awaitBoss,promoted,evaluated,apt];
  kpiIds.forEach((id,i)=>{ const el=document.getElementById(id); if(el) el.textContent=kpiVals[i]; });

  const alertEl = document.getElementById('boss-urgent-alert');
  const alertCt = document.getElementById('boss-urgent-count');
  if (alertEl) {
    if (awaitBoss > 0) { alertEl.classList.remove('hidden'); if(alertCt) alertCt.textContent=awaitBoss; }
    else alertEl.classList.add('hidden');
  }

  // Charts
  const bossTeamMap = {
    'sup1@lumini':    { name:'Daniel',  color:'#003366' },
    'sup2@lumini':    { name:'Kauê',    color:'#1B4F8A' },
    'sup3@lumini':    { name:'Toni',    color:'#0F766E' },
    'sup4@lumini':    { name:'Hélcio',  color:'#92400E' },
    'gerente@lumini': { name:'Samuel',  color:'#7B2D8B' },
    'diretor@lumini': { name:'Carlos',  color:'#B45309' }
  };

  const teamCounts = {};
  employees.forEach(e => { const k=e.supervisor||'outro'; teamCounts[k]=(teamCounts[k]||0)+1; });
  const teamKeys   = Object.keys(teamCounts);
  const teamLabels = teamKeys.map(k=>(bossTeamMap[k]||{name:k}).name);
  const teamData   = teamKeys.map(k=>teamCounts[k]);
  const teamColors = teamKeys.map(k=>(bossTeamMap[k]||{color:'#9CA3AF'}).color);

  if (window._bossChartTeam) { window._bossChartTeam.destroy(); window._bossChartTeam=null; }
  const bossTeamCtx = document.getElementById('boss-chart-team');
  if (bossTeamCtx) {
    window._bossChartTeam = new Chart(bossTeamCtx, {
      type: 'bar',
      data: { labels:teamLabels, datasets:[{ data:teamData, backgroundColor:teamColors, borderRadius:8, borderWidth:0 }] },
      options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ y:{beginAtZero:true,ticks:{stepSize:1}}, x:{grid:{display:false}} } }
    });
  }

  const statusData = [
    employees.filter(e=>e.status==='registered').length,
    employees.filter(e=>!['ready','promoted','approved','pending_samuel','pending_samuel_return','pending_carlos'].includes(e.status)&&calcTenure(e.admission)<(e.minMonths||999)).length,
    employees.filter(e=>e.status==='ready').length,
    employees.filter(e=>['pending_samuel','pending_samuel_return'].includes(e.status)).length,
    employees.filter(e=>e.status==='pending_carlos').length,
    employees.filter(e=>e.status==='approved').length,
    employees.filter(e=>e.status==='promoted').length,
  ];

  if (window._bossChartStatus) { window._bossChartStatus.destroy(); window._bossChartStatus=null; }
  const bossStatusCtx = document.getElementById('boss-chart-status');
  if (bossStatusCtx) {
    window._bossChartStatus = new Chart(bossStatusCtx, {
      type: 'doughnut',
      data: { labels:['Cadastrado','Em Período','Apto','Ag. Samuel','Ag. Carlos','Aprovado','Promovido'], datasets:[{ data:statusData, backgroundColor:['#E0E7FF','#FEE2E2','#FEF3C7','#FDE68A','#DDD6FE','#DCFCE7','#EDE9FE'], borderWidth:2 }] },
      options: { responsive:true, maintainAspectRatio:false, cutout:'60%', plugins:{ legend:{position:'right',labels:{font:{size:11}}} } }
    });
  }
}

// ─── BOSS: APPROVE PROMOTIONS ────────────────
function renderBossPromoApprovals() {
  const employees   = getEmployees();
  const pending     = employees.filter(e=>e.status==='pending_carlos');
  const evaluations = getEvaluations();
  const container   = document.getElementById('boss-promo-list');
  if (!container) return;

  if (!pending.length) {
    container.innerHTML = `<div class="empty-state"><i class="fas fa-trophy"></i><p>Nenhuma promoção aguardando aprovação</p></div>`;
    return;
  }

  container.innerHTML = pending.map(emp => buildPromoReport(emp, evaluations, 'boss')).join('');
}

// ─── BUILD PROMO REPORT ───────────────────────
function buildPromoReport(emp, evaluations, role) {
  const months  = calcTenure(emp.admission);
  const supUser = DEMO_USERS.find(u=>u.email===emp.supervisor);
  const evals   = evaluations.filter(ev=>ev.employeeId===emp.id).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const lastEv  = evals[0];

  const approveBtn = role==='boss'
    ? `<button class="btn-primary" onclick="approvePromo('${emp.id}','boss')"><i class="fas fa-trophy"></i> Aprovar Promoção</button>
       <button class="btn-outline red" onclick="openRejectModal('${emp.id}','boss')"><i class="fas fa-times"></i> Reprovar</button>`
    : `<button class="btn-primary" onclick="approvePromo('${emp.id}','manager')"><i class="fas fa-user-check"></i> Enviar ao Diretor</button>
       <button class="btn-outline red" onclick="openRejectModal('${emp.id}','manager')"><i class="fas fa-times"></i> Recusar</button>`;

  return `
  <div class="promo-report-card">
    <div class="promo-report-header">
      <div class="promo-report-avatar">${getInitials(emp.name)}</div>
      <div class="promo-report-info">
        <div class="promo-report-name">${emp.name}</div>
        <div class="promo-report-trail">${emp.currentRole} <span class="promo-arrow">→</span> ${emp.desiredRole||'—'}</div>
      </div>
    </div>
    <div class="promo-report-tags">
      <span class="promo-tag"><i class="fas fa-user-tie"></i> ${supUser?.name||'—'}</span>
      <span class="promo-tag"><i class="fas fa-calendar"></i> ${formatDate(emp.admission)}</span>
      <span class="promo-tag"><i class="fas fa-clock"></i> ${tenureText(months)}</span>
      <span class="promo-tag ${months>=(emp.minMonths||0)?'green':'red'}"><i class="fas fa-hourglass"></i> Mín: ${emp.minMonths||'?'} meses</span>
    </div>
    ${lastEv?`
    <div class="promo-report-score">
      <div class="promo-score-circle ${lastEv.score>=75?'green':lastEv.score>=50?'yellow':'red'}">${lastEv.score}%</div>
      <div class="promo-score-details">
        <div class="promo-score-title">Resultado da Avaliação</div>
        <div class="promo-score-stars">${'★'.repeat(lastEv.stars||0)}${'☆'.repeat(5-(lastEv.stars||0))}</div>
        <div class="promo-score-date">${formatDate(lastEv.date)}</div>
      </div>
    </div>
    <div class="promo-report-sections">
      ${Object.entries(lastEv.sections||{}).map(([sec,data])=>`
      <div class="promo-sec-item">
        <span class="promo-sec-label">${sec==='tecnica'?'Técnica':sec==='comportamento'?'Comportamento':sec==='seguranca'?'Segurança':'Potencial'}</span>
        <div class="promo-sec-bar"><div class="promo-sec-fill" style="width:${data.pct||0}%;background:${data.pct>=75?'#16A34A':data.pct>=50?'#D97706':'#DC2626'}"></div></div>
        <span class="promo-sec-pct">${data.pct||0}%</span>
      </div>`).join('')}
    </div>
    ${lastEv.justification?`<div class="promo-justification"><i class="fas fa-quote-left"></i> ${lastEv.justification}</div>`:''}
    ${lastEv.strengths?`<div class="promo-strengths"><strong>✅ Pontos Fortes:</strong> ${lastEv.strengths}</div>`:''}
    ${lastEv.improvements?`<div class="promo-improvements"><strong>🔧 A Desenvolver:</strong> ${lastEv.improvements}</div>`:''}
    `:'<div class="promo-no-eval"><i class="fas fa-exclamation-triangle"></i> Sem avaliação registrada</div>'}
    ${evals.length>1?`
    <details class="promo-history-details">
      <summary>📋 Histórico de Avaliações (${evals.length})</summary>
      ${evals.slice(1).map(ev=>`<div class="promo-hist-item"><span>${formatDate(ev.date)}</span><span>${ev.fromRole} → ${ev.toRole}</span><span class="${ev.score>=75?'text-green':'text-red'}">${ev.score}%</span></div>`).join('')}
    </details>`:''}
    <div class="promo-report-actions">${approveBtn}</div>
  </div>`;
}

function approvePromo(empId, role) {
  const employees = getEmployees();
  const idx = employees.findIndex(e=>e.id===empId);
  if (idx<0) return;

  if (role==='boss') {
    const empForNotif = { id: employees[idx].id, name: employees[idx].name, supervisor: employees[idx].supervisor };
    const emp = employees[idx];
    const evals = getEvaluations().filter(e=>e.employeeId===empId);
    const lastEval = evals.sort((a,b)=>b.date.localeCompare(a.date))[0];
    const supUser = DEMO_USERS.find(u=>u.email===emp.supervisor);

    employees[idx].status = 'promoted';
    employees[idx].currentRole = employees[idx].desiredRole||employees[idx].currentRole;
    employees[idx].promotedAt = new Date().toISOString().split('T')[0];
    employees[idx].desiredRole = null;
    employees[idx].minMonths   = null;
    saveEmployees(employees);

    // ── Cria notificação para o RH ────────────────
    if (window.createRHNotificacao) {
      window.createRHNotificacao({
        employeeId:    emp.id,
        employeeName:  emp.name,
        fromRole:      lastEval ? lastEval.fromRole : emp.currentRole,
        toRole:        lastEval ? lastEval.toRole   : emp.desiredRole,
        supervisor:    supUser ? supUser.name : emp.supervisor,
        approvedBy:    'Carlos',
        approvedAt:    new Date().toISOString().split('T')[0],
        score:         lastEval ? lastEval.score : null,
        stars:         lastEval ? lastEval.stars : null,
        justification: lastEval ? lastEval.justification : '',
        strengths:     lastEval ? lastEval.strengths : '',
        improvements:  lastEval ? lastEval.improvements : '',
        feedback:      emp.promoObs || '',
        status:        'pendente'
      });
    }

    if (window._ntNotifyPromoForSupervisor) window._ntNotifyPromoForSupervisor(empForNotif, 'approved_boss');

    showSuccessModal('🎉 Promoção APROVADA! O funcionário foi promovido com sucesso!');
    renderBossPromoApprovals();
  } else if (role==='manager') {
    const empForNotif = { id: employees[idx].id, name: employees[idx].name, supervisor: employees[idx].supervisor };
    employees[idx].status = 'pending_carlos';
    saveEmployees(employees);
    if (window._ntNotifyPromoForSupervisor) window._ntNotifyPromoForSupervisor(empForNotif, 'approved_manager');
    showSuccessModal('✅ Promoção encaminhada ao Diretor Carlos para aprovação final!');
    renderMgrPromoApprovals();
  }
  updateNotifBadge();
  updatePromoApprovalBadges();
}

function openRejectModal(empId, role) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3>❌ Reprovar Promoção</h3>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>Motivo da Reprovação *</label>
          <textarea id="reject-reason" rows="4" placeholder="Explique o motivo da reprovação..."></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-outline" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
        <button class="btn-primary red" onclick="rejectPromo('${empId}','${role}')"><i class="fas fa-times"></i> Confirmar Reprovação</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

function rejectPromo(empId, role) {
  const reason    = document.getElementById('reject-reason')?.value.trim();
  if (!reason) { alert('Informe o motivo da reprovação!'); return; }

  const employees = getEmployees();
  const idx       = employees.findIndex(e=>e.id===empId);
  if (idx<0) return;

  const empForNotif = { id: employees[idx].id, name: employees[idx].name, supervisor: employees[idx].supervisor };

  employees[idx].status   = 'registered';
  employees[idx].promoObs = `[REPROVADO] ${reason}`;
  saveEmployees(employees);

  if (window._ntNotifyPromoForSupervisor) window._ntNotifyPromoForSupervisor(empForNotif, 'rejected');

  document.querySelectorAll('.modal-overlay').forEach(m=>m.remove());
  showSuccessModal('❌ Promoção reprovada. O funcionário foi notificado.');

  if (role==='boss') renderBossPromoApprovals();
  else renderMgrPromoApprovals();
  updateNotifBadge();
  updatePromoApprovalBadges();
}

// ─── BADGES ──────────────────────────────────
function updatePromoApprovalBadges() {
  const employees = getEmployees();
  const wesleyCount  = employees.filter(e=>['pending_samuel','pending_samuel_return'].includes(e.status)).length;
  const carlosCount  = employees.filter(e=>e.status==='pending_carlos').length;

  const wesleyBadge = document.getElementById('badge-promo-wesley');
  const carlosBadge = document.getElementById('badge-promo-carlos');

  if (wesleyBadge) { wesleyBadge.textContent=wesleyCount||''; wesleyBadge.style.display=wesleyCount>0?'inline-flex':'none'; }
  if (carlosBadge) { carlosBadge.textContent=carlosCount||''; carlosBadge.style.display=carlosCount>0?'inline-flex':'none'; }
}

function updateExcecoesBadges() {
  const excecoes = getExcecoes();
  const pendingCount = excecoes.filter(e=>e.status==='pending').length;
  const mySup = excecoes.filter(e=>e.supervisor===currentUser?.email&&e.status==='pending').length;

  const mgrBadge = document.getElementById('badge-excecoes-mgr');
  const supBadge = document.getElementById('badge-excecoes-sup');

  if (mgrBadge) { mgrBadge.textContent=pendingCount||''; mgrBadge.style.display=pendingCount>0?'inline-flex':'none'; }
  if (supBadge) { supBadge.textContent=''; supBadge.style.display='none'; }
}

// ─── SUPERVISOR PROMO HISTORY ─────────────────
function renderSupervisorPromoPage() {
  const employees = getEmployees();
  const myTeam    = currentUser.role==='supervisor' ? employees.filter(e=>e.supervisor===currentUser.email) : employees;
  renderPromoHistory('sup-', myTeam);
}

// ─── NOTIFICATIONS ────────────────────────────
let _notifCheckInterval = null;
let _lastNotifCount = 0;

function initNotifications() {
  if (_notifCheckInterval) clearInterval(_notifCheckInterval);
  _lastNotifCount = getNotifCount();

  _notifCheckInterval = setInterval(() => {
    const count = getNotifCount();
    if (count > _lastNotifCount) {
      const nLabel = count === 1 ? 'notificação' : 'notificações';
      const pLabel = count === 1 ? 'pendente' : 'pendentes';
      showToast(`🔔 ${count} ${nLabel} ${pLabel}!`);
    }
    _lastNotifCount = count;
    updateNotifBadge();
  }, 30000);
}

function getNotifCount() {
  if (!currentUser) return 0;
  if (window._ntGetUnreadInAppCount) return window._ntGetUnreadInAppCount();
  return 0;
}

function openNotifConfig() {
  const btn = document.getElementById('notif-config-btn');
  if (!btn) return;
  showToast('ℹ️ Notificações automáticas ativas (verificação a cada 30 segundos)');
}

// ─── SUCCESS MODAL ───────────────────────────
function showSuccessModal(message) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal" style="max-width:400px;text-align:center">
      <div class="modal-body" style="padding:32px">
        <div style="font-size:48px;margin-bottom:16px">✅</div>
        <p style="font-size:16px;color:#374151">${message}</p>
      </div>
      <div class="modal-footer" style="justify-content:center">
        <button class="btn-primary" onclick="this.closest('.modal-overlay').remove()">OK</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  setTimeout(() => modal.remove(), 5000);
}

function showToast(message, type = 'info') {
  // Usa o novo sistema de toast se disponível
  if (window._ntShowToast) {
    window._ntShowToast(message, type);
    return;
  }
  // Fallback legado
  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(()=>toast.classList.add('show'), 100);
  setTimeout(()=>{ toast.classList.remove('show'); setTimeout(()=>toast.remove(),300); }, 3500);
}

// Stub de compatibilidade (modal de estampa removido – interação agora é inline)
function closeStampModal() { /* não utilizado */ }

// ─── STAMP INTERATIVO — Drag elástico + nome no click ────────────────────────
//
//  Comportamento:
//  • Clique simples (sem arrastar): mostra/esconde o nome da estampa
//  • Clicar e arrastar: move a estampa livremente, nome aparece durante o drag
//  • Soltar: estampa volta com animação elástica ao ponto de origem (spring)
//  • O float animation pausa durante o drag e retoma suavemente ao soltar
//  • Outros stamps ficam em z-index normal; o arrastado sobe para frente
// ─────────────────────────────────────────────────────────────────────────────

function _initStampInteractions() {
  document.querySelectorAll('.stamp-float').forEach(stamp => {
    let isDragging  = false;
    let hasMoved    = false;
    let startX      = 0, startY = 0;
    let offsetX     = 0, offsetY = 0;
    // originLeft/Top: posição capturada em px no momento do mousedown (inclui a translateY da animação)
    let originLeft  = 0, originTop = 0;
    let rafId       = null;
    let nameVisible = false; // toggle manual do nome (clique sem drag)

    /* ---------- helpers ---------- */

    // Retorna a posição absoluta atual do elemento em relação ao offsetParent,
    // levando em conta qualquer transform que a animação CSS esteja aplicando.
    function capturePos(el) {
      const r  = el.getBoundingClientRect();
      const pr = (el.offsetParent || document.documentElement).getBoundingClientRect();
      return { left: r.left - pr.left, top: r.top - pr.top };
    }

    // Fixa o elemento na posição px fornecida e pausa o float
    function freezeAt(left, top) {
      stamp.style.transition          = 'none';
      stamp.style.animationPlayState  = 'paused';
      stamp.style.left   = left + 'px';
      stamp.style.top    = top  + 'px';
      stamp.style.right  = 'auto';
      stamp.style.bottom = 'auto';
    }

    /* ---------- eventos ---------- */

    function onStart(e) {
      e.preventDefault();
      const pt   = e.touches ? e.touches[0] : e;
      startX     = pt.clientX;
      startY     = pt.clientY;
      hasMoved   = false;

      // Captura posição visual real (inclui translateY da animação flutuante)
      const pos  = capturePos(stamp);
      originLeft = pos.left;
      originTop  = pos.top;

      // Fixa em px para poder mover sem conflito com classes CSS de posição
      freezeAt(originLeft, originTop);

      // Distância do cursor até o canto TL da stamp
      const rect = stamp.getBoundingClientRect();
      offsetX = pt.clientX - rect.left;
      offsetY = pt.clientY - rect.top;

      isDragging = true;

      document.addEventListener('mousemove', onMove, { passive: false });
      document.addEventListener('mouseup',   onEnd,  { passive: false });
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend',  onEnd,  { passive: false });
    }

    function onMove(e) {
      if (!isDragging) return;
      e.preventDefault();

      const pt = e.touches ? e.touches[0] : e;
      const dx = pt.clientX - startX;
      const dy = pt.clientY - startY;

      if (!hasMoved && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
        hasMoved = true;
        stamp.classList.add('dragging');   // cursor grabbing + shadow
        stamp.classList.add('name-show');  // mostra nome durante drag
        stamp.style.zIndex = '200';
      }

      if (!hasMoved) return;

      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const pr     = (stamp.offsetParent || document.documentElement).getBoundingClientRect();
        const newL   = pt.clientX - pr.left - offsetX;
        const newT   = pt.clientY - pr.top  - offsetY;
        stamp.style.left = newL + 'px';
        stamp.style.top  = newT + 'px';
      });
    }

    function onEnd(e) {
      if (!isDragging) return;
      isDragging = false;
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }

      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onEnd);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend',  onEnd);

      if (!hasMoved) {
        // ── Clique simples: toggle do nome, volta à posição sem animar ──
        nameVisible = !nameVisible;
        stamp.classList.toggle('name-show', nameVisible);
        // Limpa estilos inline para devolver o controle ao CSS (classes stamp-tl, etc.)
        stamp.style.transition         = '';
        stamp.style.animationPlayState = '';
        stamp.style.left   = '';
        stamp.style.top    = '';
        stamp.style.right  = '';
        stamp.style.bottom = '';
        return;
      }

      // ── Fim do drag: spring elástico de volta à origem ──
      stamp.classList.remove('dragging');
      stamp.classList.remove('name-show'); // esconde nome ao soltar

      // Anima de volta com spring cubic-bezier
      stamp.style.transition = [
        'left .42s cubic-bezier(.34,1.56,.64,1)',
        'top  .42s cubic-bezier(.34,1.56,.64,1)',
        'box-shadow .25s ease'
      ].join(',');
      stamp.style.left   = originLeft + 'px';
      stamp.style.top    = originTop  + 'px';
      stamp.style.right  = 'auto';
      stamp.style.bottom = 'auto';

      // Após a transição terminar: devolve controle ao CSS
      stamp.addEventListener('transitionend', function restore() {
        stamp.removeEventListener('transitionend', restore);
        stamp.style.transition         = '';
        stamp.style.animationPlayState = '';
        stamp.style.zIndex             = '';
        // Mantém left/top inline para o float continuar a partir da posição correta
        // (a animação translateY opera sobre left/top, então não causa conflito)
      });
    }

    stamp.addEventListener('mousedown',  onStart);
    stamp.addEventListener('touchstart', onStart, { passive: false });
  });
}

// ═══════════════════════════════════════════════════════════════
//  SISTEMA DE TOAST AVANÇADO — Notificações in-app
//  Substitui o toast simples por um sistema de stack com tipos
// ═══════════════════════════════════════════════════════════════

(function _initToastSystem() {
  // Cria container se não existir
  function _getContainer() {
    let c = document.getElementById('nt-toast-container');
    if (!c) {
      c = document.createElement('div');
      c.id = 'nt-toast-container';
      c.className = 'nt-toast-container';
      document.body.appendChild(c);
    }
    return c;
  }

  const ICONS = {
    success: '✅',
    error:   '❌',
    warning: '⚠️',
    info:    'ℹ️'
  };

  window._ntShowToast = function(message, type = 'info', duration = 4000) {
    const container = _getContainer();
    const toast = document.createElement('div');
    toast.className = `nt-toast ${type}`;

    toast.innerHTML = `
      <span class="nt-toast-icon">${ICONS[type] || '💬'}</span>
      <span class="nt-toast-msg">${message}</span>
      <button class="nt-toast-close" onclick="this.parentElement._dismiss()" aria-label="Fechar">✕</button>
    `;

    toast._dismiss = function() {
      toast.classList.add('hiding');
      toast.classList.remove('show');
      setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 400);
    };

    container.appendChild(toast);

    // Animar entrada
    requestAnimationFrame(() => {
      requestAnimationFrame(() => toast.classList.add('show'));
    });

    // Auto-dismiss
    if (duration > 0) {
      setTimeout(() => toast._dismiss && toast._dismiss(), duration);
    }

    return toast;
  };
})();

// ═══════════════════════════════════════════════════════════════
//  CONFIRM DIALOG MODERNO — Substitui window.confirm nativo
// ═══════════════════════════════════════════════════════════════

window._ntConfirm = function(options) {
  return new Promise((resolve) => {
    const defaults = {
      title:   'Confirmar ação',
      message: 'Tem certeza que deseja continuar?',
      icon:    '⚠️',
      okText:  'Confirmar',
      okClass: '',          // 'confirm-ok-primary' para azul
      cancelText: 'Cancelar'
    };
    const cfg = Object.assign({}, defaults, options);

    const overlay = document.createElement('div');
    overlay.className = 'nt-confirm-overlay';
    overlay.innerHTML = `
      <div class="nt-confirm-box">
        <div class="nt-confirm-icon">${cfg.icon}</div>
        <div class="nt-confirm-title">${cfg.title}</div>
        <div class="nt-confirm-msg">${cfg.message}</div>
        <div class="nt-confirm-actions">
          <button class="nt-confirm-cancel" id="_ntConfirmCancel">${cfg.cancelText}</button>
          <button class="nt-confirm-ok ${cfg.okClass}" id="_ntConfirmOk">${cfg.okText}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    function close(result) {
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 0.2s';
      setTimeout(() => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 220);
      resolve(result);
    }

    overlay.querySelector('#_ntConfirmOk').addEventListener('click', () => close(true));
    overlay.querySelector('#_ntConfirmCancel').addEventListener('click', () => close(false));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });

    // Esc fecha
    const escHandler = (e) => { if (e.key === 'Escape') { document.removeEventListener('keydown', escHandler); close(false); } };
    document.addEventListener('keydown', escHandler);

    // Focus no botão OK
    setTimeout(() => { const btn = overlay.querySelector('#_ntConfirmOk'); if (btn) btn.focus(); }, 50);
  });
};

// ═══════════════════════════════════════════════════════════════
//  BREADCRUMB — Navegação contextual na topbar
// ═══════════════════════════════════════════════════════════════

const PAGE_TITLES = {
  'admin-dashboard':       'Dashboard',
  'admin-employees':       'Funcionários',
  'admin-careers':         'Trilha de Carreira',
  'admin-supervisors':     'Por Supervisor',
  'admin-evaluations':     'Avaliações',
  'admin-matrix':          'Matriz de Polivalência',
  'admin-reports':         'Relatórios',
  'admin-teams':           'Equipes de Produção',
  'admin-rh-dashboard':    'Dashboard RH',
  'admin-rh-employees':    'Colaboradores',
  'admin-rh-turnover':     'Turnover',
  'admin-rh-holerites':    'Publicar Holerite',
  'supervisor-home':       'Início',
  'supervisor-employees':  'Minha Equipe',
  'supervisor-team-attendance': 'Frequência da Equipe',
  'supervisor-promo-history': 'Histórico de Promoções',
  'supervisor-excecoes':   'Solicitações de Exceção',
  'manager-excecoes':      'Aprovar Exceções',
  'manager-promo-approvals': 'Aprovar Promoções',
  'manager-teams':         'Equipes de Produção',
  'boss-dashboard':        'Painel Geral',
  'boss-promo-approvals':  'Aprovação Final',
  'boss-rh-dashboard':     'Dashboard RH',
  'boss-rh-turnover':      'Turnover',
  'rh-dashboard':          'Dashboard RH',
  'rh-employees':          'Colaboradores',
  'rh-turnover':           'Turnover',
  'rh-promocoes':          'Promoções Homologadas',
  'rh-holerites':          'Publicar Holerite',
  'comms':                 'Comunicação Interna'
};

function _updateBreadcrumb(page) {
  const bc = document.getElementById('topbar-breadcrumb');
  if (!bc) return;

  const label = PAGE_TITLES[page] || page;
  const roleLabel = currentUser ?
    (currentUser.role === 'admin'   ? 'Admin' :
     currentUser.role === 'manager' ? 'Gerente' :
     currentUser.role === 'boss'    ? 'Diretor' :
     currentUser.role === 'rh'      ? 'RH' : 'Supervisor') : '';

  bc.innerHTML = `
    <span class="topbar-breadcrumb-sep">›</span>
    <span class="topbar-breadcrumb-page">${label}</span>
  `;
}

// Sobrescreve navigateTo para atualizar breadcrumb
(function _patchNavigateTo() {
  const _origNavigate = navigateTo;
  window.navigateTo = function(page) {
    _origNavigate(page);
    _updateBreadcrumb(page);
  };
})();

// ═══════════════════════════════════════════════════════════════
//  KEYBOARD SHORTCUTS — Atalhos de teclado
// ═══════════════════════════════════════════════════════════════

(function _initKeyboardShortcuts() {
  document.addEventListener('keydown', function(e) {
    // Não interfere em inputs
    if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
    if (!currentUser || !document.getElementById('app') || document.getElementById('app').classList.contains('hidden')) return;

    const key = e.key.toLowerCase();
    const ctrl = e.ctrlKey || e.metaKey;

    // Alt + D → Dashboard
    if (e.altKey && key === 'd') {
      e.preventDefault();
      if (currentUser.role === 'admin') navigateTo('admin-dashboard');
      else if (currentUser.role === 'boss') navigateTo('boss-dashboard');
      else navigateTo('supervisor-home');
    }

    // Alt + T → Tutorial
    if (e.altKey && key === 't') {
      e.preventDefault();
      if (window.startOnboardingTour) window.startOnboardingTour(true);
    }

    // Alt + M → Toggle dark mode
    if (e.altKey && key === 'm') {
      e.preventDefault();
      const isDark = document.body.classList.contains('dark-mode');
      if (window.toggleDarkMode) window.toggleDarkMode(!isDark);
    }

    // Esc → Fechar modais abertos
    if (key === 'escape') {
      const modals = document.querySelectorAll('.modal-overlay:not(.hidden)');
      modals.forEach(m => {
        const closeBtn = m.querySelector('.modal-close, [onclick*="close"], [onclick*="Close"]');
        if (closeBtn) closeBtn.click();
      });
    }

    // Alt + S → Sidebar toggle (mobile)
    if (e.altKey && key === 's') {
      e.preventDefault();
      if (window.innerWidth < 1024) toggleSidebar();
    }
  });
})();

// ═══════════════════════════════════════════════════════════════
//  RIPPLE EFFECT — Botões com feedback de toque
// ═══════════════════════════════════════════════════════════════

(function _initRipple() {
  document.addEventListener('click', function(e) {
    const btn = e.target.closest('.btn-primary, .btn-outline');
    if (!btn) return;

    const rect = btn.getBoundingClientRect();
    const ripple = document.createElement('span');
    ripple.className = 'btn-ripple';

    const size = Math.max(rect.width, rect.height) * 2;
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top  - size / 2;

    ripple.style.cssText = `width:${size}px;height:${size}px;left:${x}px;top:${y}px;`;
    btn.appendChild(ripple);

    ripple.addEventListener('animationend', () => {
      if (ripple.parentNode) ripple.parentNode.removeChild(ripple);
    });
  });
})();

document.addEventListener('DOMContentLoaded', () => {
  // Inicializa toggle de dark mode
  _initDarkToggle();

  // Inicializa drag elástico das estampas
  _initStampInteractions();

  // ─── FIX MOBILE: toque sem delay em elementos com onclick ───
  // Um único caminho de ativação evita duplo toggle (hambúrguer) e dupla navegação (nav-item).
  // .menu-toggle fica de fora: já tem touch-action:manipulation e onclick; o handler global
  // dispararia click() no touchend e somaria ao click nativo.
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  if (isMobile) {
    let touchStartY = 0;
    let touchStartX = 0;

    document.addEventListener('touchstart', function(e) {
      touchStartY = e.touches[0].clientY;
      touchStartX = e.touches[0].clientX;
    }, { passive: true });

    document.addEventListener('touchend', function(e) {
      const touchEndY = e.changedTouches[0].clientY;
      const touchEndX = e.changedTouches[0].clientX;
      const deltaY = Math.abs(touchEndY - touchStartY);
      const deltaX = Math.abs(touchEndX - touchStartX);

      if (deltaY > 10 || deltaX > 10) return;

      const el = e.target.closest('[onclick]');
      if (!el) return;

      if (el.classList.contains('menu-toggle')) return;

      const tag = e.target.tagName.toLowerCase();
      if (['input', 'select', 'textarea', 'option'].includes(tag)) return;

      e.preventDefault();
      el.click();
    }, { passive: false });
  }
});

window.updateNotifBadge    = updateNotifBadge;
window.updateExcecoesBadges= updateExcecoesBadges;
