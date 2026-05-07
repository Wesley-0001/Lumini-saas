/* =============================================
   FIREBASE-DB.JS — Banco de dados em nuvem
   New Time — Gestão de Carreira & Polivalência
   
   Projeto: new-time-2fa19
   Firestore em nuvem (Google Firebase)
============================================= */

// ─── SDK Firebase via CDN ───────────────────
import { initializeApp }       from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, doc, getDocs, getDoc, setDoc, deleteDoc, writeBatch, onSnapshot, query, where, updateDoc, addDoc, Timestamp }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ─── Configuração do projeto — New Time ─────
const firebaseConfig = {
  apiKey:            "AIzaSyAVB6QZCUE4fUyrFMh7Oex0rcNRLVP9uI",
  authDomain:        "lumini-sabor-nt.firebaseapp.com",
  projectId:         "lumini-sabor-nt",
  storageBucket:     "lumini-sabor-nt.firebasestorage.app",
  messagingSenderId: "622572697165",
  appId:             "1:622572697165:web:8b2d201870b39dc88b0e04"
};

const firebaseApp = initializeApp(firebaseConfig);
const db          = getFirestore(firebaseApp);

/** Histórico de comunicados (Comunicação Interna); notificações do sino permanecem em in_app_notifications. */
const INTERNAL_COMMS_COL = 'internal_comms';

// ─── Cache em memória ────────────────────────
window._cache = {
  employees:   [],
  careers:     [],
  evaluations: [],
  excecoes:    [],
  teams:       [],
  // Novos módulos
  purchases:   [],
  suppliers:   [],
  products:    [],
  users:       [],
  notifications: [],
  internalComms: []
};
window._dbReady = false;

let _ntInAppUnsub = null;

// ─── Fonte RH local: CSV (prioritário) ou XLSX ──
const _LUMINI_CSV_DEFAULT = 'Rh.Lumini.csv';
const _LUMINI_XLSX_DEFAULT = 'Rh.Lumini.xlsx';

/** Chave estável para filtro de equipe (coluna LÍDER): sem acentos, maiúsculas. */
function _normalizeLiderKey(s) {
  return String(s == null ? '' : s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}
window._ntNormalizeLiderKey = _normalizeLiderKey;

function _luminiFmtDate(v) {
  if (v == null || v === '' || v === '0' || v === 'undefined') return '';
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim();
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1) return `${m1[3]}-${m1[2].padStart(2, '0')}-${m1[1].padStart(2, '0')}`;
  const m2 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m2) return `${m2[1]}-${m2[2].padStart(2, '0')}-${m2[3].padStart(2, '0')}`;
  return s;
}

/** Extrai campos de uma linha bruta do XLSX (padrão xlsx-reader.html). */
function _luminiRawRowToFields(r) {
  const keys = Object.keys(r || {});
  const get = (patterns) => {
    for (const p of patterns) {
      const k = keys.find(kk => kk.toUpperCase().includes(p.toUpperCase()));
      if (k && r[k] !== undefined && r[k] !== '') return String(r[k]).trim();
    }
    return '';
  };

  const mat     = get(['MATR', 'MAT']);
  const nome    = get(['COLAB', 'NOME', 'NAME']);
  const sit     = get(['SITUA', 'STATUS', 'SIT']);
  const jornada = get(['JORNA', 'JORN']);
  const matriz  = get(['MATRIZ', 'UNID', 'UNIT']);
  const cargo   = get(['CARGO', 'FUNCAO', 'FUNÇÃO', 'ROLE']);
  const horario = get(['HORÁR', 'HORAR', 'HORA']);
  const lider   = get(['LÍDER', 'LIDER', 'LIDERAN', 'GESTOR', 'SUPER']);
  const adm     = _luminiFmtDate(get(['ADMISS', 'ENTRADA', 'INICIO']));
  const dias    = get(['DIAS', 'PERIOD']);
  const dem     = _luminiFmtDate(get(['DEMISS', 'SAIDA', 'SAÍDA', 'DESLI']));
  const tipoEx  = get(['TIPO DE EX', 'TIPO EX', 'EXAM TYPE']);
  const dataEx  = _luminiFmtDate(get(['DATA DO EX', 'DATA EX', 'EXAM DATE']));
  const tel     = get(['TELEF', 'FONE', 'PHONE', 'CELUL']);
  const nasc    = _luminiFmtDate(get(['NASCI', 'BIRTH', 'DATA NASC']));
  const email   = get(['E-MAIL', 'EMAIL', 'E MAIL', 'MAIL']);

  return { mat, nome, sit, jornada, matriz, cargo, horario, lider, adm, dias, dem, tipoEx, dataEx, tel, nasc, email };
}

