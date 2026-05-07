/* =============================================
   ONBOARDING.JS — Tutorial Interativo
   Lumini — Gestão de Carreira & Polivalência
   
   Funcionalidades:
   - Tour guiado passo a passo com highlights
   - Exibição automática no 1º acesso
   - Botão "Ajuda/Tutorial" para reabrir
   - Progresso salvo no localStorage
   - Customização por perfil de usuário
   - Animações suaves + responsivo
============================================= */

(function() {
'use strict';

// ─── CONFIGURAÇÃO DOS TOURS POR PERFIL ───────────────────────────────────────

const TOURS = {
  admin: [
    {
      title: '👋 Bem-vindo, Wesley!',
      text: 'Este é o painel de <strong>Administrador</strong> da Lumini. Aqui você tem controle total sobre a gestão de carreira e polivalência. Vamos fazer um tour rápido para você se familiarizar!',
      target: null,
      position: 'center'
    },
    {
      title: '📊 Dashboard Principal',
      text: 'O <strong>Dashboard</strong> exibe um resumo em tempo real: total de funcionários, aptos para avaliação, avaliações pendentes e promoções aprovadas.',
      target: '[data-page="admin-dashboard"]',
      position: 'right',
      action: () => { if (window.navigateTo) window.navigateTo('admin-dashboard'); }
    },
    {
      title: '👥 Funcionários & Carreira',
      text: 'Em <strong>Funcionários (Carreira)</strong> você visualiza toda a equipe, o status de cada colaborador na trilha de carreira e pode iniciar avaliações.',
      target: '[data-page="admin-employees"]',
      position: 'right'
    },
    {
      title: '🏗️ Equipes de Produção',
      text: 'Em <strong>Equipes de Produção</strong> você gerencia as equipes por supervisor. Crie, edite e popule equipes automaticamente com base nos dados do RH.',
      target: '[data-page="admin-teams"]',
      position: 'right'
    },
    {
      title: '❤️ Módulo RH',
      text: 'O <strong>Dashboard RH</strong> traz dados de turnover, admissões, demissões e evolução dos colaboradores em tempo real.',
      target: '[data-page="admin-rh-dashboard"]',
      position: 'right'
    },
    {
      title: '🌙 Modo Claro / Escuro',
      text: 'Use o <strong>toggle</strong> no canto superior direito para alternar entre modo claro e escuro. Sua preferência é salva automaticamente.',
      target: '.dark-toggle-wrap',
      position: 'bottom'
    },
    {
      title: '🔔 Notificações',
      text: 'O <strong>ícone de sino</strong> exibe alertas de funcionários aptos para avaliação e pendências no fluxo de promoções.',
      target: '.notif-badge',
      position: 'bottom'
    },
    {
      title: '✅ Tudo pronto!',
      text: 'Você já conhece os principais recursos. Qualquer dúvida, clique no botão <strong>❓ Ajuda</strong> na barra lateral para revisitar este tutorial. Bom trabalho!',
      target: null,
      position: 'center'
    }
  ],

  manager: [
    {
      title: '👋 Bem-vindo, Samuel!',
      text: 'Este é o seu painel de <strong>Gerente de Produção</strong>. Aqui você aprova exceções, homologa promoções e acompanha toda a equipe de produção.',
      target: null,
      position: 'center'
    },
    {
      title: '🏠 Painel Inicial',
      text: 'A tela <strong>Início</strong> exibe um resumo da sua equipe e as pendências que precisam da sua atenção imediata.',
      target: '[data-page="supervisor-home"]',
      position: 'right',
      action: () => { if (window.navigateTo) window.navigateTo('supervisor-home'); }
    },
    {
      title: '🛡️ Aprovar Exceções',
      text: 'Em <strong>Aprovar Exceções</strong> você revisa pedidos dos supervisores para promover colaboradores fora do prazo mínimo estabelecido.',
      target: '[data-page="manager-excecoes"]',
      position: 'right'
    },
    {
      title: '✅ Aprovar Promoções',
      text: 'Em <strong>Aprovar Promoções</strong> você valida as avaliações dos supervisores antes de enviar ao Diretor para aprovação final.',
      target: '[data-page="manager-promo-approvals"]',
      position: 'right'
    },
    {
      title: '🏗️ Equipes de Produção',
      text: 'Em <strong>Equipes de Produção</strong> você visualiza e gerencia todas as equipes, membros e líderes de cada grupo.',
      target: '[data-page="manager-teams"]',
      position: 'right'
    },
    {
      title: '✅ Tudo pronto!',
      text: 'Você já conhece seu painel. Clique em <strong>❓ Ajuda</strong> na barra para rever este tutorial quando quiser!',
      target: null,
      position: 'center'
    }
  ],

  supervisor: [
    {
      title: '👋 Bem-vindo à Lumini!',
      text: 'Este é o seu painel de <strong>Supervisor</strong>. Aqui você acompanha sua equipe, avalia colaboradores e solicita exceções de promoção.',
      target: null,
      position: 'center'
    },
    {
      title: '🏠 Painel Inicial',
      text: 'A tela <strong>Início</strong> exibe cards com resumo da sua equipe: ativos, aptos para avaliação e pendências.',
      target: '[data-page="supervisor-home"]',
      position: 'right',
      action: () => { if (window.navigateTo) window.navigateTo('supervisor-home'); }
    },
    {
      title: '👥 Minha Equipe',
      text: 'Em <strong>Minha Equipe</strong> você vê todos os colaboradores sob sua supervisão, o status de carreira de cada um e pode iniciar avaliações.',
      target: '[data-page="supervisor-employees"]',
      position: 'right'
    },
    {
      title: '✈️ Solicitações de Exceção',
      text: 'Quando um colaborador ainda não atingiu o tempo mínimo mas merece promoção, você pode <strong>solicitar uma exceção</strong> aqui para análise do gerente.',
      target: '[data-page="supervisor-excecoes"]',
      position: 'right'
    },
    {
      title: '📋 Histórico de Promoções',
      text: 'Acompanhe todas as promoções já realizadas na sua equipe, com datas e aprovações registradas.',
      target: '[data-page="supervisor-promo-history"]',
      position: 'right'
    },
    {
      title: '✅ Tudo pronto!',
      text: 'Explore seu painel com confiança. Clique em <strong>❓ Ajuda</strong> para rever este tutorial a qualquer momento!',
      target: null,
      position: 'center'
    }
  ],

  boss: [
    {
      title: '👋 Bem-vindo, Carlos!',
      text: 'Este é o seu painel de <strong>Diretor Geral</strong>. Aqui você tem visão estratégica completa da operação e aprova as promoções finais.',
      target: null,
      position: 'center'
    },
    {
      title: '👑 Aprovação Final',
      text: 'Em <strong>Aprovação Final</strong> chegam as promoções já validadas pelo Gerente para a sua homologação definitiva.',
      target: '[data-page="boss-promo-approvals"]',
      position: 'right',
      action: () => { if (window.navigateTo) window.navigateTo('boss-promo-approvals'); }
    },
    {
      title: '📊 Dashboard RH',
      text: 'O <strong>Dashboard RH</strong> oferece visão estratégica de admissões, demissões, turnover e evolução da equipe.',
      target: '[data-page="boss-rh-dashboard"]',
      position: 'right'
    },
    {
      title: '✅ Tudo pronto!',
      text: 'Seu painel está configurado. Use o botão <strong>❓ Ajuda</strong> para revisar o tutorial quando precisar.',
      target: null,
      position: 'center'
    }
  ],

  rh: [
    {
      title: '👋 Bem-vindo ao RH!',
      text: 'Este é o painel de <strong>Recursos Humanos</strong> da Lumini. Aqui você gerencia o cadastro de colaboradores e acompanha indicadores de turnover.',
      target: null,
      position: 'center'
    },
    {
      title: '❤️ Dashboard RH',
      text: 'O <strong>Dashboard</strong> exibe KPIs em tempo real: total de colaboradores, admissões do mês, demissões, índice de turnover e distribuição por setor.',
      target: '[data-page="rh-dashboard"]',
      position: 'right',
      action: () => { if (window.navigateTo) window.navigateTo('rh-dashboard'); }
    },
    {
      title: '📋 Cadastro de Colaboradores',
      text: 'Em <strong>Cadastro de Colaboradores</strong> você visualiza, busca e exporta os dados de todos os 179 colaboradores registrados no sistema.',
      target: '[data-page="rh-employees"]',
      position: 'right'
    },
    {
      title: '📈 Turnover & Rotatividade',
      text: 'Analise a <strong>rotatividade mensal</strong> da empresa com gráficos detalhados de entrada e saída de colaboradores.',
      target: '[data-page="rh-turnover"]',
      position: 'right'
    },
    {
      title: '✅ Tudo pronto!',
      text: 'Você conhece seu painel. Use <strong>❓ Ajuda</strong> para rever o tutorial quando precisar.',
      target: null,
      position: 'center'
    }
  ]
};

// ─── ESTADO DO ONBOARDING ──────────────────────────────────────────────────

let _currentStep = 0;
let _currentTour = [];
let _overlay = null;
let _popup = null;
let _spotlight = null;
let _highlightEl = null;
let _isActive = false;

// ─── KEY DO localStorage (por usuário logado + perfil) ─────────────────────

function _getTourKeyForUser(user) {
  const role = (user && user.role) ? user.role : 'admin';
  const email = String((user && user.email) || '').trim().toLowerCase();
  if (!email) return `nt_tour_done_${role}`;
  return `nt_tour_done_${encodeURIComponent(email)}_${role}`;
}

function _markTourDone() {
  const user = window.currentUser;
  localStorage.setItem(_getTourKeyForUser(user), 'true');
}

function _isTourDone() {
  return localStorage.getItem(_getTourKeyForUser(window.currentUser)) === 'true';
}

// ─── CRIAR ELEMENTOS DO TOUR ───────────────────────────────────────────────

function _createOverlay() {
  const el = document.createElement('div');
  el.id = 'nt-tour-overlay';
  el.className = 'nt-tour-overlay';
  el.addEventListener('click', (e) => {
    // Clique fora do popup fecha o tour
    if (!e.target.closest('.nt-tour-popup')) {
      _closeTour();
    }
  });
  return el;
}

function _createSpotlight() {
  const el = document.createElement('div');
  el.id = 'nt-tour-spotlight';
  el.className = 'nt-tour-spotlight';
  return el;
}

function _createPopup() {
  const el = document.createElement('div');
  el.id = 'nt-tour-popup';
  el.className = 'nt-tour-popup';
  return el;
}

// ─── POSICIONAR POPUP ─────────────────────────────────────────────────────

function _positionPopup(target, position) {
  if (!target || position === 'center') {
    // Centralizado na tela
    _popup.style.top = '50%';
    _popup.style.left = '50%';
    _popup.style.transform = 'translate(-50%, -50%)';
    _popup.style.maxWidth = '480px';
    _spotlight.style.display = 'none';
    return;
  }

  const rect = target.getBoundingClientRect();
  const pw = _popup.offsetWidth || 320;
  const ph = _popup.offsetHeight || 200;
  const margin = 16;
  const scrollY = window.pageYOffset;

  // Spotlight no elemento alvo
  _spotlight.style.display = 'block';
  _spotlight.style.top    = (rect.top + scrollY - 6) + 'px';
  _spotlight.style.left   = (rect.left - 6) + 'px';
  _spotlight.style.width  = (rect.width + 12) + 'px';
  _spotlight.style.height = (rect.height + 12) + 'px';

  let top, left;
  _popup.style.transform = 'none';

  if (position === 'right') {
    left = rect.right + margin;
    top  = rect.top + scrollY + rect.height/2 - ph/2;
    // Se sair pela direita, muda para esquerda
    if (left + pw > window.innerWidth - margin) {
      left = rect.left - pw - margin;
    }
    // Se sair pela esquerda, centraliza abaixo
    if (left < margin) {
      left = window.innerWidth/2 - pw/2;
      top  = rect.bottom + scrollY + margin;
    }
  } else if (position === 'bottom') {
    top  = rect.bottom + scrollY + margin;
    left = rect.left + rect.width/2 - pw/2;
    // Limites
    if (left < margin) left = margin;
    if (left + pw > window.innerWidth - margin) left = window.innerWidth - pw - margin;
    // Se sair pela base
    if (top + ph > document.documentElement.scrollHeight - margin) {
      top = rect.top + scrollY - ph - margin;
    }
  } else if (position === 'top') {
    top  = rect.top + scrollY - ph - margin;
    left = rect.left + rect.width/2 - pw/2;
    if (left < margin) left = margin;
    if (left + pw > window.innerWidth - margin) left = window.innerWidth - pw - margin;
    if (top < margin) top = rect.bottom + scrollY + margin;
  } else {
    // left
    left = rect.left - pw - margin;
    top  = rect.top + scrollY + rect.height/2 - ph/2;
    if (left < margin) {
      left = rect.right + margin;
    }
  }

  // Garantir dentro da viewport
  top  = Math.max(scrollY + margin, top);
  left = Math.max(margin, Math.min(left, window.innerWidth - pw - margin));

  _popup.style.top  = top + 'px';
  _popup.style.left = left + 'px';
  _popup.style.maxWidth = '340px';
}

// ─── RENDERIZAR STEP ──────────────────────────────────────────────────────

function _renderStep(index) {
  const step = _currentTour[index];
  if (!step) return;

  const total = _currentTour.length;
  const isLast = index === total - 1;
  const isFirst = index === 0;

  // Executar ação do step (ex: navegar para a página)
  if (step.action) {
    try { step.action(); } catch(e) {}
  }

  // Encontrar elemento alvo
  let targetEl = null;
  if (step.target) {
    targetEl = document.querySelector(step.target);
    // Se estiver em menu oculto, tentar encontrar versível
    if (!targetEl || targetEl.offsetParent === null) {
      targetEl = null;
    }
  }

  // Scroll suave para o elemento
  if (targetEl) {
    targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Adicionar classe de highlight temporária
    if (_highlightEl) _highlightEl.classList.remove('nt-tour-target-highlight');
    targetEl.classList.add('nt-tour-target-highlight');
    _highlightEl = targetEl;
  } else {
    if (_highlightEl) _highlightEl.classList.remove('nt-tour-target-highlight');
    _highlightEl = null;
  }

  // Montar HTML do popup
  const dots = _currentTour.map((_, i) => 
    `<span class="nt-tour-dot ${i === index ? 'active' : ''}" onclick="window._tourGoTo(${i})"></span>`
  ).join('');

  _popup.innerHTML = `
    <button class="nt-tour-close" onclick="window._tourClose()" title="Fechar tutorial" aria-label="Fechar">×</button>
    <div class="nt-tour-progress-bar">
      <div class="nt-tour-progress-fill" style="width:${((index+1)/total)*100}%"></div>
    </div>
    <div class="nt-tour-step-label">Passo ${index + 1} de ${total}</div>
    <div class="nt-tour-title">${step.title}</div>
    <div class="nt-tour-text">${step.text}</div>
    <div class="nt-tour-dots">${dots}</div>
    <div class="nt-tour-actions">
      <button class="nt-tour-btn nt-tour-btn-skip" onclick="window._tourClose()">
        <i class="fas fa-times"></i> Pular
      </button>
      <div class="nt-tour-nav">
        ${!isFirst ? `<button class="nt-tour-btn nt-tour-btn-prev" onclick="window._tourPrev()">
          <i class="fas fa-arrow-left"></i> Anterior
        </button>` : ''}
        <button class="nt-tour-btn nt-tour-btn-next ${isLast ? 'nt-tour-btn-finish' : ''}" onclick="window._tourNext()">
          ${isLast ? '<i class="fas fa-check"></i> Concluir' : 'Próximo <i class="fas fa-arrow-right"></i>'}
        </button>
      </div>
    </div>
  `;

  // Aguardar renderização para posicionar
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      _positionPopup(targetEl, step.position || 'center');
      _popup.classList.add('nt-tour-popup-visible');
    });
  });
}

