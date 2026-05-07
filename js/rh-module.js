/* =============================================
   RH-MODULE.JS — Módulo de Recursos Humanos
   Lumini — Gestão de RH & Turnover
   
   Inclui:
   - CRUD completo de funcionários (dados HR)
   - Dashboard de Turnover & Rotatividade
   - Filtros avançados
   - Relatórios por período
============================================= */

// ─── CHARTS RH ──────────────────────────────
let chartHRTurnover    = null;
let chartHRPie         = null;
let chartHRAdmDemiss   = null;
let chartHRAge         = null;
let chartHRTurnMonthly = null;

// ─── Expõe funções de render no window ───────
// (chamadas pelo navigateTo no app.js via window._rhRender*)
window._rhRenderDashboard  = function() { renderRHDashboard(); };
window._rhRenderEmployees  = function() { renderRHEmployeesTable(); };
window._rhRenderTurnover   = function() { renderRHTurnover(); };
window._rhRenderPromocoes  = function() { renderRHPromocoes(); };

// ─── Renders "In" — para Admin e Boss (alias pages) ──
// Renderiza no elemento de ID arbitrário, clonando o conteúdo do render original
window._rhRenderDashboardIn = function(targetId, readOnly) {
  // Renderiza diretamente no container alvo
  renderRHDashboard(targetId);
  const dst = document.getElementById(targetId);
  if (dst) {
    // Aviso visual de somente leitura para boss
    if (readOnly) {
      const banner = document.createElement('div');
      banner.style.cssText = 'background:linear-gradient(135deg,#1e3a5f,#1e40af);color:white;padding:10px 16px;border-radius:10px;margin-bottom:16px;font-size:13px;display:flex;align-items:center;gap:10px';
      banner.innerHTML = '<i class="fas fa-eye" style="font-size:16px"></i><span><strong>Visão do Diretor</strong> — Dados de RH consolidados (somente leitura)</span>';
      dst.insertBefore(banner, dst.firstChild);
    }
  }
};

window._rhRenderEmployeesIn = function(targetId, readOnly) {
  // Renderiza diretamente no container alvo com prefixo de IDs único
  // readOnly é tratado pelo showAdd flag dentro de renderRHEmployeesTable
  renderRHEmployeesTable(targetId);
};

window._rhRenderTurnoverIn = function(targetId, readOnly) {
  renderRHTurnover(targetId);
  const dst = document.getElementById(targetId);
  if (dst) {
    if (readOnly) {
      const banner = document.createElement('div');
      banner.style.cssText = 'background:linear-gradient(135deg,#1e3a5f,#1e40af);color:white;padding:10px 16px;border-radius:10px;margin-bottom:16px;font-size:13px;display:flex;align-items:center;gap:10px';
      banner.innerHTML = '<i class="fas fa-eye" style="font-size:16px"></i><span><strong>Visão do Diretor</strong> — Dados de Turnover &amp; Rotatividade (somente leitura)</span>';
      dst.insertBefore(banner, dst.firstChild);
    }
  }
};

// ─── Notificações RH (Promoções Homologadas) ─
// Dados de demonstração pré-carregados para mostrar o fluxo
const _DEMO_PROMOS = [
  {
    id: 'rhn-demo-001',
    employeeId: 'demo-emp-001',
    employeeName: 'Renato Silva Domingues',
    fromRole: 'Operador de Calandra 2',
    toRole: 'Operador de Calandra 3',
    supervisor: 'Renato Domingues',
    approvedBy: 'Carlos',
    approvedAt: '2026-02-15',
    score: 87,
    stars: 4,
    justification: 'Colaborador demonstrou domínio completo das operações de nível 2 e está plenamente apto para assumir responsabilidades de nível 3.',
    strengths: 'Excelente postura operacional, referência técnica para a equipe, pontualidade e comprometimento exemplares.',
    improvements: 'Desenvolver habilidades de liderança para eventual progressão à supervisão.',
    feedback: 'Aprovação recomendada. Carlos demonstra maturidade técnica e comportamental para a promoção. Histórico consistente de 907 dias na empresa.',
    status: 'pendente',
    criadoEm: '2026-02-15T10:30:00.000Z'
  },
  {
    id: 'rhn-demo-002',
    employeeId: 'demo-emp-002',
    employeeName: 'Higor dos Santos Palmeira Brandão',
    fromRole: 'Impressor Digital 1',
    toRole: 'Impressor Digital 2',
    supervisor: 'Rogério de Andrade Quadros',
    approvedBy: 'Carlos',
    approvedAt: '2026-01-20',
    score: 92,
    stars: 5,
    justification: 'Excelente desempenho em todas as categorias de avaliação. Colaborador superou as expectativas do período de avaliação.',
    strengths: 'Domínio técnico excepcional, qualidade de impressão acima do padrão, proatividade na resolução de problemas, colaboração com equipe.',
    improvements: 'Continuar desenvolvimento em manutenção preventiva de equipamentos.',
    feedback: 'Promoção aprovada com distinção. Colaborador é referência no setor e merece reconhecimento imediato. Sugiro aceleração da próxima avaliação em 6 meses.',
    status: 'homologado',
    obsRH: 'Carta aditiva emitida em 22/01/2026. Novo salário a partir de 01/02/2026. Comunicado enviado ao supervisor e ao colaborador.',
    homologadoEm: '2026-01-22T14:20:00.000Z',
    homologadoPor: 'RH',
    criadoEm: '2026-01-20T09:00:00.000Z'
  },
  {
    id: 'rhn-demo-003',
    employeeId: 'demo-emp-003',
    employeeName: 'Felipe Siqueira de Lima',
    fromRole: 'Revisor 1',
    toRole: 'Revisor 2',
    supervisor: 'Renato Domingues',
    approvedBy: 'Carlos',
    approvedAt: '2025-12-10',
    score: 78,
    stars: 4,
    justification: 'Colaborador atingiu tempo mínimo no cargo e apresentou desempenho satisfatório nas competências avaliadas.',
    strengths: 'Comprometimento, atenção à qualidade, boa relação com equipe.',
    improvements: 'Aprimorar velocidade de revisão e domínio de equipamentos específicos.',
    feedback: 'Aprovado. Bom colaborador com potencial de crescimento. Recomendo acompanhamento trimestral.',
    status: 'homologado',
    obsRH: 'Promoção formalizada em 12/12/2025. Documentação arquivada no prontuário.',
    homologadoEm: '2025-12-12T11:00:00.000Z',
    homologadoPor: 'RH',
    criadoEm: '2025-12-10T08:30:00.000Z'
  }
];

if (!window._rhNotificacoesInited) {
  window._rhNotificacoes = _DEMO_PROMOS;
  window._rhNotificacoesInited = true;
}
window._rhNotificacoes = window._rhNotificacoes || [];

window.createRHNotificacao = function(data) {
  const notif = {
    id: 'rhn-' + Date.now() + '-' + Math.random().toString(36).slice(2,6),
    ...data,
    criadoEm: new Date().toISOString()
  };
  window._rhNotificacoes.unshift(notif);
  // Persiste no Firebase se disponível
  if (window._cache) window._cache.rhNotificacoes = window._rhNotificacoes;
  updateRHPromosBadge();
  console.log('[RH] Nova promoção homologada:', notif.employeeName);
};

window.getRHNotificacoes = function() {
  return window._rhNotificacoes || [];
};

// Alias local para uso interno (sem window.)
function getRHNotificacoes() {
  return window._rhNotificacoes || [];
}

function updateRHPromosBadge() {
  const pending = window._rhNotificacoes.filter(n => n.status === 'pendente').length;
  const badge = document.getElementById('badge-rh-promo');
  if (badge) {
    badge.textContent = pending > 0 ? pending : '';
    badge.style.display = pending > 0 ? 'inline-flex' : 'none';
  }
}

// Adiciona RH ao refreshCurrentPage
const _origRefreshPage = window.refreshCurrentPage;
window.refreshCurrentPage = function() {
  const p = window.currentPage;
  if (p === 'rh-dashboard') renderRHDashboard();
  else if (p === 'rh-employees') renderRHEmployeesTable();
  else if (p === 'rh-turnover') renderRHTurnover();
  else if (p === 'rh-promocoes') renderRHPromocoes();
  else if (p === 'rh-holerites') window._rhRenderHolerites && window._rhRenderHolerites('page-rh-holerites');
  else if (p === 'admin-rh-dashboard') window._rhRenderDashboardIn('page-admin-rh-dashboard');
  else if (p === 'admin-rh-employees') window._rhRenderEmployeesIn('page-admin-rh-employees');
  else if (p === 'admin-rh-turnover')  window._rhRenderTurnoverIn('page-admin-rh-turnover');
  else if (p === 'admin-rh-holerites') window._rhRenderHolerites && window._rhRenderHolerites('page-admin-rh-holerites');
  else if (p === 'boss-rh-dashboard')  window._rhRenderDashboardIn('page-boss-rh-dashboard', true);
  else if (p === 'boss-rh-turnover')   window._rhRenderTurnoverIn('page-boss-rh-turnover', true);
  else if (_origRefreshPage) _origRefreshPage();
};

// ─── HELPERS ────────────────────────────────
function hrCalcTenure(admStr, demStr) {
  if (!admStr || admStr === '') return 0;          // admissão vazia → 0
  const adm = new Date(admStr);
  if (isNaN(adm.getTime())) return 0;              // data inválida → 0
  const end = (demStr && demStr !== '') ? new Date(demStr) : new Date();
  if (isNaN(end.getTime())) return 0;
  return Math.max(0, Math.round((end - adm) / (1000 * 60 * 60 * 24 * 30.44)));
}

function hrFormatDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function hrCalcAge(birthStr) {
  if (!birthStr) return null;
  const now = new Date(), b = new Date(birthStr);
  return Math.floor((now - b) / (1000 * 60 * 60 * 24 * 365.25));
}

function hrGetYear(dateStr) {
  if (!dateStr) return null;
  return parseInt(dateStr.split('-')[0]);
}
function hrGetMonth(dateStr) {
  if (!dateStr) return null;
  return parseInt(dateStr.split('-')[1]);
}
function hrGetYearMonth(dateStr) {
  if (!dateStr) return null;
  const p = dateStr.split('-');
  return `${p[0]}-${p[1]}`;
}

const MONTH_NAMES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

function hrMonthLabel(ym) {
  if (!ym) return '';
  const [y, m] = ym.split('-');
  return `${MONTH_NAMES[parseInt(m)-1]}/${y.slice(2)}`;
}

// ─── FIRESTORE INTEGRATION ──────────────────
// Persiste hrEmployees no Firebase se disponível
window.persistHRCollection = async function(name, arr) {
  if (!window._dbReady || !window._firestoreDB) return;
  try {
    // Usa a mesma função de persistência do firebase-db.js
    if (window._persistCollection) {
      await window._persistCollection(name, arr);
    }
  } catch(e) {
    console.warn('[RH] Erro ao salvar no Firebase:', e.message);
  }
};