/** Converte registro Lumini (campos já extraídos) para o formato employee do app. */
function _luminiFieldsToEmployee(f, index) {
  const mat = f.mat ? String(f.mat).replace(/\s+/g, '').trim() : '';
  const nome = (f.nome || '').trim();
  const id = mat || `lumini-row-${index}`;

  let promoObs = '';
  if (f.sit && String(f.sit).trim()) promoObs = `[RH] ${String(f.sit).trim()}`;
  if (f.dem) promoObs = (promoObs ? promoObs + ' · ' : '') + `Demissão: ${f.dem}`;

  const rhHorario = (f.horario || '').trim();
  const m = rhHorario.match(/(\d{1,2})\s*[:h]\s*(\d{2})?/i) || rhHorario.match(/\b(\d{1,2})\b/);
  const startHour = m ? Math.max(0, Math.min(23, parseInt(m[1], 10))) : null;
  const shift =
    startHour == null ? null :
    startHour < 12 ? 'manha' :
    startHour < 18 ? 'tarde' : 'noite';

  const liderRaw = (f.lider || '').trim();
  const supervisorKey = liderRaw ? _normalizeLiderKey(liderRaw) : '';
  const diasStr = f.dias != null ? String(f.dias).replace(/\D/g, '') : '';
  const rhDiasContrato = diasStr ? (parseInt(diasStr, 10) || 0) : 0;

  return {
    id,
    rhMatricula: mat || null,
    name: nome || `Colaborador ${index + 1}`,
    admission: f.adm || '',
    sector: (f.matriz || '').trim() || 'Produção',
    currentRole: (f.cargo || '').trim() || 'Ajudante de Produção',
    desiredRole: null,
    minMonths: null,
    supervisor: supervisorKey,
    rhLider: liderRaw,
    rhSituacao: (f.sit || '').trim() || 'ATIVO',
    rhJornada: ((f.jornada || '').trim() || (f.sit || '').trim() || ''),
    rhDiasContrato,
    rhDemissao: f.dem || '',
    rhNascimento: f.nasc || '',
    rhTelefone: (f.tel || '').trim(),
    rhHorario: rhHorario || null,
    rhEmail: String(f.email || '').trim().toLowerCase(),
    shift: shift || null,
    status: 'registered',
    promoObs,
    skills: {}
  };
}

function parseRhLuminiCsvToRows(csvText) {
  const text = String(csvText || '').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter(line => line.length);
  if (!lines.length) return [];
  const delim = ';';
  const headers = lines[0].split(delim).map(h => h.trim());
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(delim);
    const row = {};
    let any = false;
    headers.forEach((h, j) => {
      const v = cells[j] !== undefined ? String(cells[j]).trim() : '';
      row[h] = v;
      if (v) any = true;
    });
    if (!any) continue;
    out.push(row);
  }
  return out;
}

function _luminiFieldsFromCsvRow(row) {
  const keys = Object.keys(row || {});
  const normK = k =>
    String(k)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase();
  const idx = {};
  keys.forEach(k => {
    idx[normK(k)] = k;
  });
  const getNorm = patterns => {
    for (const p of patterns) {
      const up = p.toUpperCase();
      for (const nk of Object.keys(idx)) {
        if (nk.includes(up)) return String(row[idx[nk]] || '').trim();
      }
    }
    return '';
  };
  return {
    mat: getNorm(['MATRIC', 'MAT']),
    nome: getNorm(['COLAB', 'NOME', 'NAME']),
    sit: getNorm(['SITUA', 'STATUS', 'SIT']),
    jornada: getNorm(['JORNA', 'JORN']),
    matriz: getNorm(['MATRIZ', 'UNID', 'UNIT']) || 'NT',
    cargo: getNorm(['CARGO', 'FUNCAO', 'FUNÇÃO', 'ROLE']),
    horario: getNorm(['HORÁR', 'HORAR', 'HORA']),
    lider: getNorm(['LIDER', 'LÍDER', 'GESTOR', 'SUPER']),
    adm: _luminiFmtDate(getNorm(['ADMISS', 'ENTRADA', 'INICIO'])),
    dias: getNorm(['DIAS', 'CONTRAT', 'PERIOD']),
    dem: _luminiFmtDate(getNorm(['DEMISS', 'SAIDA', 'SAÍDA', 'DESLI'])),
    tipoEx: getNorm(['TIPO DE EX', 'TIPO EX', 'EXAM TYPE']),
    dataEx: _luminiFmtDate(getNorm(['DATA DO EX', 'DATA EX', 'EXAM DATE'])),
    tel: getNorm(['TELEF', 'FONE', 'PHONE', 'CELUL']),
    nasc: _luminiFmtDate(getNorm(['NASCI', 'BIRTH', 'NASCIMENTO', 'DATA NASC'])),
    email: getNorm(['E-MAIL', 'EMAIL', 'E MAIL', 'MAIL'])
  };
}