// ─── CONTROLES PÚBLICOS ───────────────────────────────────────────────────

window._tourNext = function() {
  if (_currentStep < _currentTour.length - 1) {
    _currentStep++;
    _popup.classList.remove('nt-tour-popup-visible');
    setTimeout(() => _renderStep(_currentStep), 150);
  } else {
    _finishTour();
  }
};

window._tourPrev = function() {
  if (_currentStep > 0) {
    _currentStep--;
    _popup.classList.remove('nt-tour-popup-visible');
    setTimeout(() => _renderStep(_currentStep), 150);
  }
};

window._tourGoTo = function(index) {
  if (index >= 0 && index < _currentTour.length) {
    _currentStep = index;
    _popup.classList.remove('nt-tour-popup-visible');
    setTimeout(() => _renderStep(_currentStep), 150);
  }
};

window._tourClose = _closeTour;

function _closeTour() {
  if (!_isActive) return;
  _markTourDone();
  _isActive = false;

  if (_highlightEl) {
    _highlightEl.classList.remove('nt-tour-target-highlight');
    _highlightEl = null;
  }

  if (_overlay) {
    _overlay.classList.remove('nt-tour-overlay-visible');
    setTimeout(() => {
      if (_overlay && _overlay.parentNode) _overlay.parentNode.removeChild(_overlay);
      _overlay = null;
      _popup = null;
      _spotlight = null;
    }, 400);
  }
}