// ─── SEED RH DATA: carrega do Firebase ou do seed ─
window.initHRModule = async function() {
  // Tenta carregar do Firebase se disponível
  if (window._dbReady && window._loadCollection) {
    try {
      const hrEmps = await window._loadCollection('hrEmployees');
      if (hrEmps && hrEmps.length > 0) {
        window._cache.hrEmployees = hrEmps;
        console.log(`✅ RH: ${hrEmps.length} funcionários carregados do Firebase.`);
        return;
      }
    } catch(e) { /* usa seed */ }
  }
  // Usa seed local
  if (!window._cache) window._cache = {};
  window._cache.hrEmployees = window.HR_EMPLOYEES_SEED || [];
  console.log(`✅ RH: ${window._cache.hrEmployees.length} funcionários carregados do seed.`);
};

// ─── RENDER DASHBOARD RH (INTERATIVO POR ANO) ─────────────────────
function renderRHDashboard(targetIdParam) {
  updateRHPromosBadge();
  const _pfx = targetIdParam ? targetIdParam.replace('page-','').replace(/-/g,'_') + '_' : '';
  const el = document.getElementById(targetIdParam || 'page-rh-dashboard');
  if (!el) return;

  const all  = getHREmployees();
  const thisYear = new Date().getFullYear();
  const years = [...new Set(all.map(e => hrGetYear(e.admissao)).filter(Boolean))].sort();

  // Renderiza com o ano selecionado (null = todos)
  function _buildDashboard(selectedYear) {
    const filtAll  = selectedYear ? all.filter(e => hrGetYear(e.admissao) === selectedYear || (e.demissao && hrGetYear(e.demissao) === selectedYear) || (!e.demissao && hrGetYear(e.admissao) <= selectedYear)) : all;
    // Para KPIs globais sempre usamos 'all'
    const ativ = all.filter(e => e.situacao === 'ATIVO' || e.situacao === 'FÉRIAS');
    const dem  = all.filter(e => e.situacao === 'DESLIGADO');

    // KPIs gerais (invariáveis)
    const totalHistorico  = all.length;
    const totalAtivos     = ativ.length;
    const totalDesligados = dem.length;
    const turnoverRate    = totalHistorico > 0 ? ((totalDesligados / totalHistorico)*100).toFixed(1) : '0.0';
    // Só considera desligados que têm admissão e demissão válidas
    const demComDatas = dem.filter(e => e.admissao && e.admissao !== '' && e.demissao && e.demissao !== '');
    const avgTenure = demComDatas.length > 0
      ? Math.round(demComDatas.reduce((acc,e) => acc + hrCalcTenure(e.admissao, e.demissao), 0) / demComDatas.length) : 0;
    const avgTenureSafe = isNaN(avgTenure) ? 0 : avgTenure;
    const avgTenureText = avgTenureSafe >= 12
      ? `${Math.floor(avgTenureSafe/12)}a ${avgTenureSafe%12}m`
      : `${avgTenureSafe}m`;

    // KPIs do ano selecionado (ou ano atual)
    const yr = selectedYear || thisYear;
    const admYr = all.filter(e => hrGetYear(e.admissao) === yr).length;
    const demYr = dem.filter(e => e.demissao && hrGetYear(e.demissao) === yr).length;
    const demRatio = admYr > 0 && demYr > 0 ? (demYr/admYr*100).toFixed(0)+'%' : '—';

    // Listas filtradas pelo ano selecionado
    const recentAdm = selectedYear
      ? all.filter(e => hrGetYear(e.admissao) === selectedYear).sort((a,b)=>b.admissao.localeCompare(a.admissao)).slice(0,6)
      : all.filter(e=>e.admissao).sort((a,b)=>b.admissao.localeCompare(a.admissao)).slice(0,6);

    const recentDem = selectedYear
      ? dem.filter(e => e.demissao && hrGetYear(e.demissao) === selectedYear).sort((a,b)=>b.demissao.localeCompare(a.demissao)).slice(0,6)
      : dem.filter(e=>e.demissao).sort((a,b)=>b.demissao.localeCompare(a.demissao)).slice(0,6);

    const yearLabel = selectedYear ? `em ${selectedYear}` : `em ${thisYear}`;
    const isFiltered = !!selectedYear;

    // Promoções
    const pendPromos  = window._rhNotificacoes ? window._rhNotificacoes.filter(n=>n.status==='pendente').length : 0;
    const totalPromos = window._rhNotificacoes ? window._rhNotificacoes.length : 0;

    el.innerHTML = `
      <div class="page-header" style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px">
        <div>
          <h2><i class="fas fa-heartbeat"></i> Dashboard de RH</h2>
          <span class="page-sub">Visão geral de turnover e movimentação de pessoal</span>
        </div>
        ${isFiltered ? `<button onclick="window._rhDashFilterYear(null,'${_pfx}')" style="background:#f87171;color:white;border:none;border-radius:8px;padding:8px 16px;font-size:13px;cursor:pointer;font-weight:600;display:flex;align-items:center;gap:6px"><i class="fas fa-times-circle"></i> Limpar Filtro ${selectedYear}</button>` : ''}
      </div>

      <!-- Filtro por Ano -->
      <div class="rh-year-filter-bar" id="${_pfx}year-filter-bar">
        <span class="rh-year-filter-label"><i class="fas fa-filter"></i> Filtrar por Ano:</span>
        ${years.map(y => `
          <button class="rh-year-btn ${selectedYear===y?'rh-year-btn-active':''}" onclick="window._rhDashFilterYear(${y},'${_pfx}')">${y}</button>
        `).join('')}
        <button class="rh-year-btn ${!selectedYear?'rh-year-btn-active':''}" onclick="window._rhDashFilterYear(null,'${_pfx}')">Todos</button>
      </div>

      <!-- KPIs Globais -->
      <div class="cards-grid" style="margin-top:12px">
        <div class="stat-card blue">
          <div class="stat-icon"><i class="fas fa-users"></i></div>
          <div class="stat-info">
            <span class="stat-value">${totalAtivos}</span>
            <span class="stat-label">Colaboradores Ativos</span>
          </div>
        </div>
        <div class="stat-card red">
          <div class="stat-icon"><i class="fas fa-user-minus"></i></div>
          <div class="stat-info">
            <span class="stat-value">${totalDesligados}</span>
            <span class="stat-label">Total Desligados (histórico)</span>
          </div>
        </div>
        <div class="stat-card orange">
          <div class="stat-icon"><i class="fas fa-percentage"></i></div>
          <div class="stat-info">
            <span class="stat-value">${turnoverRate}%</span>
            <span class="stat-label">Taxa de Turnover Geral</span>
          </div>
        </div>
        <div class="stat-card green">
          <div class="stat-icon"><i class="fas fa-clock"></i></div>
          <div class="stat-info">
            <span class="stat-value">${avgTenureText}</span>
            <span class="stat-label">Tempo Médio Permanência</span>
          </div>
        </div>
      </div>

      <!-- KPIs do Ano Selecionado -->
      <div class="cards-grid" style="margin-top:0" id="${_pfx}kpi-year-row">
        <div class="stat-card rh-kpi-year-card">
          <div class="stat-icon"><i class="fas fa-user-plus" style="color:#4ade80"></i></div>
          <div class="stat-info">
            <span class="stat-value" style="color:#4ade80">${admYr}</span>
            <span class="stat-label">Admissões ${yearLabel}</span>
          </div>
        </div>
        <div class="stat-card rh-kpi-year-card">
          <div class="stat-icon"><i class="fas fa-user-times" style="color:#f87171"></i></div>
          <div class="stat-info">
            <span class="stat-value" style="color:#f87171">${demYr}</span>
            <span class="stat-label">Desligamentos ${yearLabel}</span>
          </div>
        </div>
        <div class="stat-card rh-kpi-year-card">
          <div class="stat-icon"><i class="fas fa-database" style="color:#60a5fa"></i></div>
          <div class="stat-info">
            <span class="stat-value" style="color:#60a5fa">${totalHistorico}</span>
            <span class="stat-label">Total no Histórico</span>
          </div>
        </div>
        <div class="stat-card rh-kpi-year-card">
          <div class="stat-icon"><i class="fas fa-balance-scale" style="color:#fbbf24"></i></div>
          <div class="stat-info">
            <span class="stat-value" style="color:#fbbf24">${demRatio}</span>
            <span class="stat-label">Relação Dem/Adm ${yearLabel}</span>
          </div>
        </div>
      </div>

      <!-- Gráficos principais -->
      <div class="dashboard-row dashboard-row-charts" style="margin-top:20px">
        <div class="chart-card">
          <div class="chart-card-header">
            <div>
              <h3><i class="fas fa-chart-bar"></i> Admissões vs Desligamentos por Ano</h3>
              <span class="chart-sub">Clique em um ano para filtrar o dashboard</span>
            </div>
          </div>
          <div style="height:260px;position:relative">
            <canvas id="${_pfx}chart-hr-adm-dem"></canvas>
          </div>
        </div>
        <div class="chart-card">
          <div class="chart-card-header">
            <div>
              <h3><i class="fas fa-building"></i> Distribuição por Setor</h3>
              <span class="chart-sub">${isFiltered ? `Ativos — filtro: ${selectedYear}` : 'Todos os colaboradores'}</span>
            </div>
          </div>
          <div style="height:260px;position:relative">
            <canvas id="${_pfx}chart-hr-pie"></canvas>
          </div>
        </div>
      </div>

      <div class="dashboard-row" style="margin-top:20px">
        <div class="chart-card">
          <div class="chart-card-header">
            <div>
              <h3><i class="fas fa-sync-alt"></i> Taxa de Turnover Mensal (Últimos 12 meses)</h3>
              <span class="chart-sub">% de desligamentos em relação ao quadro do mês</span>
            </div>
          </div>
          <div style="height:220px;position:relative">
            <canvas id="${_pfx}chart-hr-turn-monthly"></canvas>
          </div>
        </div>
        <div class="chart-card">
          <div class="chart-card-header">
            <div>
              <h3><i class="fas fa-birthday-cake"></i> Faixa Etária (Ativos)</h3>
              <span class="chart-sub">Distribuição de idades</span>
            </div>
          </div>
          <div style="height:220px;position:relative">
            <canvas id="${_pfx}chart-hr-age"></canvas>
          </div>
        </div>
      </div>

      <!-- Permanência -->
      <div class="chart-card" style="margin-top:20px">
        <div class="chart-card-header">
          <div>
            <h3><i class="fas fa-hourglass-half"></i> Tempo de Permanência dos Desligados</h3>
            <span class="chart-sub">${isFiltered ? `Desligados em ${selectedYear}` : 'Agrupado por faixa de meses'}</span>
          </div>
        </div>
        <div style="height:200px;position:relative">
          <canvas id="${_pfx}chart-hr-tenure"></canvas>
        </div>
      </div>

      <!-- KPI Promoções -->
      ${pendPromos > 0 ? `
      <div class="chart-card" style="margin-top:20px;border-left:4px solid #f59e0b;background:linear-gradient(135deg,#fffbeb,#fef3c7)">
        <div style="display:flex;align-items:center;gap:16px;padding:4px 0">
          <div style="width:56px;height:56px;border-radius:50%;background:#f59e0b;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:700;color:white;flex-shrink:0">${pendPromos}</div>
          <div style="flex:1">
            <div style="font-size:18px;font-weight:700;color:#92400e">Promoção${pendPromos>1?'ões':''} aguardando homologação</div>
            <div style="font-size:13px;color:#b45309;margin-top:4px">Aprovada${pendPromos>1?'s':''} pelo Diretor Carlos — ação RH necessária</div>
          </div>
          <button class="btn-primary" onclick="navigateTo('rh-promocoes')" style="background:#f59e0b;flex-shrink:0">
            <i class="fas fa-envelope-open-text"></i> Ver Promoções
          </button>
        </div>
      </div>` : totalPromos > 0 ? `
      <div class="chart-card" style="margin-top:20px;border-left:4px solid #4ade80;background:linear-gradient(135deg,#f0fdf4,#dcfce7)">
        <div style="display:flex;align-items:center;gap:16px;padding:4px 0">
          <div style="width:56px;height:56px;border-radius:50%;background:#16a34a;display:flex;align-items:center;justify-content:center;font-size:20px;color:white;flex-shrink:0"><i class="fas fa-check-double"></i></div>
          <div style="flex:1">
            <div style="font-size:16px;font-weight:700;color:#14532d">Todas as promoções homologadas</div>
            <div style="font-size:13px;color:#166534;margin-top:4px">${totalPromos} promoção${totalPromos!==1?'ões':''} registrada${totalPromos!==1?'s':''} no histórico</div>
          </div>
          <button class="btn-outline" onclick="navigateTo('rh-promocoes')" style="border-color:#16a34a;color:#16a34a;flex-shrink:0">
            <i class="fas fa-history"></i> Ver Histórico
          </button>
        </div>
      </div>` : ''}

      <!-- Últimas movimentações (filtradas) -->
      <div class="dashboard-row" style="margin-top:20px" id="${_pfx}recent-moves">
        <div class="recent-card" style="flex:1">
          <h3><i class="fas fa-user-plus" style="color:#4ade80"></i> ${isFiltered ? `Admissões em ${selectedYear}` : 'Últimas Admissões'}</h3>
          <div class="recent-list">
            ${recentAdm.length === 0 ? `<div style="text-align:center;padding:24px;color:#aaa;font-size:13px"><i class="fas fa-inbox" style="font-size:24px;display:block;margin-bottom:8px"></i>Nenhuma admissão ${isFiltered?'em '+selectedYear:''}</div>` :
            recentAdm.map(e=>`
              <div class="recent-item">
                <div class="recent-avatar" style="background:#1e3a5f">${e.nome.split(' ').slice(0,2).map(n=>n[0]).join('').toUpperCase()}</div>
                <div class="recent-info">
                  <div class="recent-name">${e.nome}</div>
                  <div class="recent-meta">${e.cargo} · ${e.matriz === 'NT' ? 'Lumini' : (e.matriz || 'Lumini')} · ${hrFormatDate(e.admissao)}</div>
                </div>
                <span class="status-badge ${e.situacao==='ATIVO'||e.situacao==='FÉRIAS'?'status-approved':'status-period'}">${e.situacao}</span>
              </div>`).join('')}
          </div>
        </div>
        <div class="recent-card" style="flex:1">
          <h3><i class="fas fa-user-minus" style="color:#f87171"></i> ${isFiltered ? `Desligamentos em ${selectedYear}` : 'Últimos Desligamentos'}</h3>
          <div class="recent-list">
            ${recentDem.length === 0 ? `<div style="text-align:center;padding:24px;color:#aaa;font-size:13px"><i class="fas fa-inbox" style="font-size:24px;display:block;margin-bottom:8px"></i>Nenhum desligamento ${isFiltered?'em '+selectedYear:''}</div>` :
            recentDem.map(e=>`
              <div class="recent-item">
                <div class="recent-avatar" style="background:#3d1515">${e.nome.split(' ').slice(0,2).map(n=>n[0]).join('').toUpperCase()}</div>
                <div class="recent-info">
                  <div class="recent-name">${e.nome}</div>
                  <div class="recent-meta">${e.cargo} · ${e.matriz === 'NT' ? 'Lumini' : (e.matriz || 'Lumini')} · ${hrFormatDate(e.demissao)}</div>
                </div>
                <span class="status-badge status-period">${hrCalcTenure(e.admissao,e.demissao)} meses</span>
              </div>`).join('')}
          </div>
        </div>
      </div>
    `;

    // Gráficos após DOM
    const demForCharts = selectedYear
      ? dem.filter(e => e.demissao && hrGetYear(e.demissao) === selectedYear)
      : dem;

    setTimeout(() => {
      renderHRChartAdmDem(all, _pfx, selectedYear);
      renderHRChartPieSetor(all, _pfx, selectedYear);
      renderHRChartTurnMonthly(all, _pfx);
      renderHRChartAge(ativ, _pfx);
      renderHRChartTenure(demForCharts, _pfx);
    }, 50);
  }

  // Expor função de filtro globalmente para onclick
  window._rhDashFilterYear = function(year, pfx) {
    if (pfx !== _pfx) return; // só responde ao container certo
    _buildDashboard(year || null);
  };

  _buildDashboard(null);
}

