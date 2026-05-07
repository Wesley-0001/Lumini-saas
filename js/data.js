/* =============================================
   DATA.JS — Dados iniciais demo
   Lumini — Gestão de Carreira & Polivalência
============================================= */

const DEMO_USERS = [
  { email: 'admin@lumini',   password: 'Luminiadmin',       role: 'admin',      name: 'Wesley',  supervisor: null },
  { email: 'admin2@lumini',  password: 'Luminiadmin2',      role: 'admin',      name: 'Gustavo', supervisor: null },
  { email: 'diretor@lumini', password: 'Luminidiretor',     role: 'boss',       name: 'Carlos',  supervisor: null },
  { email: 'gerente@lumini', password: 'Luminigerente',     role: 'manager',    name: 'Samuel',  supervisor: null },
  { email: 'sup1@lumini',    password: 'Luminisup1',        role: 'supervisor', name: 'Daniel',  supervisor: true },
  { email: 'sup2@lumini',    password: 'Luminisup2',        role: 'supervisor', name: 'Kauê',    supervisor: true },
  { email: 'sup3@lumini',    password: 'Luminisup3',        role: 'supervisor', name: 'Toni',    supervisor: true },
  { email: 'sup4@lumini',    password: 'Luminisup4',        role: 'supervisor', name: 'Hélcio',  supervisor: true },
  { email: 'rh@lumini',      password: 'Luminirh',          role: 'rh',         name: 'RH',      supervisor: null }
];

/** E-mails antigos → oficiais (login, Firestore, localStorage, supervisor em employees). */
window.LUMINI_LEGACY_EMAIL_MAP = {
  'renato@lumini': 'sup1@lumini',
  'heleno@lumini': 'sup2@lumini',
  'toni@lumini': 'sup3@lumini',
  'helcio@lumini': 'sup4@lumini',
  'andre@lumini': 'gerente@lumini',
  'carlos@lumini': 'diretor@lumini'
};

// Funcionários serão adicionados diretamente no sistema
const DEMO_EMPLOYEES = [];

