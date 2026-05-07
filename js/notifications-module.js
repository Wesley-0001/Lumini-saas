/* =============================================
   NOTIFICATIONS-MODULE.JS — Alertas in-app
   Lumini — sem chat; integra comunicação, compras, promoções
============================================= */

(function() {
  'use strict';

  const PANEL_ID = 'nt-notif-panel';
  const NOTIF_PANEL_LIMIT = 20;

  function _normEmail(e) {
    return String(e || '').trim().toLowerCase();
  }

  function _toast(msg, type) {
    if (window._ntShowToast) window._ntShowToast(msg, type);
  }

  function _getUsersSource() {
    const c = window._cache && window._cache.users && window._cache.users.length;
    if (c) return window._cache.users.filter(u => u.active !== false);
    return (window.DEMO_USERS || []).map(u => ({
      email: u.email, name: u.name, role: u.role, active: true
    }));
  }

  /** Expande destinatários de um comunicado para lista de e-mails (exceto autor). */
  function expandCommsRecipientEmails(item) {
    const author = _normEmail(item.authorEmail);
    const out = new Set();
    const users = _getUsersSource();
    const dest = item.destinationType || 'all';
    const r = item.recipients || {};

    if (dest === 'all') {
      users.forEach(u => { if (_normEmail(u.email) !== author) out.add(_normEmail(u.email)); });
    } else if (dest === 'role') {
      const roles = Array.isArray(r.roles) ? r.roles : [];
      users.filter(u => roles.includes(u.role)).forEach(u => {
        if (_normEmail(u.email) !== author) out.add(_normEmail(u.email));
      });
    } else if (dest === 'user') {
      (Array.isArray(r.users) ? r.users : []).forEach(em => {
        const ne = _normEmail(em);
        if (ne && ne !== author) out.add(ne);
      });
    } else if (dest === 'team') {
      const teamIds = Array.isArray(r.teams) ? r.teams : [];
      const teams = window.getTeams ? window.getTeams() : [];
      teamIds.forEach(tid => {
        const tm = teams.find(t => t.id === tid);
        if (!tm || !tm.membros) return;
        tm.membros.forEach(m => {
          const em = _normEmail(m.email);
          if (em && em !== author) out.add(em);
        });
      });
    }
    return [...out].filter(Boolean);
  }

  /** Rótulo amigável do destino (somente para cópia das notificações; não altera dados do comunicado). */
  function commDestinationLabel(item) {
    const dest = item.destinationType || 'all';
    const r = item.recipients || {};
    const roleLabels = {
      admin: 'Administradores',
      boss: 'Diretores',
      manager: 'Gerentes',
      supervisor: 'Supervisores',
      rh: 'RH',
      employee: 'Colaboradores'
    };
    if (dest === 'all') return 'Todos os colaboradores';
    if (dest === 'role') {
      const roles = Array.isArray(r.roles) ? r.roles : [];
      if (!roles.length) return 'Equipe selecionada';
      return roles.map(x => roleLabels[x] || x).join(', ');
    }
    if (dest === 'user') {
      const users = Array.isArray(r.users) ? r.users : [];
      const n = users.length;
      return n === 1 ? '1 pessoa selecionada' : `${n} pessoas selecionadas`;
    }
    if (dest === 'team') {
      const teamIds = Array.isArray(r.teams) ? r.teams : [];
      const teams = window.getTeams ? window.getTeams() : [];
      const names = teamIds
        .map(tid => (teams.find(t => t.id === tid) || {}).name)
        .filter(Boolean);
      return names.length ? names.join(', ') : 'Equipes selecionadas';
    }
    return 'Destinatários';
  }

  function _authorNameFromEmail(email) {
    const ne = _normEmail(email);
    if (!ne) return 'Autor';
    const u = _getUsersSource().find(x => _normEmail(x.email) === ne);
    return u ? (u.name || ne) : ne;
  }

  function notifyCommsPublished(item) {
    if (!window._ntBatchAddInAppNotifications) return;
    const emails = expandCommsRecipientEmails(item);
    if (!emails.length) return;
    const title = 'Novo comunicado recebido';
    const dest = commDestinationLabel(item);
    const who = _authorNameFromEmail(item.authorEmail);
    const subj = (item.title || 'Comunicado interno').slice(0, 160);
    const message = `Enviado por: ${who}. Enviado para: ${dest}. “${subj}”`;
    const list = emails.map(userEmail => ({
      userEmail,
      userId: null,
      type: 'comms',
      title,
      message,
      link: 'comms',
      read: false,
      createdAt: Date.now(),
      meta: { commId: item.id }
    }));
    window._ntBatchAddInAppNotifications(list);
  }

  function notifyPurchaseApproved(purchase) {
    if (!window._ntAddInAppNotification || !purchase) return;
    const em = _normEmail(purchase.requesterEmail) || _resolveEmailByName(purchase.requester);
    if (!em) return;
    window._ntAddInAppNotification({
      userEmail: em,
      userId: null,
      type: 'purchase_approved',
      title: 'Sua solicitação de compra foi aprovada',
      message: `Item: “${(purchase.title || '—').slice(0, 80)}”.`,
      link: 'purchases',
      read: false,
      createdAt: Date.now(),
      meta: { purchaseId: purchase.id }
    });
  }

  function _resolveEmailByName(name) {
    if (!name) return '';
    const n = String(name).trim().toLowerCase();
    const users = _getUsersSource();
    const u = users.find(x => String(x.name || '').trim().toLowerCase() === n);
    return u ? _normEmail(u.email) : '';
  }

  function notifyPurchaseCancelRequested(purchase) {
    if (!window._ntBatchAddInAppNotifications || !purchase) return;
    const targets = _getUsersSource().filter(u =>
      ['admin', 'manager', 'boss'].includes(u.role)
    );
    const list = targets.map(u => ({
      userEmail: _normEmail(u.email),
      userId: null,
      type: 'purchase_cancel_request',
      title: 'Nova solicitação de cancelamento',
      message: `${purchase.requester || 'Solicitante'} pediu cancelamento da compra “${(purchase.title || '').slice(0, 72)}”. Confira em Compras.`,
      link: 'purchases',
      read: false,
      createdAt: Date.now(),
      meta: { purchaseId: purchase.id }
    }));
    window._ntBatchAddInAppNotifications(list);
  }

  function notifyPurchaseCancelResolved(purchase, approved) {
    if (!window._ntAddInAppNotification || !purchase) return;
    const em = _normEmail(purchase.requesterEmail) || _resolveEmailByName(purchase.requester);
    if (!em) return;
    window._ntAddInAppNotification({
      userEmail: em,
      userId: null,
      type: approved ? 'purchase_cancel_ok' : 'purchase_cancel_denied',
      title: approved ? 'Sua solicitação de cancelamento foi aprovada' : 'Sua solicitação de cancelamento foi recusada',
      message: approved
        ? `A compra “${(purchase.title || '').slice(0, 80)}” foi cancelada.`
        : `A compra “${(purchase.title || '').slice(0, 80)}” permanece ativa.`,
      link: 'purchases',
      read: false,
      createdAt: Date.now(),
      meta: { purchaseId: purchase.id }
    });
  }

  function notifyPromoForSupervisor(emp, outcome) {
    if (!window._ntAddInAppNotification || !emp) return;
    const sup = _normEmail(emp.supervisor);
    if (!sup) return;
    const name = emp.name || 'Colaborador';
    let title = 'Atualização de promoção';
    let message = '';
    if (outcome === 'approved_boss') {
      title = 'Promoção aprovada';
      message = `A promoção de ${name} foi aprovada pelo Diretor.`;
    } else if (outcome === 'approved_manager') {
      title = 'Promoção encaminhada';
      message = `A promoção de ${name} segue para o Diretor.`;
    } else if (outcome === 'rejected') {
      title = 'Promoção reprovada';
      message = `A promoção de ${name} não foi aprovada.`;
    } else {
      message = `Atualização no processo de promoção de ${name}.`;
    }
    window._ntAddInAppNotification({
      userEmail: sup,
      userId: null,
      type: 'promo',
      title,
      message,
      link: 'supervisor-promo-history',
      read: false,
      createdAt: Date.now(),
      meta: { employeeId: emp.id }
    });
  }

  function getUnreadCount() {
    const arr = window._cache && window._cache.notifications ? window._cache.notifications : [];
    return arr.filter(n => !n.read).length;
  }

  function refreshBadge() {
    const n = getUnreadCount();
    const badge = document.getElementById('badge-count');
    if (badge) {
      badge.textContent = n > 99 ? '99+' : String(n);
      badge.style.display = n > 0 ? 'flex' : 'none';
    }
  }

  function _fmtRelativeTime(ts) {
    if (!ts) return '';
    const t = Number(ts);
    const now = Date.now();
    const diff = now - t;
    if (diff < 0) return 'agora';
    const sec = Math.floor(diff / 1000);
    if (sec < 45) return 'agora';
    const min = Math.floor(sec / 60);
    if (min < 60) return min === 1 ? 'há 1 minuto' : `há ${min} minutos`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return hr === 1 ? 'há 1 hora' : `há ${hr} horas`;
    const d = new Date(t);
    const today = new Date();
    const yest = new Date(today);
    yest.setDate(yest.getDate() - 1);
    if (d.toDateString() === yest.toDateString()) return 'ontem';
    const days = Math.floor(hr / 24);
    if (days < 7) {
      return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }) +
        ' · ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function _iconForType(type) {
    const t = String(type || '');
    if (t === 'comms') return '📢';
    if (t === 'promo') return '📈';
    return '🛒';
  }

  function _sortNotificationsForDisplay(arr) {
    return [...arr].sort((a, b) => {
      const ua = !a.read ? 1 : 0;
      const ub = !b.read ? 1 : 0;
      if (ua !== ub) return ub - ua;
      return Number(b.createdAt || 0) - Number(a.createdAt || 0);
    });
  }

  function _openNotification(n) {
    if (!n) return;
    if (!n.read && window._ntMarkInAppNotificationRead) {
      window._ntMarkInAppNotificationRead(n.id);
    }
    if (n.link && window.navigateTo) {
      window.navigateTo(n.link);
      const meta = n.meta || {};
      if (n.type === 'comms' && meta.commId && window._commsOpenItem) {
        setTimeout(() => window._commsOpenItem(meta.commId), 350);
      }
    }
    closePanel();
  }

  function renderPanelContent() {
    const body = document.getElementById('nt-notif-list');
    if (!body) return;
    const raw = (window._cache && window._cache.notifications) ? [...window._cache.notifications] : [];
    const arr = _sortNotificationsForDisplay(raw);
    const recent = arr.slice(0, NOTIF_PANEL_LIMIT);
    if (!recent.length) {
      body.innerHTML = '<div class="nt-notif-empty">Nenhuma notificação no momento</div>';
      return;
    }
    const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    body.innerHTML = recent.map(n => {
      const unread = !n.read;
      const icon = _iconForType(n.type);
      return `
        <div class="nt-notif-item ${unread ? 'nt-notif-unread' : 'nt-notif-read'}" data-nt-id="${esc(n.id)}">
          <div class="nt-notif-item-row">
            <div class="nt-notif-item-main" role="link" tabindex="0" aria-label="Abrir notificação">
              <div class="nt-notif-item-title-row">
                <span class="nt-notif-type-icon" aria-hidden="true">${icon}</span>
                <span class="nt-notif-item-title">${esc(n.title)}</span>
              </div>
              <div class="nt-notif-item-msg">${esc(n.message)}</div>
              <div class="nt-notif-item-time">${esc(_fmtRelativeTime(n.createdAt))}</div>
            </div>
            ${unread ? `<button type="button" class="nt-notif-readbtn" data-nt-mark="${esc(n.id)}" title="Marcar como lido">Marcar como lido</button>` : ''}
          </div>
        </div>`;
    }).join('');

    body.querySelectorAll('.nt-notif-item').forEach(itemEl => {
      const id = itemEl.getAttribute('data-nt-id');
      const n = recent.find(x => x.id === id);
      if (!n) return;
      const main = itemEl.querySelector('.nt-notif-item-main');
      const btn = itemEl.querySelector('.nt-notif-readbtn');

      const open = () => _openNotification(n);

      if (main) {
        main.addEventListener('click', open);
        main.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            open();
          }
        });
      }
      if (btn) {
        btn.addEventListener('click', async e => {
          e.stopPropagation();
          if (window._ntMarkInAppNotificationRead) {
            await window._ntMarkInAppNotificationRead(id);
          }
          renderPanelContent();
          refreshBadge();
          if (window.updateNotifBadge) window.updateNotifBadge();
        });
      }
    });
  }

  function ensurePanel() {
    let p = document.getElementById(PANEL_ID);
    if (p) return p;
    const wrap = document.querySelector('.nt-notif-wrap');
    if (!wrap) return null;
    wrap.insertAdjacentHTML('beforeend', `
      <div id="${PANEL_ID}" class="nt-notif-panel hidden" onclick="event.stopPropagation()">
        <div class="nt-notif-head">
          <div class="nt-notif-head-text">
            <span class="nt-notif-head-title">Notificações</span>
            <span class="nt-notif-head-hint">${NOTIF_PANEL_LIMIT === 1 ? 'Última notificação' : `Últimas ${NOTIF_PANEL_LIMIT} notificações`} · Não lidas primeiro</span>
          </div>
          <button type="button" class="nt-notif-markall" id="nt-notif-markall">Marcar todas como lidas</button>
        </div>
        <div id="nt-notif-list" class="nt-notif-list"></div>
      </div>`);
    p = document.getElementById(PANEL_ID);
    document.getElementById('nt-notif-markall')?.addEventListener('click', async e => {
      e.stopPropagation();
      if (window._ntMarkAllInAppNotificationsRead) {
        await window._ntMarkAllInAppNotificationsRead();
        _toast('Todas as notificações foram marcadas como lidas.', 'success');
      }
      renderPanelContent();
      refreshBadge();
      if (window.updateNotifBadge) window.updateNotifBadge();
    });
    return p;
  }

  function closePanel() {
    const p = document.getElementById(PANEL_ID);
    if (p) p.classList.add('hidden');
  }

  function togglePanel(ev) {
    if (ev) ev.stopPropagation();
    const p = ensurePanel();
    if (!p) return;
    const wasHidden = p.classList.contains('hidden');
    p.classList.toggle('hidden');
    if (wasHidden) renderPanelContent();
  }

  document.addEventListener('click', () => closePanel());

  window._ntRefreshInAppBadge = refreshBadge;
  window._ntGetUnreadInAppCount = getUnreadCount;
  window._ntTogglePanel = togglePanel;
  window._ntClosePanel = closePanel;

  window._ntNotifyCommsPublished = notifyCommsPublished;
  window._ntNotifyPurchaseApproved = notifyPurchaseApproved;
  window._ntNotifyPurchaseCancelRequested = notifyPurchaseCancelRequested;
  window._ntNotifyPurchaseCancelResolved = notifyPurchaseCancelResolved;
  window._ntNotifyPromoForSupervisor = notifyPromoForSupervisor;

  window._ntInitInAppNotifications = function() {
    ensurePanel();
    refreshBadge();
  };

  console.log('✅ notifications-module carregado.');
})();