// ─── GRÁFICO: Admissões vs Desligamentos por Ano (Clicável) ─
function renderHRChartAdmDem(all, _pfx, selectedYear) {
  const pfx = _pfx || '';
  const canvas = document.getElementById(pfx+'chart-hr-adm-dem');
  if (!canvas) return;
  if (chartHRAdmDemiss) { chartHRAdmDemiss.destroy(); chartHRAdmDemiss = null; }

  const years = [...new Set(all.map(e => hrGetYear(e.admissao)).filter(Boolean))].sort();
  const adm = years.map(y => all.filter(e => hrGetYear(e.admissao) === y).length);
  const dem = years.map(y => all.filter(e => e.demissao && hrGetYear(e.demissao) === y).length);

  // Destaque do ano selecionado
  const admColors = years.map(y => selectedYear === y ? 'rgba(74,222,128,1)' : 'rgba(74,222,128,0.5)');
  const demColors = years.map(y => selectedYear === y ? 'rgba(248,113,113,1)' : 'rgba(248,113,113,0.45)');

  chartHRAdmDemiss = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: years.map(String),
      datasets: [
        { label: 'Admissões',     data: adm, backgroundColor: admColors, borderColor: '#4ade80', borderWidth: 1, borderRadius: 4 },
        { label: 'Desligamentos', data: dem, backgroundColor: demColors, borderColor: '#f87171', borderWidth: 1, borderRadius: 4 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      onClick: (evt, elements) => {
        if (elements.length > 0) {
          const idx = elements[0].index;
          const clickedYear = years[idx];
          const currentFilter = selectedYear === clickedYear ? null : clickedYear;
          if (window._rhDashFilterYear) window._rhDashFilterYear(currentFilter, pfx);
        }
      },
      plugins: {
        legend: { labels: { color: '#ccc', font: { size: 11 } } },
        tooltip: { callbacks: { title: items => `Ano ${items[0].label} — clique para filtrar` } }
      },
      scales: {
        x: { ticks: { color: '#aaa' }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { ticks: { color: '#aaa' }, grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true }
      },
      cursor: 'pointer'
    }
  });

  // Cursor pointer no canvas
  canvas.style.cursor = 'pointer';
}