function _finishTour() {
  _closeTour();

  // Mostrar toast de conclusão
  if (window._ntShowToast) {
    window._ntShowToast('🎉 Tutorial concluído! Bem-vindo à Lumini.', 'success');
  }
}

// ─── INICIAR TOUR ─────────────────────────────────────────────────────────

window.startOnboardingTour = function(forceRestart) {
  const role = window.currentUser ? window.currentUser.role : 'admin';
  const tour = TOURS[role] || TOURS['admin'];

  if (!forceRestart && _isTourDone()) return;
  if (_isActive) _closeTour();

  _currentStep = 0;
  _currentTour = tour;
  _isActive = true;

  // Criar elementos
  _overlay = _createOverlay();
  _spotlight = _createSpotlight();
  _popup = _createPopup();
  _overlay.appendChild(_spotlight);
  _overlay.appendChild(_popup);
  document.body.appendChild(_overlay);

  // Animar entrada
  requestAnimationFrame(() => {
    _overlay.classList.add('nt-tour-overlay-visible');
    _renderStep(0);
  });
};

// ─── AUTO-START após login ─────────────────────────────────────────────────

window._onboardingAutoStart = function() {
  if (!_isTourDone()) {
    setTimeout(() => window.startOnboardingTour(false), 1200);
  }
};

// ─── RESET TOUR (admin pode resetar para qualquer usuário) ─────────────────

window.resetOnboardingTour = function(role) {
  const roles = role ? [role] : ['admin', 'manager', 'supervisor', 'boss', 'rh'];
  roles.forEach((r) => {
    const suffix = '_' + r;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith('nt_tour_done_') && k.endsWith(suffix)) {
        localStorage.removeItem(k);
      }
    }
  });
  if (window._ntShowToast) {
    window._ntShowToast('Tutorial resetado com sucesso!', 'info');
  }
};

window._ntIsTourDone = _isTourDone;

console.log('✅ Onboarding Module carregado.');

})();