async function fetchEmployeesFromLuminiCsv() {
  const url = String(window.LUMINI_EMPLOYEES_CSV_URL || _LUMINI_CSV_DEFAULT).trim();
  const res = await fetch(url, { method: 'GET', cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const rawRows = parseRhLuminiCsvToRows(text);
  const employees = [];
  rawRows.forEach((raw, i) => {
    const f = _luminiFieldsFromCsvRow(raw);
    const mat = f.mat ? String(f.mat).replace(/\s+/g, '').trim() : '';
    const nome = (f.nome || '').trim();
    if (!mat || !nome) return;
    employees.push(_luminiFieldsToEmployee(f, i));
  });
  if (!employees.length) throw new Error('CSV sem colaboradores válidos (MATRÍCULA + COLABORADOR)');
  return employees;
}

async function fetchEmployeesFromLuminiXlsx() {
  if (typeof XLSX === 'undefined') throw new Error('Biblioteca XLSX não carregada');
  const url = String(window.LUMINI_EMPLOYEES_XLSX_URL || _LUMINI_XLSX_DEFAULT).trim();
  const res = await fetch(url, { method: 'GET', cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('Planilha vazia');
  const rows = XLSX.utils.sheet_to_json(ws, { raw: false, dateNF: 'yyyy-mm-dd' });
  if (!Array.isArray(rows)) throw new Error('Leitura inválida');
  return rows.map((row, i) => _luminiFieldsToEmployee(_luminiRawRowToFields(row), i));
}

/** Employees: Rh.Lumini.csv (delimitador ;) → fallback XLSX → Firestore. */
async function loadEmployeesWithSheetFallback() {
  try {
    const data = await fetchEmployeesFromLuminiCsv();
    console.log('[RH CSV] employees carregados:', data.length);
    window._employeesFromSheet = true;
    window._employeesSheetSource = 'csv';
    return data;
  } catch (eCsv) {
    console.warn('[RH CSV] falha:', eCsv && eCsv.message ? eCsv.message : eCsv);
  }
  try {
    const data = await fetchEmployeesFromLuminiXlsx();
    console.log('[PLANILHA XLSX] employees carregados:', data.length);
    window._employeesFromSheet = true;
    window._employeesSheetSource = 'xlsx';
    return data;
  } catch (e) {
    console.warn('[PLANILHA] falha, usando Firestore:', e && e.message ? e.message : e);
    window._employeesFromSheet = false;
    window._employeesSheetSource = 'firestore';
    return loadCollection('employees');
  }
}

// ─── Carrega coleção do Firestore ────────────
async function loadCollection(name) {
  console.log('[BOOT] antes getDocs coleção:', name, '(Promise.all)');
  const snap = await getDocs(collection(db, name));
  console.log('[BOOT] ok getDocs coleção:', name, '(Promise.all)', `(${snap.size} docs)`);
  return snap.docs.map(d => ({ ...d.data(), id: d.id }));
}

function _luminiCanonEmail(em) {
  const leg = typeof window !== 'undefined' && window.LUMINI_LEGACY_EMAIL_MAP ? window.LUMINI_LEGACY_EMAIL_MAP : {};
  const k = String(em || '').trim().toLowerCase();
  return leg[k] ? leg[k] : em;
}

function _dedupeUsersByEmail(usrs) {
  const seen = new Set();
  const out = [];
  for (const u of usrs) {
    const em = String(u.email || '').trim().toLowerCase();
    if (!em) {
      out.push(u);
      continue;
    }
    if (seen.has(em)) {
      console.warn('[Lumini] Registro em users com e-mail duplicado ignorado na migração:', u.id, em);
      continue;
    }
    seen.add(em);
    out.push(u);
  }
  return out;
}

function _migrateLuminiFirestoreUsersEmployeesExcecoes(usrs, emps, excs) {
  let usersTouched = false;
  const mu = _dedupeUsersByEmail(
    usrs.map(u => {
      const ne = _luminiCanonEmail(u.email);
      if (ne !== u.email) usersTouched = true;
      return { ...u, email: ne };
    })
  );
  if (mu.length !== usrs.length) usersTouched = true;

  let empsTouched = false;
  const me = emps.map(e => {
    const s = e.supervisor;
    if (!s) return e;
    const ns = _luminiCanonEmail(s);
    if (ns !== s) empsTouched = true;
    return { ...e, supervisor: ns };
  });

  let excTouched = false;
  const mx = excs.map(ex => {
    const s = ex.supervisor;
    if (!s) return ex;
    const ns = _luminiCanonEmail(s);
    if (ns !== s) excTouched = true;
    return { ...ex, supervisor: ns };
  });

  return { usrs: mu, emps: me, excs: mx, usersTouched, empsTouched, excTouched };
}

// ─── Salva array inteiro via batch ───────────
async function persistCollection(name, arr) {
  try {
    const batch = writeBatch(db);
    arr.forEach(item => {
      const ref   = doc(db, name, String(item.id));
      const clean = JSON.parse(JSON.stringify(item)); // remove undefined
      batch.set(ref, clean, { merge: true });
    });
    await batch.commit();
  } catch(e) {
    console.error(`[Firebase] Erro ao salvar ${name}:`, e);
  }
}

// ─── Apaga e re-insere uma coleção inteira ───
async function wipeAndSeed(name, data) {
  try {
    console.log(`[BOOT] antes getDocs coleção: ${name} (wipeAndSeed)`);
    const snap  = await getDocs(collection(db, name));
    console.log(`[BOOT] ok getDocs coleção: ${name} (wipeAndSeed)`, `(${snap.size} docs)`);
    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    if (data.length > 0) await persistCollection(name, data);
    console.log(`✅ ${name} re-populado com ${data.length} registros.`);
  } catch(e) {
    console.error(`[Firebase] Erro ao resetar ${name}:`, e);
  }
}

// ─── Seed automático (desativado) ────────────
async function seedIfNeeded() {
  console.log('[BOOT] seed automático desativado (seedIfNeeded).');
}

// ─── Reset manual (console do browser) ───────
window.resetFirebaseData = async function() {
  if (!confirm('⚠️ Isso vai APAGAR TODOS os dados no Firebase! Confirma?')) return;
  console.log('🔄 Resetando dados...');
  showLoadingScreen(true);
  await wipeAndSeed('employees',   []);
  await wipeAndSeed('evaluations', []);
  await wipeAndSeed('excecoes',    []);
  await wipeAndSeed('teams',       []);
  // Recria carreiras
  await wipeAndSeed('careers', window.DEMO_CAREERS || []);
  console.log('✅ Reset concluído! Recarregando...');
  setTimeout(() => location.reload(), 1500);
};

// ─── BOOT: carrega tudo e inicializa app ─────
window.initFirebase = async function() {
  try {
    showLoadingScreen(true);

    await seedIfNeeded();

    // Carrega tudo para o cache
    let [emps, cars, evals, excs, tms, purs, sups, prods, usrs] = await Promise.all([
      loadEmployeesWithSheetFallback(),
      loadCollection('careers'),
      loadCollection('evaluations'),
      loadCollection('excecoes'),
      loadCollection('teams'),
      loadCollection('purchases'),
      loadCollection('suppliers'),
      loadCollection('products'),
      loadCollection('users')
    ]);

    // ── Limpa employees sem vínculo RH (cadastrados manualmente, ex: Caio, Leonardo) — só se veio do Firestore ──
    const manualEmps = !window._employeesFromSheet ? emps.filter(e => !e.rhMatricula) : [];
    if (manualEmps.length > 0) {
      console.warn(`🧹 Removendo ${manualEmps.length} funcionário(s) sem vínculo RH (cadastro manual):`,
        manualEmps.map(e => e.name));
      try {
        const cleanBatch = writeBatch(db);
        manualEmps.forEach(e => cleanBatch.delete(doc(db, 'employees', String(e.id))));
        await cleanBatch.commit();
        console.log('✅ Funcionários manuais removidos com sucesso.');
      } catch(err) {
        console.error('❌ Erro ao remover funcionários manuais:', err.message);
      }
    }
    // Planilha: todos os registros com nome; Firestore: apenas com matrícula RH (comportamento anterior)
    const validEmps = window._employeesFromSheet
      ? emps.filter(e => e.name && String(e.name).trim())
      : emps.filter(e => e.rhMatricula);

    const mig = _migrateLuminiFirestoreUsersEmployeesExcecoes(usrs, validEmps, excs);
    usrs = mig.usrs;
    const migratedEmps = mig.emps;
    excs = mig.excs;
    if (mig.usersTouched) {
      console.log('[Lumini] Atualizando e-mails legacy na coleção users');
      await persistCollection('users', usrs);
    }
    if (mig.empsTouched && !window._employeesFromSheet) {
      console.log('[Lumini] Atualizando supervisor (e-mails legacy) em employees');
      await persistCollection('employees', migratedEmps);
    }
    if (mig.excTouched) {
      await persistCollection('excecoes', excs);
    }

    window._cache.employees   = migratedEmps;
    if (window._employeesFromSheet && typeof window.appEmployeesToHREmployees === 'function') {
      window._cache.hrEmployees = window.appEmployeesToHREmployees(migratedEmps);
    }
    window._cache.careers     = cars;
    window._cache.evaluations = evals;
    window._cache.excecoes    = excs;
    window._cache.teams       = tms;
    window._cache.purchases   = purs;
    window._cache.suppliers   = sups;
    window._cache.products    = prods;
    window._cache.users       = usrs;

    window._dbReady = true;

    // Escuta mudanças em tempo real
    listenRealtime();

    // Esconde loading, mostra login
    showLoadingScreen(false);
    const loginPage = document.getElementById('page-login');
    if (loginPage) loginPage.style.display = '';
    window.bootApp();

  } catch(e) {
    console.error('[Firebase] Erro no boot:', e);
    showLoadingScreen(false, true);
  }
};

// ─── Listener tempo real ─────────────────────
function listenRealtime() {
  // Funcionários — filtra cadastros manuais (sem rhMatricula). Planilha: não sobrescreve o cache.
  onSnapshot(collection(db, 'employees'), snap => {
    if (!window._dbReady) return;
    if (window._employeesFromSheet) return;
    window._cache.employees = snap.docs
      .map(d => ({ ...d.data(), id: d.id }))
      .filter(e => e.rhMatricula); // ignora cadastros manuais
    if (window.currentUser && window.updateNotifBadge) {
      window.updateNotifBadge();
      window.updateExcecoesBadges && window.updateExcecoesBadges();
    }
    if (window.currentPage && window.refreshCurrentPage) {
      window.refreshCurrentPage();
    }
  });

  // Exceções
  onSnapshot(collection(db, 'excecoes'), snap => {
    if (!window._dbReady) return;
    window._cache.excecoes = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    if (window.updateExcecoesBadges) window.updateExcecoesBadges();
    if (window.currentPage && window.refreshCurrentPage) {
      window.refreshCurrentPage();
    }
  });

  // Avaliações
  onSnapshot(collection(db, 'evaluations'), snap => {
    if (!window._dbReady) return;
    window._cache.evaluations = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    if (window.currentPage && window.refreshCurrentPage) {
      window.refreshCurrentPage();
    }
  });

  // Equipes de Produção
  onSnapshot(collection(db, 'teams'), snap => {
    if (!window._dbReady) return;
    window._cache.teams = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    if (window.currentPage && window.refreshCurrentPage) {
      window.refreshCurrentPage();
    }
  });

  // Compras
  onSnapshot(collection(db, 'purchases'), snap => {
    if (!window._dbReady) return;
    window._cache.purchases = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    if (window.currentPage === 'purchases' && window.refreshCurrentPage) window.refreshCurrentPage();
  });

  // Fornecedores
  onSnapshot(collection(db, 'suppliers'), snap => {
    if (!window._dbReady) return;
    window._cache.suppliers = snap.docs.map(d => ({ ...d.data(), id: d.id }));
  });

  // Produtos
  onSnapshot(collection(db, 'products'), snap => {
    if (!window._dbReady) return;
    window._cache.products = snap.docs.map(d => ({ ...d.data(), id: d.id }));
  });

  // Comunicação interna (histórico compartilhado; o sino continua em in_app_notifications)
  onSnapshot(collection(db, INTERNAL_COMMS_COL), snap => {
    if (!window._dbReady) return;
    window._cache.internalComms = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    console.log('[Comms DEBUG] snapshot internal_comms:', window._cache.internalComms.length, 'docs');
    if (window.currentPage === 'comms' && window._commsRender) window._commsRender();
  }, err => console.warn('[internal_comms]', err && err.message ? err.message : err));
}

// ─── FUNÇÕES SÍNCRONAS (usadas pelo app.js) ──
// Leem/escrevem no cache e salvam no Firebase em background.

window.getEmployees = function() { return window._cache.employees || []; };
window.saveEmployees = function(arr) {
  window._cache.employees = arr;
  persistCollection('employees', arr);
};

window.getCareers = function() { return window._cache.careers || []; };
window.saveCareers = function(arr) {
  window._cache.careers = arr;
  persistCollection('careers', arr);
};

window.getEvaluations = function() { return window._cache.evaluations || []; };
window.saveEvaluations = function(arr) {
  window._cache.evaluations = arr;
  persistCollection('evaluations', arr);
};

window.getExcecoes = function() { return window._cache.excecoes || []; };
window.saveExcecoes = function(arr) {
  window._cache.excecoes = arr;
  persistCollection('excecoes', arr);
};

window.getTeams = function() { return window._cache.teams || []; };
window.saveTeams = function(arr) {
  window._cache.teams = arr;
  persistCollection('teams', arr);
};

// Alias usado pelo teams-module.js
window.persistTeams = function(arr) {
  window._cache.teams = arr;
  persistCollection('teams', arr);
};

// ─── FUNÇÕES COMPRAS / FORNECEDORES / PRODUTOS ──
window.persistCollection = persistCollection; // expõe para os módulos

window.getSuppliers = function() { return window._cache.suppliers || []; };
window.saveSuppliers = function(arr) {
  window._cache.suppliers = arr;
  persistCollection('suppliers', arr);
};

window.getProducts = function() { return window._cache.products || []; };
window.saveProducts = function(arr) {
  window._cache.products = arr;
  persistCollection('products', arr);
};

window.getPurchases = function() { return window._cache.purchases || []; };
window.savePurchases = function(arr) {
  window._cache.purchases = arr;
  persistCollection('purchases', arr);
};

// ─── Notificações in-app (coleção: in_app_notifications) ──
const IN_APP_COL = 'in_app_notifications';

window._ntSubscribeInAppNotifications = function(userEmail) {
  if (_ntInAppUnsub) {
    try { _ntInAppUnsub(); } catch (_) {}
    _ntInAppUnsub = null;
  }
  if (!userEmail || !window._dbReady) {
    window._cache.notifications = [];
    return;
  }
  const em = String(userEmail).trim().toLowerCase();
  const q = query(collection(db, IN_APP_COL), where('userEmail', '==', em));
  _ntInAppUnsub = onSnapshot(q, snap => {
    window._cache.notifications = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    if (window.updateNotifBadge) window.updateNotifBadge();
    else if (window._ntRefreshInAppBadge) window._ntRefreshInAppBadge();
  }, err => console.warn('[in_app_notifications]', err.message));
};

window._ntUnsubscribeInAppNotifications = function() {
  if (_ntInAppUnsub) {
    try { _ntInAppUnsub(); } catch (_) {}
    _ntInAppUnsub = null;
  }
  window._cache.notifications = [];
};

window._ntAddInAppNotification = async function(n) {
  const id = n.id || ('ntn-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10));
  const clean = JSON.parse(JSON.stringify({ ...n, id, read: !!n.read, createdAt: n.createdAt || Date.now() }));
  await setDoc(doc(db, IN_APP_COL, id), clean);
  return id;
};

window._ntBatchAddInAppNotifications = async function(list) {
  if (!list || !list.length) return;
  const chunk = 450;
  for (let i = 0; i < list.length; i += chunk) {
    const batch = writeBatch(db);
    list.slice(i, i + chunk).forEach(raw => {
      const id = raw.id || ('ntn-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10));
      const clean = JSON.parse(JSON.stringify({
        ...raw, id, read: !!raw.read, createdAt: raw.createdAt || Date.now()
      }));
      batch.set(doc(db, IN_APP_COL, id), clean);
    });
    await batch.commit();
  }
};

window._ntMarkInAppNotificationRead = async function(id) {
  if (!id) return;
  await updateDoc(doc(db, IN_APP_COL, id), { read: true });
};

window._ntMarkAllInAppNotificationsRead = async function() {
  const arr = window._cache.notifications || [];
  const unread = arr.filter(n => !n.read);
  for (let i = 0; i < unread.length; i += 450) {
    const batch = writeBatch(db);
    unread.slice(i, i + 450).forEach(n => {
      if (n.id) batch.update(doc(db, IN_APP_COL, n.id), { read: true });
    });
    await batch.commit();
  }
};

/** Grava um comunicado no Firestore (mesmo payload do módulo; merge para atualizar readBy). */
window._ntPersistInternalComm = async function(item) {
  if (!item || !item.id || !window._dbReady) return;
  try {
    const clean = JSON.parse(JSON.stringify(item));
    await setDoc(doc(db, INTERNAL_COMMS_COL, String(item.id)), clean, { merge: true });
    console.log('[Comms DEBUG] persist internal_comms docId=', item.id);
  } catch (e) {
    console.warn('[internal_comms] persist:', e && e.message ? e.message : e);
  }
};

/** Coleção Firestore usada pelo portal e pelo módulo RH (holerites). */
const HOLERITES_COL = 'holerites';

/**
 * TEMPORÁRIO (demo / ambiente local): grava o PDF em Firestore como data URL — sem Firebase Storage
 * (evita CORS no Storage). NÃO usar em produção: limite de 1 MiB por documento no Firestore.
 *
 * @param {{ employeeId: string, employeeName: string, rhMatricula: string, competence: string, fileName: string, fileDataUrl: string, uploadedBy: string }} opts
 * @returns {Promise<{ id: string }>}
 */
window._ntPublishHolerite = async function(opts) {
  if (!window._dbReady) throw new Error('Firebase ainda não está pronto. Aguarde e tente de novo.');
  const employeeId    = String(opts.employeeId || '').trim();
  const employeeName  = String(opts.employeeName || '').trim();
  const rhMatricula   = String(opts.rhMatricula || '').trim();
  const competence    = String(opts.competence || '').trim();
  const fileDataUrl   = String(opts.fileDataUrl || '').trim();
  const uploadedBy    = String(opts.uploadedBy || '').trim();
  const rawName       = String(opts.fileName || 'holerite.pdf').trim();

  if (!employeeId || !fileDataUrl) throw new Error('Colaborador e arquivo são obrigatórios.');
  if (!competence) throw new Error('Informe a competência (mês/ano de referência).');
  if (!/^data:application\/pdf/i.test(fileDataUrl)) {
    throw new Error('Conteúdo inválido: era esperado um PDF (data URL).');
  }
  /* Firestore: documento máx. ~1 MiB — reforço no servidor de dados */
  if (fileDataUrl.length > 950000) {
    throw new Error('PDF muito grande para gravar no Firestore neste modo demo. Use um arquivo menor.');
  }

  const safeBase = rawName
    .replace(/[^\w.\-()\s\u00C0-\u024F]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 180);

  const now = Timestamp.now();
  const payload = {
    employeeId,
    employeeName,
    rhMatricula,
    competence,
    competencia: competence,
    fileName: rawName || safeBase,
    nomeArquivo: rawName || safeBase,
    fileDataUrl,
    uploadedAt: now,
    publishedAt: now,
    dataPublicacao: now,
    uploadedBy,
    status: 'published',
    _demoInlinePdfFirestore: true
  };
  const docRef = await addDoc(collection(db, HOLERITES_COL), payload);
  return { id: docRef.id };
};

/** Frequência / ocorrências — portal lê por `employeeId`; supervisão registra. */
const EMPLOYEE_EVENTS_COL = 'employee_events';

/**
 * Registra ocorrência (falta, folga, turno cancelado) na coleção employee_events.
 *
 * @param {{ employeeId: string, employeeName: string, rhMatricula?: string, type: string, date: string, description?: string, createdBy: string }} opts
 * @returns {Promise<{ id: string }>}
 */
window._ntPublishEmployeeEvent = async function(opts) {
  if (!window._dbReady) throw new Error('Firebase ainda não está pronto. Aguarde e tente de novo.');
  const employeeId   = String(opts.employeeId || '').trim();
  const employeeName = String(opts.employeeName || '').trim();
  const rhMatricula  = String(opts.rhMatricula || '').trim();
  const type         = String(opts.type || '').trim();
  const dateStr      = String(opts.date || '').trim();
  const description  = String(opts.description || '').trim();
  const createdBy    = String(opts.createdBy || '').trim();

  if (!employeeId || !employeeName) throw new Error('Colaborador inválido.');
  if (!dateStr) throw new Error('Informe a data.');
  const allowed = ['falta', 'folga', 'turno_cancelado'];
  if (!allowed.includes(type)) throw new Error('Tipo de ocorrência inválido.');
  if (!createdBy) throw new Error('Usuário não identificado.');

  const now = Timestamp.now();
  const payload = {
    employeeId,
    employeeName,
    rhMatricula,
    type,
    date: dateStr,
    description: description || '',
    createdAt: now,
    createdBy
  };
  const docRef = await addDoc(collection(db, EMPLOYEE_EVENTS_COL), payload);
  return { id: docRef.id };
};

/** Frequência diária por equipe (supervisor) — coleção `daily_attendance`. */
const DAILY_ATTENDANCE_COL = 'daily_attendance';

function _ntDailyAttendanceDocId(teamId, dateStr) {
  const t = String(teamId || '').trim().replace(/\//g, '_');
  const d = String(dateStr || '').trim();
  return `${t}_${d}`;
}

/**
 * Busca documento de frequência do dia para a equipe (teamId = e-mail do supervisor / escopo).
 * @returns {Promise<{ exists: boolean, docId: string, data: object|null }>}
 */
window._ntGetDailyAttendance = async function(teamId, dateStr) {
  if (!window._dbReady) throw new Error('Firebase ainda não está pronto. Aguarde e tente de novo.');
  const tid = String(teamId || '').trim();
  const d = String(dateStr || '').trim();
  if (!tid || !d) throw new Error('Equipe e data são obrigatórios.');
  const docId = _ntDailyAttendanceDocId(tid, d);
  const ref = doc(db, DAILY_ATTENDANCE_COL, docId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return { exists: false, docId, data: null };
  return { exists: true, docId, data: { id: snap.id, ...snap.data() } };
};

/**
 * Cria ou atualiza frequência do dia (setDoc com merge; não duplica documento).
 *
 * Cada registro é serializado com metadados de auditoria por linha:
 *   { employeeId, status, createdBy, createdRole, updatedBy, updatedRole, updatedAt }
 *
 * Linhas alteradas por Admin/Gerente após o lançamento original do Supervisor
 * podem ser detectadas no carregamento (updatedRole ∈ ['admin','manager'] e
 * updatedBy !== createdBy) — habilitando o indicador visual "(editado)".
 *
 * @param {{
 *   teamId: string,
 *   date: string,
 *   status?: 'open'|'closed',
 *   records: Array<{employeeId:string,status:string}>,
 *   savedBy: string,
 *   savedRole?: string,
 *   isNew: boolean,
 *   priorRecords?: Array<object>
 * }} opts
 */
window._ntSaveDailyAttendance = async function(opts) {
  if (!window._dbReady) throw new Error('Firebase ainda não está pronto. Aguarde e tente de novo.');
  const teamId = String(opts.teamId || '').trim();
  const dateStr = String(opts.date || '').trim();
  const savedBy = String(opts.savedBy || '').trim();
  const savedRole = String(opts.savedRole || '').trim().toLowerCase();
  const isNew = !!opts.isNew;
  const records = Array.isArray(opts.records) ? opts.records : [];
  const priorRecords = Array.isArray(opts.priorRecords) ? opts.priorRecords : [];
  const st = opts.status === 'closed' ? 'closed' : 'open';

  if (!teamId || !dateStr || !savedBy) throw new Error('Equipe, data e usuário são obrigatórios.');

  const priorById = {};
  for (const p of priorRecords) {
    if (p && p.employeeId) priorById[String(p.employeeId)] = p;
  }

  const now = Timestamp.now();

  const cleaned = records.map(r => {
    const empId = String(r.employeeId || '').trim();
    const status = String(r.status || 'pending').trim();
    const prior = priorById[empId];
    if (!prior) {
      return {
        employeeId: empId,
        status,
        createdBy: savedBy,
        createdRole: savedRole || 'supervisor',
        updatedBy: savedBy,
        updatedRole: savedRole || 'supervisor',
        updatedAt: now
      };
    }
    const statusChanged = String(prior.status || '') !== status;
    return {
      employeeId: empId,
      status,
      createdBy: prior.createdBy || prior.updatedBy || savedBy,
      createdRole: prior.createdRole || prior.updatedRole || 'supervisor',
      updatedBy: statusChanged ? savedBy : (prior.updatedBy || savedBy),
      updatedRole: statusChanged ? (savedRole || 'supervisor') : (prior.updatedRole || 'supervisor'),
      updatedAt: statusChanged ? now : (prior.updatedAt || now)
    };
  }).filter(r => r.employeeId);

  const docId = _ntDailyAttendanceDocId(teamId, dateStr);
  const ref = doc(db, DAILY_ATTENDANCE_COL, docId);

  const payload = {
    date: dateStr,
    teamId,
    status: st,
    records: cleaned,
    updatedAt: now,
    updatedBy: savedBy,
    updatedRole: savedRole || 'supervisor'
  };

  if (isNew) {
    payload.createdAt = now;
    payload.createdBy = savedBy;
    payload.createdRole = savedRole || 'supervisor';
  }

  await setDoc(ref, payload, { merge: true });
  return { docId };
};

/**
 * Lista datas (YYYY-MM-DD) que possuem documento `daily_attendance` para um time em um intervalo.
 * Usado pela UI de calendário (dots).
 *
 * @param {{ teamId: string, startDate: string, endDate: string }} opts
 * @returns {Promise<Set<string>>}
 */
window._ntListDailyAttendanceDatesForTeam = async function(opts) {
  if (!window._dbReady) throw new Error('Firebase ainda não está pronto. Aguarde e tente de novo.');
  const teamId = String(opts && opts.teamId ? opts.teamId : '').trim();
  const startDate = String(opts && opts.startDate ? opts.startDate : '').trim();
  const endDate = String(opts && opts.endDate ? opts.endDate : '').trim();
  if (!teamId || !startDate || !endDate) throw new Error('Equipe e intervalo são obrigatórios.');

  const q = query(
    collection(db, DAILY_ATTENDANCE_COL),
    where('teamId', '==', teamId),
    where('date', '>=', startDate),
    where('date', '<=', endDate)
  );
  const snap = await getDocs(q);
  const out = new Set();
  snap.docs.forEach(d => {
    const data = d.data();
    const ds = data && data.date != null ? String(data.date).trim() : '';
    if (ds) out.add(ds);
  });
  return out;
};

/**
 * Retorna um Map dateStr → resumo (presentes/faltas/atestados + faltantes + edições).
 * Útil para popover/heatmap no calendário e indicador de retificação por Admin/Gerente.
 *
 * @param {{ teamId: string, startDate: string, endDate: string }} opts
 * @returns {Promise<Map<string, {
 *   presentes: number,
 *   faltas: number,
 *   atestados: number,
 *   faltantes: string[],
 *   hasAdminEdits: boolean,
 *   total: number
 * }>>}
 */
window._ntGetDailyAttendanceSummariesForTeam = async function(opts) {
  if (!window._dbReady) throw new Error('Firebase ainda não está pronto. Aguarde e tente de novo.');
  const teamId = String(opts && opts.teamId ? opts.teamId : '').trim();
  const startDate = String(opts && opts.startDate ? opts.startDate : '').trim();
  const endDate = String(opts && opts.endDate ? opts.endDate : '').trim();
  if (!teamId || !startDate || !endDate) throw new Error('Equipe e intervalo são obrigatórios.');

  const q = query(
    collection(db, DAILY_ATTENDANCE_COL),
    where('teamId', '==', teamId),
    where('date', '>=', startDate),
    where('date', '<=', endDate)
  );
  const snap = await getDocs(q);
  const out = new Map();
  snap.docs.forEach(d => {
    const data = d.data() || {};
    const dateStr = data.date != null ? String(data.date).trim() : '';
    if (!dateStr) return;
    const records = Array.isArray(data.records) ? data.records : [];
    let presentes = 0;
    let faltas = 0;
    let atestados = 0;
    let hasAdminEdits = false;
    const faltantes = [];
    for (const r of records) {
      if (!r || !r.employeeId) continue;
      const st = String(r.status || '').trim().toLowerCase();
      if (st === 'presente') presentes += 1;
      else if (st === 'falta') { faltas += 1; faltantes.push(String(r.employeeId)); }
      else if (st === 'atestado') atestados += 1;
      const updRole = String(r.updatedRole || '').trim().toLowerCase();
      const crtRole = String(r.createdRole || '').trim().toLowerCase();
      if ((updRole === 'admin' || updRole === 'manager') && updRole !== crtRole) {
        hasAdminEdits = true;
      }
    }
    out.set(dateStr, {
      presentes,
      faltas,
      atestados,
      faltantes,
      hasAdminEdits,
      total: records.length
    });
  });
  return out;
};

/**
 * Lista documentos `daily_attendance` completos para uma equipe em um intervalo.
 * Útil para montar dashboards consolidados (rankings/heatmap) sem múltiplos fetches por dia.
 *
 * @param {{ teamId: string, startDate: string, endDate: string }} opts
 * @returns {Promise<Array<{ id: string, date: string, teamId: string, records: any[] }>>}
 */
window._ntListDailyAttendanceDocsForTeam = async function(opts) {
  if (!window._dbReady) throw new Error('Firebase ainda não está pronto. Aguarde e tente de novo.');
  const teamId = String(opts && opts.teamId ? opts.teamId : '').trim();
  const startDate = String(opts && opts.startDate ? opts.startDate : '').trim();
  const endDate = String(opts && opts.endDate ? opts.endDate : '').trim();
  if (!teamId || !startDate || !endDate) throw new Error('Equipe e intervalo são obrigatórios.');

  const q = query(
    collection(db, DAILY_ATTENDANCE_COL),
    where('teamId', '==', teamId),
    where('date', '>=', startDate),
    where('date', '<=', endDate)
  );
  const snap = await getDocs(q);
  const out = snap.docs
    .map(d => ({ id: d.id, ...(d.data() || {}) }))
    .filter(x => x && x.date)
    .map(x => ({
      id: String(x.id || ''),
      date: String(x.date || '').trim(),
      teamId: String(x.teamId || '').trim(),
      records: Array.isArray(x.records) ? x.records : []
    }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return out;
};

// ─── Tela de loading ─────────────────────────
function showLoadingScreen(show, error = false) {
  const el = document.getElementById('firebase-loading');
  if (!el) return;
  if (show) {
    el.classList.remove('hidden');
  } else {
    if (error) {
      el.innerHTML = `
        <div style="text-align:center;color:white;padding:32px">
          <div style="font-size:52px;margin-bottom:16px">⚠️</div>
          <h3 style="font-size:20px;margin-bottom:8px">Erro de conexão</h3>
          <p style="font-size:14px;opacity:0.8;margin-bottom:20px">
            Verifique se o Firestore está ativado no console Firebase<br>
            e se as regras de segurança permitem leitura/escrita.
          </p>
          <button onclick="location.reload()" style="background:white;color:#002B5B;border:none;padding:12px 28px;border-radius:8px;font-weight:700;cursor:pointer;font-size:14px">
            🔄 Tentar novamente
          </button>
        </div>`;
    } else {
      el.classList.add('hidden');
    }
  }
}

// ─── Auto-inicialização ───────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => window.initFirebase());
} else {
  window.initFirebase();
}

export default {};