// ─── GRÁFICO: Pizza por SETOR (campo setor) ──────
function renderHRChartPieSetor(all, _pfx, selectedYear) {
  const pfx = _pfx || '';
  const canvas = document.getElementById(pfx+'chart-hr-pie');
  if (!canvas) return;
  if (chartHRPie) { chartHRPie.destroy(); chartHRPie = null; }

  // Filtra pelo ano se selecionado, senão usa todos
  const base = selectedYear
    ? all.filter(e => hrGetYear(e.admissao) === selectedYear || (e.demissao && hrGetYear(e.demissao) === selectedYear))
    : all;

  // Agrupa por setor (campo setor ou derivado do cargo)
  const SETORES_ORDER = ['Produção','Expedição','Designer','Vendas','Administrativo','Facilities'];
  const setorCount = {};
  base.forEach(e => {
    const s = e.setor || (window._getSetorFromCargo ? window._getSetorFromCargo(e.cargo) : (e.matriz || 'Outros'));
    setorCount[s] = (setorCount[s] || 0) + 1;
  });

  // Ordena respeitando a ordem canônica, resto ao final
  const allKeys = [...new Set([...SETORES_ORDER, ...Object.keys(setorCount)])].filter(k => setorCount[k]);
  const sorted = allKeys.map(k => [k, setorCount[k] || 0]).filter(([,v]) => v > 0);
  sorted.sort((a,b) => {
    const ai = SETORES_ORDER.indexOf(a[0]);
    const bi = SETORES_ORDER.indexOf(b[0]);
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1;
    if (bi >= 0) return 1;
    return b[1] - a[1];
  });
  const labels = sorted.map(s => s[0]);
  const data   = sorted.map(s => s[1]);

  // Cores por setor (legíveis e distintas)
  const SETOR_COLORS = {
    'Produção':      '#4361ee',
    'Expedição':     '#06d6a0',
    'Designer':      '#a78bfa',
    'Vendas':        '#fbbf24',
    'Administrativo':'#9ca3af',
    'Facilities':    '#f87171',
    'Outros':        '#c9b8ff'
  };
  const colors = labels.map(l => SETOR_COLORS[l] || '#a78bfa');

  // Totais para porcentagem
  const total = data.reduce((a,b) => a+b, 0);

  chartHRPie = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: '#1a1a2e', hoverOffset: 8 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: '60%',
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: '#ccc', font: { size: 12, weight: '600' }, padding: 12,
            generateLabels: chart => {
              const ds = chart.data.datasets[0];
              return chart.data.labels.map((lbl, i) => ({
                text: `${lbl}  (${ds.data[i]} · ${total > 0 ? ((ds.data[i]/total)*100).toFixed(1) : 0}%)`,
                fillStyle: ds.backgroundColor[i],
                strokeStyle: ds.backgroundColor[i],
                lineWidth: 0,
                index: i
              }));
            }
          }
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${ctx.raw} colaboradores (${total > 0 ? ((ctx.raw/total)*100).toFixed(1) : 0}%)`
          }
        }
      }
    }
  });
}

// Mantém compatibilidade com chamadas antigas
function renderHRChartPie(ativos, _pfx) {
  renderHRChartPieSetor(ativos, _pfx, null);
}

// ─── GRÁFICO: Turnover Mensal (últimos 12 meses) ─
function renderHRChartTurnMonthly(all, _pfx) {
  const pfx = _pfx || '';
  const canvas = document.getElementById(pfx+'chart-hr-turn-monthly');
  if (!canvas) return;
  if (chartHRTurnMonthly) { chartHRTurnMonthly.destroy(); chartHRTurnMonthly = null; }

  const now = new Date();
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
  }

  const rates = months.map(ym => {
    const [y, m] = ym.split('-').map(Number);
    const periStart = new Date(y, m-1, 1);
    const periEnd   = new Date(y, m, 0); // último dia do mês

    // quadro ativo no início do mês
    const ativo = all.filter(e => {
      const adm = new Date(e.admissao);
      const dem = e.demissao ? new Date(e.demissao) : new Date('2099-01-01');
      return adm <= periStart && dem >= periStart;
    }).length;

    const deslig = all.filter(e => {
      if (!e.demissao) return false;
      const d = new Date(e.demissao);
      return d >= periStart && d <= periEnd;
    }).length;

    return ativo > 0 ? parseFloat((deslig / ativo * 100).toFixed(1)) : 0;
  });

  chartHRTurnMonthly = new Chart(canvas, {
    type: 'line',
    data: {
      labels: months.map(hrMonthLabel),
      datasets: [{
        label: 'Turnover %', data: rates,
        borderColor: '#f72585', backgroundColor: 'rgba(247,37,133,0.12)',
        fill: true, tension: 0.4, pointRadius: 4, pointBackgroundColor: '#f72585'
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#ccc', font: { size: 11 } } } },
      scales: {
        x: { ticks: { color: '#aaa', font:{size:10} }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { ticks: { color: '#aaa', callback: v => v+'%' }, grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true }
      }
    }
  });
}

// ─── GRÁFICO: Faixa Etária ──────────────────
function renderHRChartAge(ativos, _pfx) {
  const pfx = _pfx || '';
  const canvas = document.getElementById(pfx+'chart-hr-age');
  if (!canvas) return;
  if (chartHRAge) { chartHRAge.destroy(); chartHRAge = null; }

  const faixas = { '18-22':0, '23-27':0, '28-32':0, '33-37':0, '38-42':0, '43+':0 };
  ativos.forEach(e => {
    const age = hrCalcAge(e.nascimento);
    if (!age) return;
    if (age <= 22) faixas['18-22']++;
    else if (age <= 27) faixas['23-27']++;
    else if (age <= 32) faixas['28-32']++;
    else if (age <= 37) faixas['33-37']++;
    else if (age <= 42) faixas['38-42']++;
    else faixas['43+']++;
  });

  chartHRAge = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: Object.keys(faixas),
      datasets: [{ label: 'Colaboradores', data: Object.values(faixas), backgroundColor: '#4361ee', borderRadius: 6 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#aaa' }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { ticks: { color: '#aaa' }, grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true }
      }
    }
  });
}

// ─── GRÁFICO: Tempo de Permanência ──────────
function renderHRChartTenure(desligados, _pfx) {
  const pfx = _pfx || '';
  const canvas = document.getElementById(pfx+'chart-hr-tenure');
  if (!canvas) return;
  if (chartHRTurnover) { chartHRTurnover.destroy(); chartHRTurnover = null; }

  const faixas = { '< 3 meses':0, '3-6 meses':0, '6-12 meses':0, '1-2 anos':0, '> 2 anos':0 };
  desligados.forEach(e => {
    const t = hrCalcTenure(e.admissao, e.demissao);
    if (t < 3)   faixas['< 3 meses']++;
    else if (t < 6)  faixas['3-6 meses']++;
    else if (t < 12) faixas['6-12 meses']++;
    else if (t < 24) faixas['1-2 anos']++;
    else             faixas['> 2 anos']++;
  });

  chartHRTurnover = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: Object.keys(faixas),
      datasets: [{ label: 'Desligados', data: Object.values(faixas), backgroundColor: ['#f87171','#fbbf24','#fb923c','#60a5fa','#4ade80'], borderRadius: 6 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#aaa' }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { ticks: { color: '#aaa' }, grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true }
      }
    }
  });
}

// ─── RENDER TABELA FUNCIONÁRIOS RH ──────────
let _rhEmpPage = 1;
const _rhEmpPageSize = 20;
let _rhEmpFilter = { search: '', situacao: 'TODOS', setor: '', cargo: '', lider: '' };

function renderRHEmployeesTable(targetIdParam) {
  // Define prefix para IDs únicos quando usado como alias
  const _epfx = targetIdParam && targetIdParam !== 'page-rh-employees'
    ? targetIdParam.replace('page-','').replace(/-/g,'_') + '_' : '';
  const el = document.getElementById(targetIdParam || 'page-rh-employees');
  if (!el) return;

  const all    = getHREmployees();
  const cargos = [...new Set(all.map(e=>e.cargo).filter(Boolean))].sort();
  const lideres= [...new Set(all.map(e=>e.lider).filter(Boolean))].sort();
  const setores = ['Produção','Expedição','Designer','Vendas','Administrativo','Facilities'];
  const showAdd = !_epfx; // Só mostra botão Adicionar na view RH original

  el.innerHTML = `
    <div class="page-header">
      <h2><i class="fas fa-id-card"></i> Cadastro de Colaboradores (RH)</h2>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn-outline" onclick="exportRHCSV()"><i class="fas fa-file-csv"></i> Exportar CSV</button>
        ${showAdd ? `<button class="btn-primary" onclick="openRHAddEmployee()"><i class="fas fa-plus"></i> Novo Colaborador</button>` : ''}
      </div>
    </div>

    <!-- Filtros -->
    <div class="rh-filter-bar">
      <div class="search-bar" style="flex:2;min-width:200px">
        <i class="fas fa-search"></i>
        <input type="text" id="${_epfx}rh-search" placeholder="Buscar por nome, matrícula, cargo, setor..." oninput="rhApplyFilter('${_epfx}')" value="${_rhEmpFilter.search}" />
      </div>
      <select id="${_epfx}rh-fil-situacao" class="rh-select" onchange="rhApplyFilter('${_epfx}')">
        <option value="TODOS" ${_rhEmpFilter.situacao==='TODOS'?'selected':''}>Todos</option>
        <option value="ATIVO" ${_rhEmpFilter.situacao==='ATIVO'?'selected':''}>Ativos</option>
        <option value="DESLIGADO" ${_rhEmpFilter.situacao==='DESLIGADO'?'selected':''}>Desligados</option>
        <option value="FÉRIAS">Em Férias</option>
      </select>
      <select id="${_epfx}rh-fil-setor" class="rh-select" onchange="rhApplyFilter('${_epfx}')">
        <option value="">Todos os Setores</option>
        ${setores.map(s=>`<option value="${s}" ${_rhEmpFilter.setor===s?'selected':''}>${s}</option>`).join('')}
      </select>
      <select id="${_epfx}rh-fil-cargo" class="rh-select" onchange="rhApplyFilter('${_epfx}')">
        <option value="">Todos os Cargos</option>
        ${cargos.map(c=>`<option value="${c}" ${_rhEmpFilter.cargo===c?'selected':''}>${c}</option>`).join('')}
      </select>
      <select id="${_epfx}rh-fil-lider" class="rh-select" onchange="rhApplyFilter('${_epfx}')">
        <option value="">Todos os Líderes</option>
        ${lideres.map(l=>`<option value="${l}" ${_rhEmpFilter.lider===l?'selected':''}>${l}</option>`).join('')}
      </select>
    </div>

    <!-- Tabela -->
    <div class="table-wrapper">
      <table class="data-table rh-table">
        <thead>
          <tr>
            <th>Mat.</th>
            <th>Colaborador</th>
            <th>Situação</th>
            <th>Setor</th>
            <th>Cargo</th>
            <th>Líder</th>
            <th>Admissão</th>
            <th>Demissão</th>
            <th>Tempo Casa</th>
            <th>Contato</th>
            ${showAdd ? `<th>Ações</th>` : ''}
          </tr>
        </thead>
        <tbody id="${_epfx}rh-employees-tbody"></tbody>
      </table>
    </div>
    <div class="rh-pagination" id="${_epfx}rh-pagination"></div>
  `;

  rhApplyFilter(_epfx);
}

window.rhApplyFilter = function(pfx) {
  const p = pfx || '';
  _rhEmpFilter.search   = (document.getElementById(p+'rh-search')?.value || '').toLowerCase();
  _rhEmpFilter.situacao = document.getElementById(p+'rh-fil-situacao')?.value || 'TODOS';
  _rhEmpFilter.setor    = document.getElementById(p+'rh-fil-setor')?.value || '';
  _rhEmpFilter.cargo    = document.getElementById(p+'rh-fil-cargo')?.value || '';
  _rhEmpFilter.lider    = document.getElementById(p+'rh-fil-lider')?.value || '';
  _rhEmpFilter._pfx = p;
  _rhEmpPage = 1;
  rhRenderTableBody(p);
};

function rhRenderTableBody(pfx) {
  const p = pfx !== undefined ? pfx : (_rhEmpFilter._pfx || '');
  const tbody = document.getElementById(p+'rh-employees-tbody');
  const pagEl = document.getElementById(p+'rh-pagination');
  if (!tbody) return;

  let data = getHREmployees();

  // Filtros
  if (_rhEmpFilter.situacao !== 'TODOS') data = data.filter(e => e.situacao === _rhEmpFilter.situacao);
  if (_rhEmpFilter.setor)  data = data.filter(e => (e.setor || window._getSetorFromCargo(e.cargo)) === _rhEmpFilter.setor);
  if (_rhEmpFilter.cargo)  data = data.filter(e => e.cargo === _rhEmpFilter.cargo);
  if (_rhEmpFilter.lider)  data = data.filter(e => e.lider === _rhEmpFilter.lider);
  if (_rhEmpFilter.search) {
    const q = _rhEmpFilter.search;
    data = data.filter(e =>
      e.nome.toLowerCase().includes(q) ||
      e.matricula.includes(q) ||
      e.cargo.toLowerCase().includes(q) ||
      (e.setor && e.setor.toLowerCase().includes(q)) ||
      (e.lider && e.lider.toLowerCase().includes(q))
    );
  }

  // Ordena: ATIVO primeiro, depois por nome
  data.sort((a,b) => {
    if (a.situacao !== b.situacao) return a.situacao === 'ATIVO' ? -1 : 1;
    return a.nome.localeCompare(b.nome);
  });

  const total = data.length;
  const pages = Math.ceil(total / _rhEmpPageSize);
  const start = (_rhEmpPage - 1) * _rhEmpPageSize;
  const page  = data.slice(start, start + _rhEmpPageSize);

  tbody.innerHTML = page.map(e => {
    const tenure = hrCalcTenure(e.admissao, e.demissao || null);
    const tenureText = tenure >= 12 ? `${Math.floor(tenure/12)}a ${tenure%12}m` : `${tenure}m`;
    const isSit = e.situacao === 'ATIVO';
    return `
      <tr>
        <td><span class="rh-matricula">${e.matricula}</span></td>
        <td>
          <div style="display:flex;align-items:center;gap:8px">
            <div class="rh-avatar" style="background:${isSit?'#1e3a5f':'#3d1515'}">${e.nome.split(' ').slice(0,2).map(n=>n[0]).join('').toUpperCase()}</div>
            <span style="font-weight:500">${e.nome}</span>
          </div>
        </td>
        <td><span class="status-badge ${isSit?'status-approved':'status-period'}">${e.situacao}</span></td>
        <td><span class="rh-setor-badge setor-${(e.setor||'outros').toLowerCase().replace(/[^a-z]/g,'')}">&#x25CF; ${e.setor || window._getSetorFromCargo(e.cargo)}</span></td>
        <td>${e.cargo}</td>
        <td>${e.lider || '—'}</td>
        <td>${hrFormatDate(e.admissao)}</td>
        <td>${hrFormatDate(e.demissao) || '—'}</td>
        <td>
          <span class="rh-tenure ${tenure < 6 ? 'tenure-low' : tenure > 24 ? 'tenure-high' : ''}">
            ${tenureText}
          </span>
        </td>
        <td><span class="rh-phone">${e.telefone || '—'}</span></td>
        ${!p ? `
        <td>
          <div style="display:flex;gap:4px">
            <button class="btn-icon" onclick="openRHEditEmployee('${e.matricula}')" title="Editar"><i class="fas fa-edit"></i></button>
            <button class="btn-icon btn-icon-red" onclick="rhDeleteEmployee('${e.matricula}')" title="Excluir"><i class="fas fa-trash"></i></button>
          </div>
        </td>` : ''}
      </tr>`;
  }).join('') || `<tr><td colspan="${p ? 10 : 11}" style="text-align:center;color:#888;padding:32px">Nenhum colaborador encontrado.</td></tr>`;

  // Paginação
  if (pagEl) {
    pagEl.innerHTML = `
      <div class="rh-pag-info">${total} colaboradores encontrados — Página ${_rhEmpPage} de ${Math.max(1,pages)}</div>
      <div class="rh-pag-btns">
        <button class="btn-outline btn-sm" onclick="rhChangePage(-1,'${p}')" ${_rhEmpPage<=1?'disabled':''}>‹ Anterior</button>
        <button class="btn-outline btn-sm" onclick="rhChangePage(1,'${p}')" ${_rhEmpPage>=pages?'disabled':''}>Próxima ›</button>
      </div>
    `;
  }
}

window.rhChangePage = function(dir, pfx) {
  _rhEmpPage = Math.max(1, _rhEmpPage + dir);
  rhRenderTableBody(pfx || _rhEmpFilter._pfx || '');
};

// ─── CRUD Funcionário RH ─────────────────────
window.openRHAddEmployee = function() {
  openRHEmployeeModal(null);
};

window.openRHEditEmployee = function(matricula) {
  const emp = getHREmployees().find(e => e.matricula === matricula);
  if (emp) openRHEmployeeModal(emp);
};

function openRHEmployeeModal(emp) {
  document.querySelector('.modal-overlay.rh-modal')?.remove();
  const isEdit = !!emp;
  const modal = document.createElement('div');
  modal.className = 'modal-overlay rh-modal';
  modal.innerHTML = `
    <div class="modal" style="max-width:640px;max-height:90vh;overflow-y:auto">
      <div class="modal-header">
        <h3><i class="fas fa-id-card"></i> ${isEdit ? 'Editar Colaborador' : 'Novo Colaborador'}</h3>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body">
        <div class="form-row">
          <div class="form-group">
            <label>Matrícula *</label>
            <input type="text" id="rh-emp-matricula" value="${emp?.matricula||''}" placeholder="Ex: 3005" ${isEdit?'readonly':''} />
          </div>
          <div class="form-group">
            <label>Situação *</label>
            <select id="rh-emp-situacao">
              <option value="ATIVO" ${emp?.situacao==='ATIVO'||!emp?'selected':''}>ATIVO</option>
              <option value="DESLIGADO" ${emp?.situacao==='DESLIGADO'?'selected':''}>DESLIGADO</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>Nome Completo *</label>
          <input type="text" id="rh-emp-nome" value="${emp?.nome||''}" placeholder="Nome completo" />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Setor *</label>
            <select id="rh-emp-setor">
              <option value="Produção" ${emp?.setor==='Produção'?'selected':''}>Produção</option>
              <option value="Expedição" ${emp?.setor==='Expedição'?'selected':''}>Expedição</option>
              <option value="Designer" ${emp?.setor==='Designer'?'selected':''}>Designer</option>
              <option value="Vendas" ${emp?.setor==='Vendas'?'selected':''}>Vendas</option>
              <option value="Administrativo" ${(emp?.setor==='Administrativo'||!emp?.setor)?'selected':''}>Administrativo</option>
              <option value="Facilities" ${emp?.setor==='Facilities'?'selected':''}>Facilities</option>
            </select>
          </div>
          <div class="form-group">
            <label>Cargo *</label>
            <input type="text" id="rh-emp-cargo" value="${emp?.cargo||''}" placeholder="Cargo atual" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Jornada</label>
            <select id="rh-emp-jornada">
              <option value="CLT" ${emp?.jornada==='CLT'||!emp?'selected':''}>CLT</option>
              <option value="PJ" ${emp?.jornada==='PJ'?'selected':''}>PJ</option>
              <option value="Temporário" ${emp?.jornada==='Temporário'?'selected':''}>Temporário</option>
              <option value="Estágio" ${emp?.jornada==='Estágio'?'selected':''}>Estágio</option>
            </select>
          </div>
          <div class="form-group">
            <!-- espaçador -->
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Matriz</label>
            <input type="text" id="rh-emp-matriz" value="${emp?.matriz||'NT-JX'}" placeholder="Ex: NT-JX" />
          </div>
          <div class="form-group">
            <label>Líder</label>
            <input type="text" id="rh-emp-lider" value="${emp?.lider||''}" placeholder="Nome do líder" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Data de Admissão *</label>
            <input type="date" id="rh-emp-admissao" value="${emp?.admissao||''}" />
          </div>
          <div class="form-group">
            <label>Data de Demissão</label>
            <input type="date" id="rh-emp-demissao" value="${emp?.demissao||''}" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Horário</label>
            <input type="text" id="rh-emp-horario" value="${emp?.horario||''}" placeholder="Ex: Seg à Sex 07:30 às 17:00" />
          </div>
          <div class="form-group">
            <label>Data de Nascimento</label>
            <input type="date" id="rh-emp-nascimento" value="${emp?.nascimento||''}" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Telefone</label>
            <input type="text" id="rh-emp-telefone" value="${emp?.telefone||''}" placeholder="(11) 99999-9999" />
          </div>
          <div class="form-group">
            <label>Tipo de Exame</label>
            <select id="rh-emp-tipoexame">
              <option value="" ${!emp?.tipoExame?'selected':''}>Sem exame</option>
              <option value="Admissional" ${emp?.tipoExame==='Admissional'?'selected':''}>Admissional</option>
              <option value="Periódico" ${emp?.tipoExame==='Periódico'?'selected':''}>Periódico</option>
              <option value="Demissional" ${emp?.tipoExame==='Demissional'?'selected':''}>Demissional</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>Data do Exame</label>
          <input type="date" id="rh-emp-dataexame" value="${emp?.dataExame||''}" />
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-outline" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
        <button class="btn-primary" onclick="saveRHEmployee('${isEdit?emp.matricula:''}')">
          <i class="fas fa-save"></i> ${isEdit ? 'Salvar' : 'Adicionar'}
        </button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

