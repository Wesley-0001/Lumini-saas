/* =============================================
   RH-DATA.JS — Colaboradores para módulo RH
   Lumini — Gestão de RH & Turnover
   Fonte única: Rh.Lumini.csv (via employees em firebase-db.js).
   Não há mais lista estática (seed) de colaboradores.
============================================= */

// Converte datas do formato M/D/YY para YYYY-MM-DD (formulários / legado)
function _parseDate(s) {
  if (!s || s === '' || s === '0') return '';
  const p = String(s).trim().split('/');
  if (p.length !== 3) return '';
  const m = p[0].padStart(2, '0');
  const d = p[1].padStart(2, '0');
  const yy = parseInt(p[2], 10);
  const yr = yy <= 30 ? 2000 + yy : 1900 + yy;
  return `${yr}-${m}-${d}`;
}

/* ─── MAPEAMENTO CARGO → SETOR ───────────────── */
window._getSetorFromCargo = function (cargo) {
  if (!cargo) return 'Outros';
  const c = cargo.toLowerCase();
  if (c.includes('expediç') || c.includes('expedidor') || c.includes('logística') || c.includes('logistica') || c.includes('estoque')) return 'Expedição';
  if (c.includes('produção') || c.includes('producao') || c.includes('operador') || c.includes('impressor') || c.includes('revisor') || c.includes('líder de impressão') || c.includes('lider de impressao') || c.includes('calandra')) return 'Produção';
  if (c.includes('designer') || c.includes('supervisor designer') || c.includes('supervisor de designer') && !c.includes('vendas')) return 'Designer';
  if (c.includes('supervisor de designer e vendas')) return 'Vendas';
  if (c.includes('vendedor') || c.includes('vendedora') || c.includes('atendente') || c.includes('assistente de vendas') || c.includes('vendas')) return 'Vendas';
  if (c.includes('rh') || c.includes('dp') || c.includes('departamento pessoal') || c.includes('pcp') || c.includes('financeiro') || c.includes('analista') || c.includes('gerente') || c.includes('administrativo') || c.includes('recrutamento') || c.includes('seleção') || c.includes('operações') || c.includes('operacoes') || c.includes('processos') || c.includes('negócio') || c.includes('negocio') || c.includes('consultor') || c.includes('freelancer') || c.includes('estagiário') || c.includes('assistente de pcp') || c.includes('assistente de dep')) return 'Administrativo';
  if (c.includes('limpeza') || c.includes('faxineira') || c.includes('manutenção') || c.includes('manutencao') || c.includes('facilities') || c.includes('ajudante geral') || c.includes('1/2 oficial')) return 'Facilities';
  return 'Outros';
};

window.HR_EMPLOYEES_SEED = [];

/**
 * Converte registro do cache `employees` (planilha/CSV) para o formato da tabela RH.
 */
window.appEmployeesToHREmployees = function (emps) {
  if (!Array.isArray(emps)) return [];
  return emps
    .map(e => {
      const mat = String(e.rhMatricula || e.id || '').trim();
      const nome = String(e.name || '').trim();
      if (!mat || !nome) return null;
      const cargo = String(e.currentRole || '').trim();
      return {
        matricula: mat,
        nome,
        situacao: String(e.rhSituacao || 'ATIVO').trim() || 'ATIVO',
        jornada: String(e.rhJornada || e.rhSituacao || '').trim(),
        matriz: 'NT',
        setor: window._getSetorFromCargo ? window._getSetorFromCargo(cargo) : 'Outros',
        cargo,
        horario: String(e.rhHorario || '').trim(),
        lider: String(e.rhLider || '').trim(),
        admissao: String(e.admission || '').trim(),
        diasContrato: Number(e.rhDiasContrato) || 0,
        demissao: String(e.rhDemissao || '').trim(),
        tipoExame: '',
        dataExame: '',
        telefone: String(e.rhTelefone || '').trim(),
        nascimento: String(e.rhNascimento || '').trim()
      };
    })
    .filter(Boolean);
};

window.getHREmployees = function () {
  if (window._cache && window._cache.hrEmployees && window._cache.hrEmployees.length > 0) {
    return window._cache.hrEmployees;
  }
  if (typeof window.getEmployees === 'function' && typeof window.appEmployeesToHREmployees === 'function') {
    const emps = window.getEmployees();
    if (emps && emps.length) return window.appEmployeesToHREmployees(emps);
  }
  return window.HR_EMPLOYEES_SEED || [];
};

window.saveHREmployees = function (arr) {
  if (!window._cache) window._cache = {};
  window._cache.hrEmployees = arr;
};
