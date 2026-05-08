/* =============================================
   AUTH-CONFIG.JS — Configuração centralizada de autenticação
   Lumini — Gestão de Carreira & Polivalência

   ▸ Equivale a um arquivo .env (ambiente).
   ▸ Define os e-mails autorizados por papel (role).
   ▸ Líderes (supervisores) são auto-reconhecidos pela coluna LÍDER
     do Rh.Lumini.csv: se o e-mail digitado pertence a um colaborador
     cujo NOME aparece como líder de outros colaboradores, o sistema
     identifica automaticamente o perfil como SUPERVISOR e carrega
     apenas a equipe correspondente.
   ▸ Acesso ADMIN/BOSS/MANAGER/RH NÃO depende do CSV — está vinculado
     às listas abaixo. Para liberar/revogar acesso, edite as listas.

   ▸ Senhas: apenas Firebase Authentication (Console → Authentication → Users).
============================================= */

(function () {
  'use strict';

  // ─── Helpers ────────────────────────────────────
  const norm = (s) => String(s == null ? '' : s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();

  const lower = (s) => String(s == null ? '' : s).trim().toLowerCase();

  // ─── Listas de papéis (env-like) ────────────────
  // Acesso macro / administrativo
  const ADMIN_EMAILS = [
    'admin@lumini.com',
    'admin2@lumini.com',
    'lumini@lumini.com',
    'wesley@lumini.com',
    'gustavo@lumini.com'
  ].map(lower);

  // Diretor Geral — aprovação final de promoções
  const BOSS_EMAILS = [
    'diretor@lumini.com',
    'carlos@lumini.com'
  ].map(lower);

  // Gerente de Produção — aprovação intermediária + visão de equipes
  const MANAGER_EMAILS = [
    'gerente@lumini.com',
    'samuel@lumini.com'
  ].map(lower);

  // Recursos Humanos
  const RH_EMAILS = [
    'rh@lumini.com',
    'rh2@lumini.com'
  ].map(lower);

  // ─── Líderes "extra" ────────────────────────────
  // Líderes que NÃO estão presentes como colaboradores no Rh.Lumini.csv
  // (ex.: GUSTAVO EXPEDIÇÃO aparece apenas na coluna LÍDER, não tem linha
  // própria) — ou líderes com e-mail diferente do EMAIL preenchido no CSV.
  // Mapa: email (lower) → { name (display), leaderKey (LÍDER normalizado) }
  const EXTRA_LEADER_EMAILS = {
    'sup1@lumini.com':        { name: 'Daniel',            leaderKey: 'DANIEL' },
    'sup2@lumini.com':        { name: 'Kauê',              leaderKey: 'KAUE' },
    'sup3@lumini.com':        { name: 'Toni',              leaderKey: 'TONI' },
    'sup4@lumini.com':        { name: 'Hélcio',            leaderKey: 'HELCIO' },
    'gustavo.exp@lumini.com': { name: 'Gustavo Expedição', leaderKey: 'GUSTAVO EXPEDICAO' }
  };

  // RegEx pragmática (não exigimos TLD para preservar e-mails legados @lumini)
  const EMAIL_RE = /^[^\s@]+@[^\s@]+$/;

  // ─── API pública ────────────────────────────────

  /**
   * Valida o formato do e-mail (aceita "user@dominio" e "user@dominio.tld").
   */
  function isValidEmail(email) {
    return EMAIL_RE.test(String(email || '').trim());
  }

  /**
   * Resolve o usuário (role + dados) a partir do e-mail digitado.
   *
   * Ordem de resolução:
   *   1. ADMIN_EMAILS
   *   2. BOSS_EMAILS
   *   3. MANAGER_EMAILS
   *   4. RH_EMAILS
   *   5. EXTRA_LEADER_EMAILS (líderes fora do CSV)
   *   6. CSV: colaborador cuja coluna EMAIL == digitado, e cujo nome aparece
   *      como LÍDER de outros colaboradores → role = supervisor
   *
   * Retorna `null` quando o e-mail não tem acesso autorizado.
   *
   * Formato de retorno:
   *   { role, name, email, leaderKey?, employee? }
   */
  function resolveAuthForEmail(emailRaw) {
    const email = lower(emailRaw);
    if (!email) return null;

    if (ADMIN_EMAILS.includes(email)) {
      return { role: 'admin', name: 'Administrador', email };
    }
    if (BOSS_EMAILS.includes(email)) {
      return { role: 'boss', name: 'Diretor Geral', email };
    }
    if (MANAGER_EMAILS.includes(email)) {
      return { role: 'manager', name: 'Gerente de Produção', email };
    }
    if (RH_EMAILS.includes(email)) {
      return { role: 'rh', name: 'Recursos Humanos', email };
    }

    const extra = EXTRA_LEADER_EMAILS[email];
    if (extra) {
      return {
        role:      'supervisor',
        name:      extra.name,
        email,
        leaderKey: norm(extra.leaderKey)
      };
    }

    // Fallback: cruzar com o Rh.Lumini.csv (coluna EMAIL).
    const emps = (typeof window.getEmployees === 'function')
      ? (window.getEmployees() || [])
      : [];

    const me = emps.find(e => lower(e && e.rhEmail) === email);
    if (me) {
      const myNameKey = norm(me.name);
      // É líder se o seu nome aparece como supervisor/LÍDER de algum colaborador.
      const isLeader = !!myNameKey && emps.some(e2 => {
        const supKey = norm(e2.supervisor || e2.rhLider || '');
        return supKey && supKey === myNameKey;
      });
      if (isLeader) {
        return {
          role:      'supervisor',
          name:      me.name,
          email,
          leaderKey: myNameKey,
          employee:  me
        };
      }
    }

    return null;
  }

  // ─── Expõe no window ────────────────────────────
  window.LUMINI_AUTH_CONFIG = {
    ADMIN_EMAILS,
    BOSS_EMAILS,
    MANAGER_EMAILS,
    RH_EMAILS,
    EXTRA_LEADER_EMAILS,
    isValidEmail,
    resolveAuthForEmail
  };
})();