window.saveRHEmployee = function(editMatricula) {
  const mat     = document.getElementById('rh-emp-matricula')?.value.trim();
  const nome    = document.getElementById('rh-emp-nome')?.value.trim();
  const admissao= document.getElementById('rh-emp-admissao')?.value;
  const cargo   = document.getElementById('rh-emp-cargo')?.value.trim();
  if (!mat || !nome || !admissao || !cargo) { alert('Preencha os campos obrigatórios!'); return; }

  const all = getHREmployees();
  const newEmp = {
    matricula:   mat,
    nome,
    situacao:    document.getElementById('rh-emp-situacao')?.value || 'ATIVO',
    jornada:     document.getElementById('rh-emp-jornada')?.value || 'CLT',
    matriz:      document.getElementById('rh-emp-matriz')?.value || 'NT-JX',
    setor:       document.getElementById('rh-emp-setor')?.value || 'Administrativo',
    cargo,
    horario:     document.getElementById('rh-emp-horario')?.value || '',
    lider:       document.getElementById('rh-emp-lider')?.value || '',
    admissao,
    diasContrato:0,
    demissao:    document.getElementById('rh-emp-demissao')?.value || '',
    tipoExame:   document.getElementById('rh-emp-tipoexame')?.value || '',
    dataExame:   document.getElementById('rh-emp-dataexame')?.value || '',
    telefone:    document.getElementById('rh-emp-telefone')?.value || '',
    nascimento:  document.getElementById('rh-emp-nascimento')?.value || ''
  };

  if (editMatricula) {
    const idx = all.findIndex(e => e.matricula === editMatricula);
    if (idx >= 0) all[idx] = { ...all[idx], ...newEmp };
  } else {
    if (all.find(e => e.matricula === mat)) { alert('Matrícula já cadastrada!'); return; }
    all.push(newEmp);
  }

  saveHREmployees(all);
  document.querySelector('.modal-overlay.rh-modal')?.remove();
  renderRHEmployeesTable();
};

window.rhDeleteEmployee = function(matricula) {
  if (!confirm('Excluir este colaborador do cadastro de RH?')) return;
  const arr = getHREmployees().filter(e => e.matricula !== matricula);
  saveHREmployees(arr);
  rhRenderTableBody();
};