const DEMO_CAREERS = [

  // ══════════════════════════════════════════
  // ENTRADA: AJUDANTE DE PRODUÇÃO (base de todos)
  // Após 3 meses → escolhe trilha: Calandra ou Revisão
  // ══════════════════════════════════════════
  {
    id: 'car-001',
    name: 'Ajudante de Produção',
    level: 0,
    minMonths: 3,
    competencies: [
      'Auxiliar na preparação da calandra (limpeza, lubrificação, verificação de ferramentas)',
      'Auxiliar a alimentação da máquina com materiais',
      'Realização de simples inspeções visuais (dobras ou sujeira nos materiais, largura do tecido, presença de vincos, identificação da PV/PE)',
      'Transporte de bobinas e matérias-primas com equipamento de movimentação',
      'Preencher check-list, PV e PE operacionais com supervisão',
      'Seguir orientações do supervisor e operador 1',
      'Manter o setor limpo e organizado aplicando a metodologia do 5S',
      'Uso correto dos EPIs',
      'Marcação do ponto no horário correto de entrada, refeição e saída'
    ]
  },

  // ══════════════════════════════════════════
  // TRILHA: OPERADOR DE CALANDRA
  // ══════════════════════════════════════════
  {
    id: 'car-002',
    name: 'Operador de Calandra 1',
    level: 1,
    minMonths: 3,
    competencies: [
      'Configuração da calandra com parâmetros previamente definidos',
      'Operação dos painéis de controle para iniciar e parar a máquina',
      'Ajuste da velocidade e temperatura dentro dos limites definidos de acordo com a estampa',
      'Verificar a qualidade do tecido estampado',
      'Identificar irregularidades (defeitos no desenho, cores, marcas de passada, largura do tecido) e reportar ao supervisor',
      'Retirada do papel queimado quando necessário',
      'Execução de pequenos ajustes durante o processo produtivo',
      'Realizar troca de bobinas e limpeza de rolos',
      'Registro de dados nas ordens produtivas e/ou sistema',
      'Realização do PIC e retirada da peça pronta',
      'Conferência das quantidades a serem produzidas'
    ]
  },
  {
    id: 'car-003',
    name: 'Operador de Calandra 2',
    level: 2,
    minMonths: 9,
    competencies: [
      'Definição de parâmetros de operação com base na ordem de produção e tipo de material',
      'Identificar e corrigir desvios no processo produtivo',
      'Coordenar o trabalho dos operadores de níveis inferiores',
      'Treinar e desenvolver novos operadores',
      'Colaborar com a equipe de manutenção',
      'Facilidade na identificação de falhas no processo produtivo e máquinas',
      'Cumprimento das metas produtivas mantendo qualidade e eficiência',
      'Foco em redução de perdas',
      'Sugestão de melhorias no processo produtivo',
      'Boa comunicação com outros colaboradores',
      'Identificar prioridades de produção conforme informações da supervisão, gerência e diretoria'
    ]
  },
  {
    id: 'car-004',
    name: 'Operador de Calandra 3',
    level: 3,
    minMonths: 16,
    competencies: [
      'Elaborar e revisar procedimentos operacionais e fichas de processos',
      'Liderar a calibração e verificação dos equipamentos',
      'Acompanhar e realizar testes de novos materiais, processos e produtos',
      'Atuar como mentor técnico dos operadores de níveis inferiores',
      'Ser o colaborador de referência para contato em caso de desvios críticos na produção',
      'Avaliar e propor melhorias contínuas',
      'Leitura e interpretação de indicadores de produção e desempenho',
      'Participar de reuniões técnicas',
      'Elaboração de planos de melhoria (Kaizen, 5S, FIFO, PDCA, Kanban)',
      'Capacidade de tomada de decisões rápidas'
    ]
  },

  // ══════════════════════════════════════════
  // TRILHA: REVISOR
  // ══════════════════════════════════════════
  {
    id: 'car-005',
    name: 'Revisor 1',
    level: 1,
    minMonths: 3,
    competencies: [
      'Auxiliar na alimentação e retirada do material das máquinas de revisão',
      'Transporte e organização dos rolos de tecido na área de trabalho',
      'Utilização de tesoura e trena',
      'Capacidade de realizar inspeção visual sob orientação (manchas, furos, fios soltos)',
      'Retirar defeitos aparentes conforme orientação do superior imediato e supervisor',
      'Organização do ambiente de trabalho (retalhos, pontas de tubetes, fita crepe, limpeza da máquina)',
      'Demonstrar proatividade e interesse no aprendizado sobre a parte técnica',
      'Separação dos tecidos conforme orientação (crepe, duna, malha suede, crepe twill, etc)',
      'Participação em treinamentos operacionais',
      'Realização de pequenas manutenções e operar revisadeira',
      'Identificar, classificar e retirar defeitos do material sob supervisão',
      'Preenchimento correto dos dados na folha da revisão',
      'Seguir e assegurar os padrões de qualidade conforme definição da empresa e/ou clientes',
      'Comunicar ocorrências e dúvidas técnicas ao Revisor 2 ou Supervisor',
      'Colaboração com os 5S e zelo pelos patrimônios da empresa',
      'Utilização correta dos EPIs'
    ]
  },
  {
    id: 'car-006',
    name: 'Revisor 2',
    level: 2,
    minMonths: 9,
    competencies: [
      'Operar equipamentos de revisão com domínio técnico (mesa luminosa, revisadeira, rebobinadeira, alinhador, contador de metros)',
      'Identificar e classificar defeitos com maior complexidade (estrias, variação de tonalidade, falhas intermitentes, marcas de passada, defeitos de arquivo, desenho alongado)',
      'Analisar causa e informar defeitos com precisão, seguindo as normas da empresa e clientes',
      'Efetuar a medição e o apontamento técnico completo dos rolos revisados',
      'Avaliar a aceitabilidade dos produtos acabados conforme normas e especificações de clientes',
      'Treinar e avaliar Revisores 1',
      'Boa comunicação',
      'Apoiar o controle de qualidade com informações detalhadas da revisão',
      'Orientar e treinar novos funcionários',
      'Sugerir melhorias no processo de revisão, layout da área e modos de trabalho',
      'Realizar pequenos ajustes nos equipamentos e acionar a manutenção quando necessário'
    ]
  },
  {
    id: 'car-007',
    name: 'Revisor 3',
    level: 3,
    minMonths: 16,
    competencies: [
      'Atuar como referência técnica da equipe de revisão',
      'Assegurar a padronização dos processos de revisão e a excelência do produto acabado',
      'Capacidade de decisão crítica: interrupções da produção, ajustes de processos',
      'Propõe e lidera ações corretivas/preventivas junto a outras áreas',
      'Validar procedimentos e certificar os lotes de produção aprovados da equipe',
      'Propõe melhorias no plano de treinamento operacional',
      'Treina, corrige e avalia Revisores e Ajudantes',
      'Multiplicador dos 5S e normas da empresa',
      'Excelente comunicação com as demais áreas'
    ]
  },

  // ══════════════════════════════════════════
  // TRILHA: IMPRESSOR DIGITAL
  // ══════════════════════════════════════════
  {
    id: 'car-011',
    name: 'Impressor Digital 1',
    level: 1,
    minMonths: 3,
    competencies: [
      'Auxiliar na preparação e setup da impressora digital',
      'Alimentação correta de mídia e substratos',
      'Inspeção visual da impressão digital (cores, alinhamento, banding)',
      'Manter o setor limpo e organizado (5S)',
      'Registro de dados nas ordens produtivas',
      'Uso correto dos EPIs',
      'Seguir orientações do supervisor e impressor digital sênior'
    ]
  },
  {
    id: 'car-012',
    name: 'Impressor Digital 2',
    level: 2,
    minMonths: 9,
    competencies: [
      'Operar impressora digital com autonomia',
      'Ajuste de perfis de cor, RIP e parâmetros de impressão',
      'Identificar e corrigir falhas de qualidade (banding, saturação, alinhamento de cabeças)',
      'Treinar e orientar Impressores Digitais 1',
      'Controle e registro de ordens de produção',
      'Redução de perdas de mídia e tinta',
      'Boa comunicação com equipe e supervisão'
    ]
  },
  {
    id: 'car-013',
    name: 'Impressor Digital 3',
    level: 3,
    minMonths: 16,
    competencies: [
      'Referência técnica em impressão digital',
      'Elaborar e revisar procedimentos e fichas técnicas',
      'Acompanhar testes de novos equipamentos, mídias e tintas',
      'Liderar melhorias contínuas no processo digital',
      'Atuar como mentor da equipe de impressão digital',
      'Participar de reuniões técnicas e de qualidade',
      'Tomada de decisão rápida em desvios críticos de produção'
    ]
  }
];