// ─── EXPORTAR CSV ────────────────────────────
window.exportRHCSV = function() {
  const all = getHREmployees();
  const headers = ['Matrícula','Nome','Situação','Jornada','Matriz','Setor','Cargo','Horário','Líder','Admissão','Dias Contrato','Demissão','Tipo Exame','Data Exame','Telefone','Nascimento'];
  const rows = all.map(e => [
    e.matricula, e.nome, e.situacao, e.jornada, e.matriz, e.setor || window._getSetorFromCargo(e.cargo), e.cargo, e.horario, e.lider,
    hrFormatDate(e.admissao), e.diasContrato || '', hrFormatDate(e.demissao),
    e.tipoExame, hrFormatDate(e.dataExame), e.telefone, hrFormatDate(e.nascimento)
  ]);

  const csv = [headers, ...rows].map(r => r.map(v => `"${(v||'').toString().replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `colaboradores_lumini_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
};

// ─── RENDER TURNOVER DETALHADO ────────────────
function renderRHTurnover(targetIdParam) {
  const el = document.getElementById(targetIdParam || 'page-rh-turnover');
  if (!el) return;
  const _tpfx = targetIdParam ? targetIdParam.replace('page-','').replace(/-/g,'_') + '_' : '';

  const all  = getHREmployees();
  const dem  = all.filter(e => e.situacao === 'DESLIGADO' && e.demissao);

  // Turnover por ano
  const years = [...new Set(all.map(e => hrGetYear(e.admissao)).filter(Boolean))].sort();

  const anoStats = years.map(y => {
    const admY  = all.filter(e => hrGetYear(e.admissao) === y).length;
    const demY  = dem.filter(e => hrGetYear(e.demissao) === y).length;
    const quadroMedio = all.filter(e => {
      const adm = hrGetYear(e.admissao);
      const dm  = e.demissao ? hrGetYear(e.demissao) : 9999;
      return adm <= y && dm >= y;
    }).length;
    const taxa = quadroMedio > 0 ? (demY / quadroMedio * 100).toFixed(1) : '0.0';
    return { ano: y, admissoes: admY, desligamentos: demY, quadroMedio, taxa };
  });

  // Motivos de saída (estimado por tempo de casa)
  const motivoFaixas = {
    'Período de Experiência (< 90d)': dem.filter(e => hrCalcTenure(e.admissao, e.demissao) < 3).length,
    'Curto Prazo (3-6 meses)': dem.filter(e => { const t=hrCalcTenure(e.admissao,e.demissao); return t>=3&&t<6; }).length,
    'Médio Prazo (6-12 meses)': dem.filter(e => { const t=hrCalcTenure(e.admissao,e.demissao); return t>=6&&t<12; }).length,
    'Longo Prazo (1-2 anos)': dem.filter(e => { const t=hrCalcTenure(e.admissao,e.demissao); return t>=12&&t<24; }).length,
    'Veteranos (> 2 anos)': dem.filter(e => hrCalcTenure(e.admissao,e.demissao) >= 24).length,
  };

  el.innerHTML = `
    <div class="page-header">
      <h2><i class="fas fa-sync-alt"></i> Análise de Turnover & Rotatividade</h2>
      <span class="page-sub">Dados detalhados de movimentação de pessoal</span>
    </div>

    <!-- Tabela de turnover por ano -->
    <div class="chart-card" style="margin-bottom:20px">
      <div class="chart-card-header">
        <div>
          <h3><i class="fas fa-table"></i> Turnover por Ano</h3>
          <span class="chart-sub">Taxa de rotatividade anual</span>
        </div>
      </div>
      <div class="table-wrapper" style="margin:0">
        <table class="data-table">
          <thead>
            <tr>
              <th>Ano</th>
              <th>Admissões</th>
              <th>Desligamentos</th>
              <th>Quadro Médio</th>
              <th>Taxa de Turnover</th>
              <th>Avaliação</th>
            </tr>
          </thead>
          <tbody>
            ${anoStats.map(s => `
              <tr>
                <td><strong>${s.ano}</strong></td>
                <td><span style="color:#4ade80;font-weight:600">+${s.admissoes}</span></td>
                <td><span style="color:#f87171;font-weight:600">-${s.desligamentos}</span></td>
                <td>${s.quadroMedio}</td>
                <td>
                  <div style="display:flex;align-items:center;gap:8px">
                    <div style="flex:1;background:#333;border-radius:999px;height:8px;min-width:60px">
                      <div style="width:${Math.min(100,parseFloat(s.taxa))}%;background:${parseFloat(s.taxa)>30?'#f87171':parseFloat(s.taxa)>15?'#fbbf24':'#4ade80'};height:8px;border-radius:999px"></div>
                    </div>
                    <strong>${s.taxa}%</strong>
                  </div>
                </td>
                <td>
                  <span class="status-badge ${parseFloat(s.taxa) > 30 ? 'status-period' : parseFloat(s.taxa) > 15 ? 'status-ready' : 'status-approved'}">
                    ${parseFloat(s.taxa) > 30 ? '⚠️ Alto' : parseFloat(s.taxa) > 15 ? '⚡ Moderado' : '✅ Saudável'}
                  </span>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="dashboard-row" style="margin-bottom:20px">
      <div class="chart-card">
        <div class="chart-card-header">
          <div>
            <h3><i class="fas fa-chart-bar"></i> Desligamentos por Faixa de Permanência</h3>
            <span class="chart-sub">Quando os colaboradores saem?</span>
          </div>
        </div>
        <div style="height:240px;position:relative">
          <canvas id="${_tpfx}chart-turn-faixa"></canvas>
        </div>
      </div>
      <div class="chart-card">
        <div class="chart-card-header">
          <div>
            <h3><i class="fas fa-building"></i> Desligamentos por Setor</h3>
            <span class="chart-sub">Qual setor tem mais saídas?</span>
          </div>
        </div>
        <div style="height:240px;position:relative">
          <canvas id="${_tpfx}chart-turn-setor"></canvas>
        </div>
      </div>
    </div>

    <!-- Desligamentos por cargo (linha separada) -->
    <div class="chart-card" style="margin-bottom:20px">
      <div class="chart-card-header">
        <div>
          <h3><i class="fas fa-id-badge"></i> Desligamentos por Cargo (Top 8)</h3>
          <span class="chart-sub">Cargos com maior rotatividade</span>
        </div>
      </div>
      <div style="height:260px;position:relative">
        <canvas id="${_tpfx}chart-turn-cargo"></canvas>
      </div>
    </div>

    <!-- Lista de desligados recentes -->
    <div class="chart-card">
      <div class="chart-card-header">
        <div>
          <h3><i class="fas fa-list"></i> Histórico de Desligamentos</h3>
          <span class="chart-sub">${dem.length} registros totais</span>
        </div>
        <div>
          <input type="text" id="turn-search" placeholder="Buscar..." class="rh-search-inline" oninput="filterTurnoverList()" />
        </div>
      </div>
      <div class="table-wrapper" style="margin:0">
        <table class="data-table">
          <thead>
            <tr>
              <th>Mat.</th><th>Colaborador</th><th>Setor</th><th>Cargo</th><th>Líder</th>
              <th>Admissão</th><th>Desligamento</th><th>Permanência</th>
            </tr>
          </thead>
          <tbody id="turn-list-body">
            ${dem.sort((a,b)=>b.demissao.localeCompare(a.demissao)).map(e=>{
              const t = hrCalcTenure(e.admissao,e.demissao);
              const tt= t>=12?`${Math.floor(t/12)}a ${t%12}m`:`${t}m`;
              const setor = e.setor || (window._getSetorFromCargo ? window._getSetorFromCargo(e.cargo) : '—');
              const SCMAP = {'Produção':'producao','Expedição':'expedicao','Designer':'designer','Vendas':'vendas','Administrativo':'administrativo','Facilities':'facilities'};
              const sc = SCMAP[setor]||'outros';
              return `<tr>
                <td>${e.matricula}</td>
                <td>${e.nome}</td>
                <td><span class="rh-setor-badge setor-${sc}">${setor}</span></td>
                <td>${e.cargo}</td>
                <td>${e.lider||'—'}</td>
                <td>${hrFormatDate(e.admissao)}</td>
                <td>${hrFormatDate(e.demissao)}</td>
                <td><span class="rh-tenure ${t<3?'tenure-low':t>24?'tenure-high':''}">${tt}</span></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Gráficos
  setTimeout(() => {
    // Gráfico faixa de permanência
    const c1 = document.getElementById(_tpfx+'chart-turn-faixa');
    if (c1) {
      new Chart(c1, {
        type: 'bar',
        data: {
          labels: Object.keys(motivoFaixas),
          datasets: [{ label: 'Desligados', data: Object.values(motivoFaixas), backgroundColor: ['#f87171','#fbbf24','#fb923c','#60a5fa','#4ade80'], borderRadius:6 }]
        },
        options: {
          responsive:true, maintainAspectRatio:false,
          plugins: { legend:{display:false} },
          scales: { x:{ticks:{color:'#aaa',font:{size:10}},grid:{color:'rgba(255,255,255,0.05)'}}, y:{ticks:{color:'#aaa'},grid:{color:'rgba(255,255,255,0.05)'},beginAtZero:true} }
        }
      });
    }

    // Gráfico por SETOR (doughnut) — usa campo setor real
    const cSetor = document.getElementById(_tpfx+'chart-turn-setor');
    if (cSetor) {
      const setorCnt = {};
      const SETORES_ORDER = ['Produção','Expedição','Designer','Vendas','Administrativo','Facilities'];
      dem.forEach(e => {
        const s = e.setor || (window._getSetorFromCargo ? window._getSetorFromCargo(e.cargo) : (e.matriz||'Outros'));
        setorCnt[s] = (setorCnt[s]||0)+1;
      });
      const allSetorKeys = [...new Set([...SETORES_ORDER,...Object.keys(setorCnt)])].filter(k=>setorCnt[k]);
      allSetorKeys.sort((a,b)=>{
        const ai=SETORES_ORDER.indexOf(a),bi=SETORES_ORDER.indexOf(b);
        if(ai>=0&&bi>=0)return ai-bi; if(ai>=0)return -1; if(bi>=0)return 1; return setorCnt[b]-setorCnt[a];
      });
      const setorSorted = allSetorKeys.map(k=>[k,setorCnt[k]||0]);
      const SETOR_COLORS = {'Produção':'#4361ee','Expedição':'#06d6a0','Designer':'#a78bfa','Vendas':'#fbbf24','Administrativo':'#9ca3af','Facilities':'#f87171','Outros':'#c9b8ff'};
      const setorTotal = setorSorted.reduce((a,s)=>a+s[1],0);
      new Chart(cSetor, {
        type: 'doughnut',
        data: {
          labels: setorSorted.map(s=>s[0]),
          datasets: [{ data: setorSorted.map(s=>s[1]), backgroundColor: setorSorted.map(s=>SETOR_COLORS[s[0]]||'#a78bfa'), borderWidth:2, borderColor:'#1a1a2e', hoverOffset:8 }]
        },
        options: {
          responsive:true, maintainAspectRatio:false, cutout:'60%',
          plugins: {
            legend: { position:'right', labels: { color:'#ccc', font:{size:12,weight:'600'}, padding:10,
              generateLabels: chart => chart.data.labels.map((lbl,i) => ({
                text: `${lbl}  (${chart.data.datasets[0].data[i]} · ${setorTotal>0?((chart.data.datasets[0].data[i]/setorTotal)*100).toFixed(1):0}%)`,
                fillStyle: chart.data.datasets[0].backgroundColor[i],
                strokeStyle: chart.data.datasets[0].backgroundColor[i],
                lineWidth:0, index:i
              }))
            }},
            tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw} desligamentos (${setorTotal>0?((ctx.raw/setorTotal)*100).toFixed(1):0}%)` } }
          }
        }
      });
    }

    // Gráfico por cargo (horizontal bar)
    const c2 = document.getElementById(_tpfx+'chart-turn-cargo');
    if (c2) {
      const cargoCnt = {};
      dem.forEach(e => { cargoCnt[e.cargo] = (cargoCnt[e.cargo]||0)+1; });
      const sorted = Object.entries(cargoCnt).sort((a,b)=>b[1]-a[1]).slice(0,8);
      new Chart(c2, {
        type: 'bar',
        data: {
          labels: sorted.map(s=>s[0]),
          datasets: [{ label: 'Desligamentos', data: sorted.map(s=>s[1]), backgroundColor: sorted.map((_,i)=>['#4361ee','#f72585','#4cc9f0','#fbbf24','#4ade80','#fb923c','#a78bfa','#f87171'][i]||'#4361ee'), borderRadius:6 }]
        },
        options: {
          indexAxis: 'y',
          responsive:true, maintainAspectRatio:false,
          plugins: { legend:{display:false} },
          scales: { x:{ticks:{color:'#aaa'},grid:{color:'rgba(255,255,255,0.05)'},beginAtZero:true}, y:{ticks:{color:'#aaa',font:{size:10}},grid:{color:'rgba(255,255,255,0.05)'}} }
        }
      });
    }
  }, 50);
}