const DEMO_EVALUATIONS = [];

const DEMO_MATRIX_SKILLS = [
  'Operação de Equipamentos',
  'Leitura de Ordens',
  'Segurança do Trabalho',
  'Controle de Qualidade',
  'Manutenção Básica'
];

/* Questões do formulário de avaliação */
const EVAL_QUESTIONS = {
  tecnica: [
    'Conhece e aplica os procedimentos do cargo?',
    'Opera os equipamentos necessários com segurança?',
    'Atinge as metas de produtividade do cargo?',
    'Demonstra conhecimento técnico suficiente para o cargo desejado?',
    'Passou pelos treinamentos obrigatórios do cargo?'
  ],
  comportamento: [
    'Demonstra pontualidade e assiduidade (ausências justificadas)?',
    'Possui postura profissional adequada?',
    'Trabalha bem em equipe e colabora com colegas?',
    'Recebe e aplica feedbacks com maturidade?',
    'Demonstra iniciativa e proatividade no dia a dia?'
  ],
  seguranca: [
    'Segue todas as normas de segurança (EPI, procedimentos)?',
    'Não possui advertências disciplinares no período avaliado?',
    'Mantém organização e limpeza no posto de trabalho (5S)?',
    'Zela pela qualidade do produto/serviço entregue?'
  ],
  potencial: [
    'Demonstra interesse genuíno na promoção para o cargo desejado?',
    'Tem capacidade de treinar outros funcionários em suas atividades?',
    'Apresenta liderança natural e influência positiva na equipe?'
  ]
};

const STAR_LABELS = ['', 'Abaixo do Esperado', 'Precisa Melhorar', 'Atende ao Esperado', 'Acima do Esperado', 'Excelente'];

// ─── Expõe no window ──────────────────────────
window.DEMO_USERS        = DEMO_USERS;
window.DEMO_EMPLOYEES    = DEMO_EMPLOYEES;

(function _migrateNtUsersCustomFromLegacy() {
  try {
    const leg = window.LUMINI_LEGACY_EMAIL_MAP || {};
    if (!Object.keys(leg).length) return;
    const raw = localStorage.getItem('nt_users_custom');
    if (!raw) return;
    let custom = JSON.parse(raw);
    let changed = false;
    custom = custom.map(u => {
      const key = String(u.email || '').toLowerCase();
      const neu = leg[key];
      if (!neu || neu === u.email) return u;
      changed = true;
      const oldPerms = localStorage.getItem(`nt_perms_${u.email}`);
      const hasNew = localStorage.getItem(`nt_perms_${neu}`);
      if (oldPerms && !hasNew) {
        localStorage.setItem(`nt_perms_${neu}`, oldPerms);
        localStorage.removeItem(`nt_perms_${u.email}`);
      }
      const id = u.id && String(u.id).startsWith('demo-')
        ? 'demo-' + neu.replace(/[@.]/g, '_')
        : u.id;
      return { ...u, email: neu, id };
    });
    const seen = new Set();
    custom = custom.filter(u => {
      const k = String(u.email || '').toLowerCase();
      if (seen.has(k)) { changed = true; return false; }
      seen.add(k);
      return true;
    });
    if (changed) localStorage.setItem('nt_users_custom', JSON.stringify(custom));
  } catch (e) {
    console.warn('[Lumini] Migração nt_users_custom:', e);
  }
})();
window.DEMO_CAREERS      = DEMO_CAREERS;
window.DEMO_EVALUATIONS  = DEMO_EVALUATIONS;
window.DEMO_MATRIX_SKILLS = DEMO_MATRIX_SKILLS;
window.EVAL_QUESTIONS    = EVAL_QUESTIONS;
window.STAR_LABELS       = STAR_LABELS;