window.filterTurnoverList = function() {
  const q = (document.getElementById('turn-search')?.value||'').toLowerCase();
  const tbody = document.getElementById('turn-list-body');
  if (!tbody) return;
  tbody.querySelectorAll('tr').forEach(tr => {
    tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
};

// ─── PROMOÇÕES HOMOLOGADAS ───────────────────
let _currentPromoTab = 'pendente';

function renderRHPromocoes() {
  const el = document.getElementById('page-rh-promocoes');
  if (!el) return;

  const notifs = getRHNotificacoes();
  const pendentes  = notifs.filter(n => n.status === 'pendente');
  const homologados= notifs.filter(n => n.status === 'homologado');
  const arquivados = notifs.filter(n => n.status === 'arquivado');

  // Cálculo de taxa de homologação
  const taxaHomolog = notifs.length > 0 ? ((homologados.length / notifs.length) * 100).toFixed(0) : 0;

  el.innerHTML = `
    <div class="page-header" style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px">
      <div>
        <h2><i class="fas fa-envelope-open-text"></i> Promoções Homologadas</h2>
        <span class="page-sub">Aprovações finais do Diretor que aguardam homologação do RH</span>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn-outline" onclick="rhExportPromosCSV()" title="Exportar CSV">
          <i class="fas fa-file-csv"></i> Exportar CSV
        </button>
        <button class="btn-outline" onclick="window.print()" title="Imprimir">
          <i class="fas fa-print"></i> Imprimir
        </button>
      </div>
    </div>

    <!-- KPIs -->
    <div class="cards-grid" style="margin-bottom:20px">
      <div class="stat-card orange">
        <div class="stat-icon"><i class="fas fa-clock"></i></div>
        <div class="stat-info">
          <span class="stat-value">${pendentes.length}</span>
          <span class="stat-label">Aguardando Homologação</span>
        </div>
      </div>
      <div class="stat-card green">
        <div class="stat-icon"><i class="fas fa-check-double"></i></div>
        <div class="stat-info">
          <span class="stat-value">${homologados.length}</span>
          <span class="stat-label">Homologadas</span>
        </div>
      </div>
      <div class="stat-card blue">
        <div class="stat-icon"><i class="fas fa-archive"></i></div>
        <div class="stat-info">
          <span class="stat-value">${arquivados.length}</span>
          <span class="stat-label">Arquivadas</span>
        </div>
      </div>
      <div class="stat-card" style="background:linear-gradient(135deg,#1e3a5f,#1e40af)">
        <div class="stat-icon"><i class="fas fa-percentage" style="color:#93c5fd"></i></div>
        <div class="stat-info">
          <span class="stat-value" style="color:#93c5fd">${taxaHomolog}%</span>
          <span class="stat-label">Taxa de Homologação</span>
        </div>
      </div>
    </div>

    <!-- Barra de busca -->
    <div style="margin-bottom:16px">
      <div style="position:relative">
        <i class="fas fa-search" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#9ca3af"></i>
        <input type="text" id="rh-promo-search" placeholder="Buscar por colaborador, cargo..." 
          oninput="rhSearchPromocoes(this.value)"
          style="width:100%;padding:10px 12px 10px 36px;border:1.5px solid #e5e7eb;border-radius:10px;font-size:14px;box-sizing:border-box" />
      </div>
    </div>

    <!-- Filtro de abas -->
    <div class="rh-promo-tabs">
      <button class="rh-promo-tab ${_currentPromoTab==='pendente'?'active':''}" onclick="rhFilterPromoTab('pendente', this)">
        <i class="fas fa-clock"></i> Pendentes ${pendentes.length > 0 ? `<span class="tab-badge">${pendentes.length}</span>` : ''}
      </button>
      <button class="rh-promo-tab ${_currentPromoTab==='homologado'?'active':''}" onclick="rhFilterPromoTab('homologado', this)">
        <i class="fas fa-check"></i> Homologadas ${homologados.length > 0 ? `<span style="font-size:11px;color:#4ade80">(${homologados.length})</span>` : ''}
      </button>
      <button class="rh-promo-tab ${_currentPromoTab==='arquivado'?'active':''}" onclick="rhFilterPromoTab('arquivado', this)">
        <i class="fas fa-archive"></i> Arquivadas
      </button>
      <button class="rh-promo-tab ${_currentPromoTab==='todos'?'active':''}" onclick="rhFilterPromoTab('todos', this)">
        <i class="fas fa-list"></i> Todas (${notifs.length})
      </button>
    </div>

    <!-- Lista de promoções -->
    <div id="rh-promo-list">
      ${renderPromoList(_currentPromoTab==='todos' ? notifs : notifs.filter(n=>n.status===_currentPromoTab), _currentPromoTab)}
    </div>
  `;

  updateRHPromosBadge();
}

window.rhSearchPromocoes = function(q) {
  const lq = q.toLowerCase();
  const notifs = getRHNotificacoes();
  const filtered = notifs.filter(n => {
    const base = _currentPromoTab === 'todos' ? true : n.status === _currentPromoTab;
    if (!base) return false;
    if (!lq) return true;
    return (n.employeeName||'').toLowerCase().includes(lq) ||
           (n.fromRole||'').toLowerCase().includes(lq) ||
           (n.toRole||'').toLowerCase().includes(lq) ||
           (n.supervisor||'').toLowerCase().includes(lq);
  });
  const el = document.getElementById('rh-promo-list');
  if (el) el.innerHTML = renderPromoList(filtered, _currentPromoTab);
};

window.rhExportPromosCSV = function() {
  const notifs = getRHNotificacoes();
  const rows = [
    ['ID','Colaborador','De','Para','Supervisor','Aprovado por','Data Aprovação','Nota (%)','Estrelas','Status','Obs RH','Homologado em'],
    ...notifs.map(n => [
      n.id,
      n.employeeName||'',
      n.fromRole||'',
      n.toRole||'',
      n.supervisor||'',
      n.approvedBy||'Carlos',
      n.approvedAt||'',
      n.score!=null ? n.score : '',
      n.stars||'',
      n.status==='pendente'?'Pendente':n.status==='homologado'?'Homologada':'Arquivada',
      (n.obsRH||'').replace(/,/g,' '),
      n.homologadoEm ? n.homologadoEm.split('T')[0] : ''
    ])
  ];
  const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'promocoes-homologadas.csv';
  a.click(); URL.revokeObjectURL(url);
};

function renderPromoList(notifs, tipo) {
  if (!notifs.length) {
    return `<div class="empty-state" style="margin-top:24px">
      <i class="fas fa-check-circle" style="font-size:36px;color:#4ade80;margin-bottom:12px"></i>
      <p style="color:#6b7280">Nenhuma promoção ${tipo === 'pendente' ? 'pendente' : tipo === 'homologado' ? 'homologada' : 'arquivada'}.</p>
    </div>`;
  }

  return notifs.map(n => {
    const stars = '★'.repeat(n.stars || 0) + '☆'.repeat(5 - (n.stars || 0));
    const isPendente = n.status === 'pendente';
    const dateFormatted = n.approvedAt ? hrFormatDate(n.approvedAt) : '—';
    const homologDateFormatted = n.homologadoEm ? hrFormatDate(n.homologadoEm.split('T')[0]) : '';

    return `
    <div class="rh-promo-card ${isPendente ? 'rh-promo-card-pending' : ''}">
      <!-- Header do card -->
      <div class="rh-promo-card-header">
        <div class="rh-promo-avatar">${(n.employeeName||'?').split(' ').slice(0,2).map(x=>x[0]).join('').toUpperCase()}</div>
        <div class="rh-promo-info">
          <div class="rh-promo-name">${n.employeeName || '—'}</div>
          <div class="rh-promo-roles">
            <span class="rh-promo-from">${n.fromRole || '—'}</span>
            <i class="fas fa-arrow-right" style="color:#4361ee;font-size:11px;margin:0 6px"></i>
            <span class="rh-promo-to">${n.toRole || '—'}</span>
          </div>
        </div>
        <div class="rh-promo-meta">
          <span class="status-badge ${isPendente ? 'status-ready' : n.status === 'homologado' ? 'status-approved' : 'status-registered'}">
            ${isPendente ? '⏳ Pendente' : n.status === 'homologado' ? '✅ Homologada' : '📦 Arquivada'}
          </span>
          <div style="font-size:12px;color:#9ca3af;margin-top:4px">
            Aprovado em: ${dateFormatted}
          </div>
        </div>
      </div>

      <!-- Detalhes -->
      <div class="rh-promo-details">
        <div class="rh-promo-detail-grid">
          <div class="rh-promo-detail-item">
            <span class="rh-promo-detail-label"><i class="fas fa-user-tie"></i> Supervisor</span>
            <span class="rh-promo-detail-value">${n.supervisor || '—'}</span>
          </div>
          <div class="rh-promo-detail-item">
            <span class="rh-promo-detail-label"><i class="fas fa-crown"></i> Aprovado por</span>
            <span class="rh-promo-detail-value">${n.approvedBy || 'Carlos'}</span>
          </div>
          <div class="rh-promo-detail-item">
            <span class="rh-promo-detail-label"><i class="fas fa-chart-bar"></i> Nota da Avaliação</span>
            <span class="rh-promo-detail-value" style="color:${(n.score||0)>=75?'#4ade80':'#fbbf24'};font-weight:700">${n.score != null ? n.score + '%' : '—'}</span>
          </div>
          <div class="rh-promo-detail-item">
            <span class="rh-promo-detail-label"><i class="fas fa-star" style="color:#fbbf24"></i> Estrelas</span>
            <span class="rh-promo-detail-value" style="color:#fbbf24;letter-spacing:2px">${stars}</span>
          </div>
        </div>

        ${n.justification ? `
        <div class="rh-promo-section">
          <div class="rh-promo-section-title"><i class="fas fa-comment-alt"></i> Justificativa da Avaliação</div>
          <div class="rh-promo-section-body">${n.justification}</div>
        </div>` : ''}

        ${n.strengths ? `
        <div class="rh-promo-section">
          <div class="rh-promo-section-title" style="color:#4ade80"><i class="fas fa-thumbs-up"></i> Pontos Fortes</div>
          <div class="rh-promo-section-body">${n.strengths}</div>
        </div>` : ''}

        ${n.improvements ? `
        <div class="rh-promo-section">
          <div class="rh-promo-section-title" style="color:#fbbf24"><i class="fas fa-lightbulb"></i> Pontos de Melhoria</div>
          <div class="rh-promo-section-body">${n.improvements}</div>
        </div>` : ''}

        ${n.feedback ? `
        <div class="rh-promo-section">
          <div class="rh-promo-section-title" style="color:#60a5fa"><i class="fas fa-crown"></i> Observação do Diretor</div>
          <div class="rh-promo-section-body">${n.feedback}</div>
        </div>` : ''}

        ${!isPendente && n.obsRH ? `
        <div class="rh-promo-section" style="border-color:#4ade80">
          <div class="rh-promo-section-title" style="color:#4ade80"><i class="fas fa-file-signature"></i> Observação do RH</div>
          <div class="rh-promo-section-body">${n.obsRH}</div>
        </div>` : ''}

        ${!isPendente ? `
        <div style="font-size:12px;color:#6b7280;margin-top:8px">
          <i class="fas fa-calendar-check"></i> Homologado em: ${homologDateFormatted || '—'} por ${n.homologadoPor || 'RH'}
        </div>` : ''}
      </div>

      <!-- Ações -->
      ${isPendente ? `
      <div class="rh-promo-actions">
        <div style="font-size:13px;font-weight:600;color:#92400e;margin-bottom:8px">
          <i class="fas fa-pen"></i> Observação Interna do RH
        </div>
        <div class="form-group" style="margin-bottom:10px">
          <textarea id="obs-rh-${n.id}" placeholder="Ex: Carta aditiva emitida em DD/MM/AAAA. Novo salário a partir de... Comunicado enviado ao colaborador e supervisor." class="rh-obs-input" rows="2" style="resize:vertical"></textarea>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <button class="btn-primary" onclick="rhHomologarPromocao('${n.id}')" style="background:#16a34a">
            <i class="fas fa-check-double"></i> Homologar Promoção
          </button>
          <button class="btn-outline" onclick="rhArquivarPromocao('${n.id}')">
            <i class="fas fa-archive"></i> Arquivar
          </button>
          <button class="btn-outline" onclick="rhImprimirCard('${n.id}')" style="margin-left:auto">
            <i class="fas fa-print"></i> Imprimir
          </button>
        </div>
      </div>` : `
      <div style="padding:12px 20px;display:flex;justify-content:flex-end;gap:8px;border-top:1px solid #f3f4f6">
        <button class="btn-outline" onclick="rhImprimirCard('${n.id}')" style="font-size:12px;padding:6px 12px">
          <i class="fas fa-print"></i> Imprimir
        </button>
      </div>`}
    </div>`;
  }).join('');
}

window.rhFilterPromoTab = function(tipo, btn) {
  document.querySelectorAll('.rh-promo-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  _currentPromoTab = tipo;
  // Limpa busca
  const searchEl = document.getElementById('rh-promo-search');
  if (searchEl) searchEl.value = '';
  const notifs = getRHNotificacoes();
  const filtered = tipo === 'todos' ? notifs : notifs.filter(n => n.status === tipo);
  const el = document.getElementById('rh-promo-list');
  if (el) el.innerHTML = renderPromoList(filtered, tipo);
};

window.rhHomologarPromocao = function(id) {
  const obs = document.getElementById('obs-rh-' + id)?.value.trim() || '';
  if (!obs) {
    // Alerta suave se não preencheu obs
    const input = document.getElementById('obs-rh-' + id);
    if (input) {
      input.style.borderColor = '#f59e0b';
      input.placeholder = '⚠️ Adicione uma observação interna antes de homologar (ex: carta aditiva enviada em...)';
      input.focus();
      // Restaura após 3s
      setTimeout(() => { input.style.borderColor = ''; }, 3000);
    }
    // Continua sem bloquear — obs é opcional
  }
  const idx = window._rhNotificacoes.findIndex(n => n.id === id);
  if (idx < 0) return;
  window._rhNotificacoes[idx].status       = 'homologado';
  window._rhNotificacoes[idx].obsRH        = obs || 'Homologado pelo RH.';
  window._rhNotificacoes[idx].homologadoEm = new Date().toISOString();
  window._rhNotificacoes[idx].homologadoPor= window.currentUser?.name || 'RH';
  updateRHPromosBadge();
  _currentPromoTab = 'homologado';
  renderRHPromocoes();
  // Toast de sucesso
  const toast = document.createElement('div');
  toast.style.cssText='position:fixed;bottom:24px;right:24px;background:#065f46;color:white;padding:14px 20px;border-radius:12px;font-weight:600;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.3);animation:fadeInUp .3s ease;display:flex;align-items:center;gap:10px';
  toast.innerHTML='<i class="fas fa-check-circle" style="font-size:20px"></i><div><div>Promoção homologada com sucesso!</div><div style="font-size:12px;font-weight:400;margin-top:2px;opacity:.85">Colaborador promovido e registrado.</div></div>';
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
};

window.rhArquivarPromocao = function(id) {
  const idx = window._rhNotificacoes.findIndex(n => n.id === id);
  if (idx < 0) return;
  window._rhNotificacoes[idx].status = 'arquivado';
  updateRHPromosBadge();
  _currentPromoTab = 'arquivado';
  renderRHPromocoes();
};

// ─── IMPRIMIR CARD DE PROMOÇÃO ───────────────
window.rhImprimirCard = function(id) {
  const n = window._rhNotificacoes.find(x => x.id === id);
  if (!n) return;
  const stars = '★'.repeat(n.stars || 0) + '☆'.repeat(5 - (n.stars || 0));
  const win = window.open('', '_blank', 'width=800,height=600');
  win.document.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Promoção — ${n.employeeName}</title>
<style>
  body { font-family: Arial, sans-serif; padding: 40px; color: #1f2937; max-width: 700px; margin: 0 auto; }
  h1 { font-size: 22px; border-bottom: 3px solid #4361ee; padding-bottom: 10px; color: #1e3a5f; }
  .logo { font-size: 24px; font-weight: 800; color: #002B5B; margin-bottom: 24px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 16px 0; }
  .item { background: #f9fafb; border-radius: 8px; padding: 10px 14px; }
  .label { font-size: 11px; text-transform: uppercase; color: #6b7280; margin-bottom: 4px; letter-spacing: .5px; }
  .value { font-size: 14px; font-weight: 600; }
  .section { border-left: 3px solid #4361ee; padding: 8px 14px; margin: 12px 0; background: #f9fafb; border-radius: 0 8px 8px 0; }
  .section-title { font-size: 12px; font-weight: 700; color: #4361ee; text-transform: uppercase; margin-bottom: 4px; }
  .status-badge { display: inline-block; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 700; }
  .pendente { background: #fef3c7; color: #92400e; }
  .homologado { background: #d1fae5; color: #065f46; }
  .footer { margin-top: 40px; border-top: 1px solid #e5e7eb; padding-top: 16px; font-size: 12px; color: #9ca3af; }
  @media print { button { display: none; } }
</style>
</head>
<body>
<div class="logo">🕐 Lumini</div>
<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">
  <h1>Promoção Aprovada — ${n.employeeName}</h1>
  <span class="status-badge ${n.status}">${n.status === 'pendente' ? '⏳ Pendente' : n.status === 'homologado' ? '✅ Homologada' : '📦 Arquivada'}</span>
</div>
<div class="grid">
  <div class="item"><div class="label">Cargo Anterior</div><div class="value">${n.fromRole || '—'}</div></div>
  <div class="item"><div class="label">Novo Cargo</div><div class="value" style="color:#4361ee">${n.toRole || '—'}</div></div>
  <div class="item"><div class="label">Supervisor</div><div class="value">${n.supervisor || '—'}</div></div>
  <div class="item"><div class="label">Aprovado por</div><div class="value">${n.approvedBy || 'Carlos'}</div></div>
  <div class="item"><div class="label">Nota da Avaliação</div><div class="value" style="color:${(n.score||0)>=75?'#16a34a':'#d97706'}">${n.score != null ? n.score + '%' : '—'}</div></div>
  <div class="item"><div class="label">Estrelas</div><div class="value" style="color:#d97706;font-size:18px">${stars}</div></div>
  <div class="item"><div class="label">Data de Aprovação</div><div class="value">${n.approvedAt ? n.approvedAt.split('-').reverse().join('/') : '—'}</div></div>
  ${n.homologadoEm ? `<div class="item"><div class="label">Data de Homologação</div><div class="value">${n.homologadoEm.split('T')[0].split('-').reverse().join('/')}</div></div>` : ''}
</div>
${n.justification ? `<div class="section"><div class="section-title">Justificativa da Avaliação</div><div>${n.justification}</div></div>` : ''}
${n.strengths ? `<div class="section" style="border-color:#16a34a"><div class="section-title" style="color:#16a34a">Pontos Fortes</div><div>${n.strengths}</div></div>` : ''}
${n.improvements ? `<div class="section" style="border-color:#d97706"><div class="section-title" style="color:#d97706">Pontos de Melhoria</div><div>${n.improvements}</div></div>` : ''}
${n.feedback ? `<div class="section" style="border-color:#1d4ed8"><div class="section-title" style="color:#1d4ed8">Observação do Diretor</div><div>${n.feedback}</div></div>` : ''}
${n.obsRH ? `<div class="section" style="border-color:#059669"><div class="section-title" style="color:#059669">Observação do RH</div><div>${n.obsRH}</div></div>` : ''}
<div class="footer">
  Documento gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')} — Lumini Sistema de Gestão de RH
  <br>
  <button onclick="window.print()" style="margin-top:10px;padding:8px 20px;background:#4361ee;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px">🖨️ Imprimir</button>
</div>
</body></html>`);
  win.document.close();
};

// ─── INICIALIZAÇÃO ───────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  window.initHRModule().catch(console.warn);
});
