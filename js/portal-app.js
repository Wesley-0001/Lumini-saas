/**
 * portal-app.js — Portal do Colaborador (página isolada)
 *
 * Fluxo: login na coleção `users` (role === employee) → carrega registro em `employees`
 * via `employeeId` → exibe nome, cargo, equipe e avaliações (`evaluations.employeeId` = id em `employees`,
 * mesmo vínculo de submitEvaluation em app.js).
 *
 * Coleção `employees` (Firestore):
 * - Cada documento = um colaborador; o campo `employeeId` em `users` deve ser o ID do documento (string),
 *   não a matrícula. A matrícula RH fica em `rhMatricula` (ex.: "2164").
 * - Para obter o ID: Console Firebase → employees → filtrar por campo `rhMatricula` ou nome; copiar "ID do documento".
 *
 * Holerites — coleção `holerites` no Firestore (publicação pelo RH; portal só lê).
 * Vínculo: `employeeId` (= id do documento em `employees`) e/ou `rhMatricula` ou `matricula`
 * (string da matrícula, alinhada a `employees.rhMatricula`).
 * Campos exibidos são lidos com nomes alternativos comuns (ver pickHolerite* abaixo).
 *
 * Frequência — coleção `daily_attendance` (registro diário pela supervisão; portal só lê).
 * Cada documento tem `date` (YYYY-MM-DD) e `records[]` com `employeeId` e `status` (presente, falta, folga, etc.).
 *
 * Não depende de app.js nem do fluxo do index.html.
 */

const PORTAL_LOG = '[Portal]';

/** Nome da coleção no Firestore (ajuste se o RH usar outro identificador). */
const PORTAL_HOLERITES_COLLECTION = 'holerites';

const PORTAL_DAILY_ATTENDANCE_COLLECTION = 'daily_attendance';

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ─── Mesma configuração do projeto que firebase-db.js (Firestore compartilhado) ───
const firebaseConfig = {
  apiKey:            'AIzaSyAVB6QZCUE4fUyrFMh7Oex0rcNRLVP9uI',
  authDomain:        'lumini-sabor-nt.firebaseapp.com',
  projectId:         'lumini-sabor-nt',
  storageBucket:     'lumini-sabor-nt.firebasestorage.app',
  messagingSenderId: '622572697165',
  appId:             '1:622572697165:web:8b2d201870b39dc88b0e04'
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

/** Chave de sessão (somente nesta aba) */
const SESSION_KEY = 'nt_portal_session_v1';

// ─── UI helpers ─────────────────────────────────────────────────
function $(id) { return document.getElementById(id); }

function showEl(id, on) {
  const el = $(id);
  if (el) el.style.display = on ? '' : 'none';
}

function setLoading(on) {
  showEl('portal-loading', on);
}

function showLoginError(msg) {
  const box = $('portal-login-error');
  if (!box) return;
  if (msg) {
    box.textContent = msg;
    box.style.display = '';
  } else {
    box.textContent = '';
    box.style.display = 'none';
  }
}

function readSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || !s.userId || !s.email || !s.employeeId) return null;
    return s;
  } catch {
    return null;
  }
}

function writeSession(data) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

/** Normaliza e-mail para comparação com o Firestore */
function normEmail(e) {
  return String(e || '').trim().toLowerCase();
}

/**
 * Busca usuário por e-mail na coleção `users`.
 * Retorna { id, ...data } ou null.
 */
async function fetchUserByEmail(email) {
  const em = normEmail(email);
  const q = query(collection(db, 'users'), where('email', '==', em));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

/**
 * Valida senha em texto simples (mesmo padrão esperado no documento do usuário).
 * Observação: o módulo admin pode persistir usuários sem o campo `password` no Firebase;
 * nesse caso é preciso definir a senha no documento do usuário para o portal funcionar.
 */
function passwordMatches(input, stored) {
  if (stored === undefined || stored === null || stored === '') return false;
  return String(input) === String(stored);
}

/** Carrega colaborador pelo ID do documento em `employees` */
async function fetchEmployee(employeeId) {
  const id = String(employeeId);
  const ref = doc(db, 'employees', id);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    console.warn(PORTAL_LOG, 'fetchEmployee: documento não existe em employees/', id);
    return null;
  }
  const emp = { id: snap.id, ...snap.data() };
  console.log(PORTAL_LOG, 'fetchEmployee: OK', { employeeDocId: emp.id, name: emp.name, rhMatricula: emp.rhMatricula });
  return emp;
}

/**
 * Lê apenas avaliações do colaborador (query filtrada — não baixa a coleção inteira).
 */
async function fetchEvaluationsForEmployee(employeeId) {
  const id = String(employeeId);
  const q = query(collection(db, 'evaluations'), where('employeeId', '==', id));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ ...d.data(), id: d.id }));
}

function pickHoleriteField(obj, keys) {
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const v = obj[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return '';
}

function parsePortalDate(val) {
  if (val == null) return null;
  if (typeof val.toDate === 'function') {
    try {
      const d = val.toDate();
      return d instanceof Date && !isNaN(d.getTime()) ? d : null;
    } catch {
      /* fallthrough */
    }
  }
  if (typeof val === 'object' && val.seconds != null) {
    const d = new Date(Number(val.seconds) * 1000 + (val.nanoseconds || 0) / 1e6);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function formatHoleriteCompetencia(raw) {
  const s = String(raw || '').trim();
  if (!s) return 'Holerite';
  const ym = s.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (ym) return `${ym[2]}/${ym[1]}`;
  return s;
}

function formatHoleritePublishedAt(raw) {
  const d = parsePortalDate(raw);
  if (!d) return '—';
  const dateStr = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  const h = d.getHours();
  const m = d.getMinutes();
  const hasTime = h !== 0 || m !== 0 || d.getSeconds() !== 0;
  if (!hasTime) return dateStr;
  return `${dateStr} · ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

function holeriteSortTime(h) {
  const raw = pickHoleriteField(h, [
    'dataPublicacao', 'publishedAt', 'dataPublicação', 'uploadedAt', 'createdAt', 'updatedAt', 'data'
  ]);
  const d = parsePortalDate(raw);
  return d ? d.getTime() : 0;
}

/**
 * Holerites do colaborador: une consultas por employeeId e por matrícula (sem duplicar por id).
 */
async function fetchHoleritesForEmployee(employeeId, rhMatricula) {
  const merged = new Map();
  const col = PORTAL_HOLERITES_COLLECTION;

  const addSnap = snap => {
    snap.docs.forEach(d => {
      if (!merged.has(d.id)) merged.set(d.id, { ...d.data(), id: d.id });
    });
  };

  try {
    const qEmp = query(collection(db, col), where('employeeId', '==', String(employeeId)));
    const snapEmp = await getDocs(qEmp);
    addSnap(snapEmp);
  } catch (e) {
    console.warn(PORTAL_LOG, 'holerites: consulta employeeId', e.message || e);
  }

  const mat = rhMatricula != null ? String(rhMatricula).trim() : '';
  if (mat) {
    const fields = ['rhMatricula', 'matricula'];
    for (let i = 0; i < fields.length; i++) {
      try {
        const qMat = query(collection(db, col), where(fields[i], '==', mat));
        const snapMat = await getDocs(qMat);
        addSnap(snapMat);
      } catch (e) {
        console.warn(PORTAL_LOG, `holerites: consulta ${fields[i]}`, e.message || e);
      }
    }
    if (/^\d+$/.test(mat)) {
      const n = parseInt(mat, 10);
      for (let i = 0; i < fields.length; i++) {
        try {
          const qNum = query(collection(db, col), where(fields[i], '==', n));
          const snapNum = await getDocs(qNum);
          addSnap(snapNum);
        } catch (e) {
          console.warn(PORTAL_LOG, `holerites: consulta ${fields[i]} (número)`, e.message || e);
        }
      }
    }
  }

  const list = [...merged.values()].sort((a, b) => holeriteSortTime(b) - holeriteSortTime(a));
  console.log(PORTAL_LOG, 'holerites: carregados', { total: list.length, employeeId: String(employeeId) });
  return list;
}

function tsMillis(t) {
  if (!t) return 0;
  if (typeof t.toMillis === 'function') {
    try {
      return t.toMillis();
    } catch {
      /* fallthrough */
    }
  }
  if (typeof t === 'object' && t.seconds != null) {
    return Number(t.seconds) * 1000 + (Number(t.nanoseconds) || 0) / 1e6;
  }
  return 0;
}

function normalizeAttendanceStatus(raw) {
  const s = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/-/g, '_');
  if (
    s === 'presente' ||
    s === 'falta' ||
    s === 'folga' ||
    s === 'turno_cancelado' ||
    s === 'atestado' ||
    s === 'pending'
  ) {
    return s;
  }
  return 'pending';
}

function attendanceStatusLabel(status) {
  const k = normalizeAttendanceStatus(status);
  if (k === 'presente') return 'Presente';
  if (k === 'falta') return 'Falta';
  if (k === 'folga') return 'Folga';
  if (k === 'turno_cancelado') return 'Turno cancelado';
  if (k === 'atestado') return 'Atestado';
  if (k === 'pending') return 'Não definido';
  return String(status || '—').trim() || '—';
}

function attendanceCellClass(status) {
  const k = normalizeAttendanceStatus(status);
  return `portal-freq-cell--${k}`;
}

/**
 * Lançamentos do mês em `daily_attendance`: filtra por intervalo de `date` e acha o registro do colaborador em `records`.
 * Se houver mais de um documento por dia (casos raros), mantém o de `updatedAt` mais recente.
 */
async function fetchDailyAttendanceStatusByDate(employeeId, year, monthIndex0) {
  const id = String(employeeId).trim();
  const pad = n => String(n).padStart(2, '0');
  const y = year;
  const m = monthIndex0 + 1;
  const lastDay = new Date(year, monthIndex0 + 1, 0).getDate();
  const startStr = `${y}-${pad(m)}-01`;
  const endStr = `${y}-${pad(m)}-${pad(lastDay)}`;

  const col = PORTAL_DAILY_ATTENDANCE_COLLECTION;
  try {
    const q = query(
      collection(db, col),
      where('date', '>=', startStr),
      where('date', '<=', endStr)
    );
    const snap = await getDocs(q);
    const byDate = new Map();
    snap.docs.forEach(docSnap => {
      const data = docSnap.data();
      const dateStr = String(data.date || '').trim();
      if (!dateStr) return;
      const records = Array.isArray(data.records) ? data.records : [];
      const rec = records.find(r => r && String(r.employeeId).trim() === id);
      if (!rec) return;
      const status = normalizeAttendanceStatus(rec.status);
      const ms = tsMillis(data.updatedAt);
      const prev = byDate.get(dateStr);
      if (!prev || ms >= prev.ms) byDate.set(dateStr, { status, ms });
    });
    const out = new Map();
    byDate.forEach((v, k) => out.set(k, v.status));
    console.log(PORTAL_LOG, 'daily_attendance: dias com registro', { total: out.size, employeeId: id, startStr, endStr });
    return out;
  } catch (e) {
    console.warn(PORTAL_LOG, 'daily_attendance: consulta', e.message || e);
    return new Map();
  }
}

let _portalFreqEmployeeId = null;
let _portalFreqYear = null;
let _portalFreqMonth = null;

function portalFreqMonthTitle(y, m0) {
  const d = new Date(y, m0, 1);
  const t = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function renderPortalFreqLegend() {
  const leg = $('portal-freq-legend');
  if (!leg) return;
  const items = [
    ['portal-freq-dot--presente', 'Presente'],
    ['portal-freq-dot--falta', 'Falta'],
    ['portal-freq-dot--folga', 'Folga'],
    ['portal-freq-dot--turno_cancelado', 'Turno cancelado'],
    ['portal-freq-dot--atestado', 'Atestado'],
    ['portal-freq-dot--pending', 'Não definido'],
    ['portal-freq-dot--void', 'Sem registro']
  ];
  leg.innerHTML = items
    .map(
      ([cls, lab]) =>
        `<span class="portal-freq-legend-item"><span class="portal-freq-dot ${cls}" aria-hidden="true"></span>${escapeHtml(lab)}</span>`
    )
    .join('');
}

function buildFreqCalendarCells(year, month0, statusByDate) {
  const first = new Date(year, month0, 1);
  const last = new Date(year, month0 + 1, 0);
  const startPad = first.getDay();
  const daysInMonth = last.getDate();
  const pad2 = n => String(n).padStart(2, '0');
  const cells = [];
  for (let i = 0; i < startPad; i++) cells.push({ kind: 'pad' });
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${pad2(month0 + 1)}-${pad2(d)}`;
    const st = statusByDate.has(dateStr) ? statusByDate.get(dateStr) : null;
    cells.push({ kind: 'day', day: d, dateStr, status: st });
  }
  while (cells.length % 7 !== 0) cells.push({ kind: 'pad' });
  return cells;
}

async function refreshPortalFrequenciaCalendar() {
  const empId = _portalFreqEmployeeId;
  const y = _portalFreqYear;
  const m = _portalFreqMonth;
  const calEl = $('portal-freq-calendar');
  const emptyEl = $('portal-freq-empty');
  const detailEl = $('portal-freq-detail');
  const monthLabel = $('portal-freq-month-label');
  const wrap = $('portal-freq-wrap');
  if (!calEl || !empId || y == null || m == null) return;

  if (detailEl) {
    detailEl.hidden = true;
    detailEl.textContent = '';
  }
  if (monthLabel) monthLabel.textContent = portalFreqMonthTitle(y, m);

  calEl.innerHTML =
    '<div class="portal-freq-cal-loading"><i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Carregando calendário…</div>';

  const statusByDate = await fetchDailyAttendanceStatusByDate(empId, y, m);
  const cells = buildFreqCalendarCells(y, m, statusByDate);

  const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const headRow = weekdays
    .map(w => `<div class="portal-freq-wd" role="columnheader">${escapeHtml(w)}</div>`)
    .join('');

  const grid = cells
    .map(c => {
      if (c.kind === 'pad') {
        return '<div class="portal-freq-cell portal-freq-cell--pad" aria-hidden="true"></div>';
      }
      const has = c.status != null;
      const k = has ? normalizeAttendanceStatus(c.status) : 'void';
      const label = has ? attendanceStatusLabel(c.status) : 'Sem registro neste dia';
      const ariaDate = new Date(c.dateStr + 'T12:00:00').toLocaleDateString('pt-BR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
      const cls = has ? `portal-freq-cell--day ${attendanceCellClass(c.status)}` : 'portal-freq-cell--day portal-freq-cell--void';
      return `<button type="button" class="portal-freq-cell ${cls}" data-portal-freq-day="${escapeHtml(c.dateStr)}" data-portal-freq-status="${escapeHtml(k)}" aria-label="${escapeHtml(ariaDate)}: ${escapeHtml(label)}">${c.day}</button>`;
    })
    .join('');

  calEl.innerHTML = `<div class="portal-freq-weekdays" role="row">${headRow}</div><div class="portal-freq-grid" role="rowgroup">${grid}</div>`;

  const countRecorded = statusByDate.size;
  if (emptyEl) {
    if (!countRecorded) {
      emptyEl.hidden = false;
      emptyEl.innerHTML = `
      <div class="portal-freq-empty-icon"><i class="fas fa-calendar-alt" aria-hidden="true"></i></div>
      <p class="portal-freq-empty-title">Nenhum registro neste mês</p>
      <p class="portal-freq-empty-text">Quando a supervisão lançar a frequência diária da equipe, os dias em que você constar aparecerão coloridos no calendário. Use as setas para ver outros meses.</p>`;
    } else {
      emptyEl.hidden = true;
      emptyEl.innerHTML = '';
    }
  }
  if (wrap) wrap.classList.toggle('portal-freq-wrap--has-data', countRecorded > 0);
}

function shiftPortalFreqMonth(delta) {
  if (_portalFreqYear == null || _portalFreqMonth == null) return;
  let y = _portalFreqYear;
  let m = _portalFreqMonth + delta;
  while (m < 0) {
    m += 12;
    y -= 1;
  }
  while (m > 11) {
    m -= 12;
    y += 1;
  }
  _portalFreqYear = y;
  _portalFreqMonth = m;
  refreshPortalFrequenciaCalendar();
}

function onPortalFreqDayClick(e) {
  const btn = e.target.closest('[data-portal-freq-day]');
  if (!btn) return;
  const dateStr = btn.getAttribute('data-portal-freq-day');
  const rawStatus = btn.getAttribute('data-portal-freq-status') || 'void';
  const detailEl = $('portal-freq-detail');
  if (!detailEl || !dateStr) return;

  const pretty = new Date(dateStr + 'T12:00:00').toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
  const prettyCap = pretty.charAt(0).toUpperCase() + pretty.slice(1);
  const statusText =
    rawStatus === 'void'
      ? 'Sem registro de frequência neste dia'
      : attendanceStatusLabel(rawStatus);
  detailEl.hidden = false;
  detailEl.innerHTML = `<strong>${escapeHtml(prettyCap)}</strong> — ${escapeHtml(statusText)}`;
}

function ensurePortalFrequenciaDelegates() {
  const wrap = $('portal-freq-wrap');
  if (!wrap || wrap.dataset.portalFreqBound) return;
  wrap.dataset.portalFreqBound = '1';
  $('portal-freq-btn-prev')?.addEventListener('click', () => shiftPortalFreqMonth(-1));
  $('portal-freq-btn-next')?.addEventListener('click', () => shiftPortalFreqMonth(1));
  wrap.addEventListener('click', onPortalFreqDayClick);
}

function initPortalFrequenciaSection(employeeId) {
  ensurePortalFrequenciaDelegates();
  _portalFreqEmployeeId = String(employeeId || '').trim();
  const now = new Date();
  _portalFreqYear = now.getFullYear();
  _portalFreqMonth = now.getMonth();
  renderPortalFreqLegend();
  refreshPortalFrequenciaCalendar();
}

function normalizeHoleriteRow(h) {
  const competencia = pickHoleriteField(h, [
    'competence', 'competencia', 'competência', 'mesReferencia', 'mesReferência', 'referencia', 'referência',
    'periodo', 'período', 'mesAno', 'anoMes', 'tituloCompetencia'
  ]);
  const publishedRaw = pickHoleriteField(h, [
    'dataPublicacao', 'publishedAt', 'dataPublicação', 'createdAt', 'data'
  ]);
  const fileName = pickHoleriteField(h, ['nomeArquivo', 'fileName', 'arquivo', 'nome', 'titulo']);
  /* Demo: PDF embutido no Firestore (data URL); produção costuma usar url HTTP do Storage */
  const url = pickHoleriteField(h, ['fileDataUrl', 'url', 'downloadUrl', 'fileUrl', 'link', 'storageUrl', 'pdfUrl']);
  return {
    id: h.id,
    competenciaLabel: formatHoleriteCompetencia(competencia),
    publishedLabel: formatHoleritePublishedAt(publishedRaw),
    fileName: String(fileName || '').trim(),
    url: String(url || '').trim()
  };
}

/** PDFs em data URL no Firestore: `href` gigante abre about:blank; usa Blob + object URL. */
const portalHoleritePdfById = new Map();

function openHoleriteInBrowser(url) {
  const u = String(url || '').trim();
  if (!u) return;
  if (/^https?:\/\//i.test(u)) {
    window.open(u, '_blank', 'noopener,noreferrer');
    return;
  }
  if (/^data:application\/pdf/i.test(u)) {
    try {
      const comma = u.indexOf(',');
      if (comma < 0) return;
      const meta = u.slice(0, comma);
      const payload = u.slice(comma + 1);
      const mimeMatch = /^data:([^;,]+)/i.exec(meta);
      const mime = mimeMatch ? mimeMatch[1] : 'application/pdf';
      let bytes;
      if (/;base64/i.test(meta)) {
        const binary = atob(payload.replace(/\s/g, ''));
        bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      } else {
        bytes = new TextEncoder().encode(decodeURIComponent(payload));
      }
      const blob = new Blob([bytes], { type: mime });
      const objUrl = URL.createObjectURL(blob);
      const win = window.open(objUrl, '_blank', 'noopener,noreferrer');
      if (win) {
        setTimeout(() => URL.revokeObjectURL(objUrl), 120000);
      } else {
        URL.revokeObjectURL(objUrl);
      }
    } catch (e) {
      console.warn(PORTAL_LOG, 'holerites: abrir PDF (data URL)', e);
    }
    return;
  }
  window.open(u, '_blank', 'noopener,noreferrer');
}

function ensurePortalHoleriteListDelegate() {
  const listEl = $('portal-hol-list');
  if (!listEl || listEl.dataset.portalHolDelegate) return;
  listEl.dataset.portalHolDelegate = '1';
  listEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-portal-hol-pdf]');
    if (!btn || !listEl.contains(btn)) return;
    e.preventDefault();
    const id = btn.getAttribute('data-portal-hol-pdf');
    if (!id) return;
    const raw = portalHoleritePdfById.get(id);
    if (raw) openHoleriteInBrowser(raw);
  });
}

function renderHoleritesSection(holerites) {
  const listEl = $('portal-hol-list');
  const emptyEl = $('portal-hol-empty');
  if (!listEl || !emptyEl) return;

  portalHoleritePdfById.clear();
  const rows = (holerites || []).map(normalizeHoleriteRow);

  if (!rows.length) {
    listEl.innerHTML = '';
    emptyEl.hidden = false;
    emptyEl.innerHTML = `
      <div class="portal-hol-empty-icon"><i class="fas fa-folder-open" aria-hidden="true"></i></div>
      <p class="portal-hol-empty-title">Nenhum holerite disponível ainda</p>
      <p class="portal-hol-empty-text">Quando o RH publicar holerites vinculados ao seu cadastro, eles aparecerão aqui para consulta ou download.</p>`;
    return;
  }

  emptyEl.hidden = true;
  listEl.innerHTML = rows.map(row => {
    const isHttp = /^https?:\/\//i.test(row.url);
    const isDataPdf = /^data:application\/pdf/i.test(row.url);
    const fileLine = row.fileName
      ? `<p class="portal-hol-filename"><strong>Arquivo:</strong> ${escapeHtml(row.fileName)}</p>`
      : '';
    let actions;
    if (isHttp) {
      actions = `<a class="portal-hol-btn" href="${escapeHtml(row.url)}" target="_blank" rel="noopener noreferrer">
           <i class="fas fa-external-link-alt" aria-hidden="true"></i> Ver / baixar
         </a>`;
    } else if (isDataPdf) {
      portalHoleritePdfById.set(row.id, row.url);
      actions = `<button type="button" class="portal-hol-btn" data-portal-hol-pdf="${escapeHtml(row.id)}">
           <i class="fas fa-external-link-alt" aria-hidden="true"></i> Ver / baixar
         </button>`;
    } else {
      actions = `<span class="portal-hol-btn portal-hol-btn--muted" title="Arquivo ainda não disponível ou link não informado">
           <i class="fas fa-unlink" aria-hidden="true"></i> Indisponível
         </span>`;
    }
    return `
      <article class="portal-hol-card" role="listitem">
        <div class="portal-hol-card-top">
          <div>
            <h3 class="portal-hol-title">${escapeHtml(row.competenciaLabel)}</h3>
            <p class="portal-hol-meta">
              <i class="fas fa-calendar-check" aria-hidden="true"></i>
              <span>Publicado em ${escapeHtml(row.publishedLabel)}</span>
            </p>
            ${fileLine}
          </div>
          <div class="portal-hol-actions">${actions}</div>
        </div>
      </article>`;
  }).join('');
  ensurePortalHoleriteListDelegate();
}

function calcTenureMonths(admissionDate) {
  if (!admissionDate) return 0;
  const now = new Date();
  const adm = new Date(admissionDate);
  let months = (now.getFullYear() - adm.getFullYear()) * 12 + (now.getMonth() - adm.getMonth());
  return months < 0 ? 0 : months;
}

/** Mesma ideia de `tenureText` em app.js — texto amigável para o portal (somente leitura). */
function formatPortalTenureHuman(months) {
  const m = Math.max(0, Math.floor(Number(months) || 0));
  const y = Math.floor(m / 12);
  const mo = m % 12;
  const parts = [];
  if (y > 0) parts.push(`${y} ano${y > 1 ? 's' : ''}`);
  if (mo > 0) parts.push(`${mo} mês${mo > 1 ? 'es' : ''}`);
  return parts.length ? parts.join(' e ') : 'Recém admitido';
}

/**
 * Exibe card de tempo de casa + barra quando há cargo-alvo e o colaborador não está em fluxo de promoção ativo.
 * Alinhado a `getStatusInfo` em app.js.
 */
function shouldShowPortalTenureCard(emp) {
  if (!emp || !emp.desiredRole || emp.status === 'registered') return false;
  if (['promoted', 'approved', 'pending_carlos', 'pending_samuel', 'pending_samuel_return'].includes(emp.status)) {
    return false;
  }
  return true;
}

function buildPortalTenureCardHtml(emp) {
  const months = calcTenureMonths(emp.admission);
  const minM = Math.max(0, Number(emp.minMonths) || 0);
  const denom = Math.max(1, minM);
  const pctRaw = minM <= 0 ? 100 : Math.min(100, Math.round((months / denom) * 100));
  const complete = pctRaw >= 100;
  const fillModifier = complete ? 'portal-tenure-bar-fill--complete' : 'portal-tenure-bar-fill--progress';
  const human = formatPortalTenureHuman(months);
  const statsLine =
    minM <= 0
      ? `${pctRaw}% concluído`
      : `${pctRaw}% concluído · ${months} de ${minM} ${minM === 1 ? 'mês' : 'meses'}`;

  return `
      <article class="portal-tenure-card" aria-labelledby="portal-tenure-heading">
        <h3 id="portal-tenure-heading" class="portal-tenure-card-title">Tempo de casa</h3>
        <p class="portal-tenure-card-sub">Acompanhe sua evolução para o próximo nível</p>
        <p class="portal-tenure-current"><span class="portal-tenure-current-label">Seu tempo atual:</span> <strong>${escapeHtml(human)}</strong></p>
        <div class="portal-tenure-bar-wrap" role="progressbar" aria-valuenow="${pctRaw}" aria-valuemin="0" aria-valuemax="100" aria-label="Progresso em relação ao tempo mínimo para o próximo cargo">
          <div class="portal-tenure-bar-track">
            <div class="portal-tenure-bar-fill ${fillModifier}" style="width:${pctRaw}%"></div>
          </div>
        </div>
        <p class="portal-tenure-stats">${escapeHtml(statsLine)}</p>
      </article>`;
}

/**
 * Alinhado conceitualmente a `getStatusInfo` em app.js — texto para o colaborador (somente leitura).
 */
function getPortalCareerSituation(emp) {
  if (!emp) return { title: 'Situação', text: '—', tone: 'neutral' };
  const months = calcTenureMonths(emp.admission);
  const minM = emp.minMonths || 0;
  if (!emp.desiredRole || emp.status === 'registered') {
    return {
      title: 'Processo de promoção',
      text: 'Cadastro ativo. Não há processo de promoção em andamento no momento.',
      tone: 'neutral'
    };
  }
  if (emp.status === 'promoted') {
    return {
      title: 'Resultado final',
      text: 'Promoção concluída: seu cargo foi atualizado no cadastro.',
      tone: 'success'
    };
  }
  if (emp.status === 'approved') {
    return {
      title: 'Andamento',
      text: 'Promoção aprovada nas instâncias; aguardando conclusão dos registros.',
      tone: 'success'
    };
  }
  if (emp.status === 'pending_carlos') {
    return {
      title: 'Andamento',
      text: 'Processo na etapa de aprovação final (diretoria).',
      tone: 'pending'
    };
  }
  if (emp.status === 'pending_samuel') {
    return {
      title: 'Andamento',
      text: 'Após a avaliação, o processo segue na gerência.',
      tone: 'pending'
    };
  }
  if (emp.status === 'pending_samuel_return') {
    return {
      title: 'Andamento',
      text: 'Aguardando retorno ou complementação na etapa da diretoria.',
      tone: 'pending'
    };
  }
  if (shouldShowPortalTenureCard(emp)) {
    const eligible = minM <= 0 || months >= minM;
    if (eligible) {
      return {
        title: 'Situação',
        text: 'Você já está apto para avaliação. Converse com seu supervisor.',
        tone: 'ready'
      };
    }
    return {
      title: 'Situação',
      text: '',
      tone: 'tenure-wait',
      tenureLines: [
        'Você ainda não atingiu o tempo mínimo para avaliação.',
        `Tempo exigido: ${minM} ${minM === 1 ? 'mês' : 'meses'}`,
        `Objetivo: ${emp.desiredRole}`
      ]
    };
  }
  return {
    title: 'Situação',
    text: `Período de experiência em relação ao mínimo exigido para a próxima etapa (${minM} meses).`,
    tone: 'period'
  };
}

function formatDatePt(isoDate) {
  if (!isoDate) return '—';
  const [y, m, d] = String(isoDate).split('T')[0].split('-');
  if (!y || !m || !d) return '—';
  return `${d}/${m}/${y}`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncateText(s, max) {
  const t = String(s || '').trim();
  if (!t) return '';
  return t.length <= max ? t : `${t.slice(0, max).trim()}…`;
}

/** Mapeia `result` da avaliação (mesmos valores usados em app.js / relatórios). */
function mapEvaluationResult(ev) {
  const r = ev.result;
  if (r === 'approved') return { label: 'Aprovada na avaliação', cls: 'portal-badge portal-badge--ok' };
  if (r === 'reproved') return { label: 'Reprovada na avaliação', cls: 'portal-badge portal-badge--no' };
  if (r === 'pending') return { label: 'Pendente', cls: 'portal-badge portal-badge--wait' };
  if (r === 'promoted') return { label: 'Promovido (registro)', cls: 'portal-badge portal-badge--ok' };
  return { label: 'Registrada', cls: 'portal-badge portal-badge--neutral' };
}

function buildEvaluationSummary(ev) {
  const fromR = ev.fromRole || '—';
  const toR = ev.toRole || '—';
  const trail = `De “${fromR}” para “${toR}”.`;
  const note = ev.justification || ev.strengths || ev.improvements || '';
  const extra = truncateText(note, 140);
  return extra ? `${trail} ${extra}` : trail;
}

function renderEvaluationsSection(employee, evaluations) {
  const pipelineEl = $('portal-eval-pipeline');
  const listEl = $('portal-eval-list');
  const emptyEl = $('portal-eval-empty');
  if (!listEl || !emptyEl) return;

  const situation = getPortalCareerSituation(employee);
  const showTenure = shouldShowPortalTenureCard(employee);
  const innerToneClass =
    showTenure && situation.tone === 'ready'
      ? 'tenure-ready'
      : situation.tenureLines
        ? 'tenure-wait'
        : ['neutral', 'success', 'pending', 'ready', 'period'].includes(situation.tone)
          ? situation.tone
          : 'neutral';
  const metaLine =
    employee.desiredRole && !situation.tenureLines && !(showTenure && situation.tone === 'ready')
      ? `<p class="portal-eval-pipeline-meta"><strong>Objetivo:</strong> ${escapeHtml(employee.desiredRole)}</p>`
      : '';

  if (pipelineEl) {
    pipelineEl.hidden = false;
    const tenureCard = showTenure ? buildPortalTenureCardHtml(employee) : '';
    const tenureLinesBlock = Array.isArray(situation.tenureLines) && situation.tenureLines.length
      ? situation.tenureLines
          .map(
            line =>
              `<p class="portal-eval-pipeline-text portal-eval-pipeline-text--tenure-line">${escapeHtml(line)}</p>`
          )
          .join('')
      : '';
    const bodyText = situation.tenureLines
      ? tenureLinesBlock
      : `<p class="portal-eval-pipeline-text">${escapeHtml(situation.text)}</p>`;

    pipelineEl.innerHTML = `
      <div class="portal-eval-pipeline-stack">
        ${tenureCard}
        <div class="portal-eval-pipeline-inner portal-eval-pipeline-inner--${innerToneClass}">
          <div class="portal-eval-pipeline-title">${escapeHtml(situation.title)}</div>
          ${bodyText}
          ${metaLine}
        </div>
      </div>`;
  }

  const sorted = [...evaluations].sort((a, b) => {
    const da = new Date(a.date || 0).getTime();
    const db = new Date(b.date || 0).getTime();
    return db - da;
  });

  if (!sorted.length) {
    listEl.innerHTML = '';
    emptyEl.hidden = false;
    emptyEl.innerHTML = `
      <div class="portal-eval-empty-icon"><i class="fas fa-inbox" aria-hidden="true"></i></div>
      <p class="portal-eval-empty-title">Nenhuma avaliação registrada ainda</p>
      <p class="portal-eval-empty-text">Quando o supervisor registrar uma avaliação de desempenho vinculada a você, ela aparecerá aqui com data, resultado e um resumo.</p>`;
    return;
  }

  emptyEl.hidden = true;
  listEl.innerHTML = sorted.map(ev => {
    const res = mapEvaluationResult(ev);
    const score = ev.score != null ? `${ev.score}%` : '—';
    const summary = escapeHtml(buildEvaluationSummary(ev));
    const finalLine = res.label;
    return `
      <article class="portal-eval-card" role="listitem">
        <div class="portal-eval-card-top">
          <div>
            <div class="portal-eval-card-date"><i class="fas fa-calendar-alt" aria-hidden="true"></i> ${formatDatePt(ev.date)}</div>
            <span class="${res.cls}">${escapeHtml(finalLine)}</span>
          </div>
          <div class="portal-eval-score" title="Nota geral">${escapeHtml(score)}</div>
        </div>
        <p class="portal-eval-summary">${summary}</p>
        ${ev.stars ? `<div class="portal-eval-stars-row" aria-label="Estrelas atribuídas na avaliação"><span class="portal-eval-stars">${'★'.repeat(Math.min(5, Number(ev.stars) || 0))}${'☆'.repeat(Math.max(0, 5 - Math.min(5, Number(ev.stars) || 0)))}</span></div>` : ''}
      </article>`;
  }).join('');
}

/**
 * Exibe supervisor de forma amigável (somente UI): remove domínio de e-mail, primeiro nome, capitalizado.
 * Não altera dados no Firestore.
 */
function formatSupervisorDisplay(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const local = s.includes('@') ? s.split('@')[0] : s;
  const first = local.split(/\s+/)[0] || '';
  if (!first) return '';
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

/**
 * Resolve o nome da "equipe" a partir da coleção `teams`:
 * procura um time cujo array `membros` contenha a matrícula do RH do colaborador.
 */
async function resolveTeamLabel(employee) {
  const mat = employee.rhMatricula != null ? String(employee.rhMatricula).trim() : '';
  if (!mat) {
    return { title: '—', hint: employee.supervisor ? `Supervisor: ${formatSupervisorDisplay(employee.supervisor)}` : '' };
  }

  const teamsSnap = await getDocs(collection(db, 'teams'));
  for (const d of teamsSnap.docs) {
    const t = d.data();
    const membros = Array.isArray(t.membros) ? t.membros : [];
    const hit = membros.some(m => m && String(m.matricula).trim() === mat);
    if (hit) {
      const nome = t.nome || 'Equipe';
      const lider = t.lider ? `Líder: ${t.lider}` : '';
      return { title: nome, hint: lider };
    }
  }

  // Sem equipe cadastrada em `teams`: usa supervisor do cadastro de funcionário
  if (employee.supervisor) {
    return { title: 'Equipe operacional', hint: `Supervisor: ${formatSupervisorDisplay(employee.supervisor)}` };
  }
  return { title: '—', hint: '' };
}

function renderDashboard(employee, teamInfo, userName, evaluations, holerites) {
  showEl('portal-login', false);
  showEl('portal-home', true);

  const firstName = (userName || employee.name || 'Colaborador').split(/\s+/)[0];
  $('portal-welcome-title').textContent = `Olá, ${firstName}!`;
  $('portal-welcome-text').textContent =
    'Abaixo estão seus dados básicos, holerites, frequência e avaliações (somente leitura).';

  $('portal-val-name').textContent = employee.name || '—';
  $('portal-val-role').textContent = employee.currentRole || employee.sector || '—';
  $('portal-val-team').textContent = teamInfo.title || '—';
  const hintEl = $('portal-val-team-hint');
  if (hintEl) {
    hintEl.textContent = teamInfo.hint || '';
    hintEl.style.display = teamInfo.hint ? '' : 'none';
  }

  renderEvaluationsSection(employee, evaluations || []);
  renderHoleritesSection(holerites || []);
  initPortalFrequenciaSection(employee.id);
}

async function loadAndShowDashboard(session) {
  console.log(PORTAL_LOG, 'dashboard: carregando colaborador', { employeeId: session.employeeId, email: session.email });
  const emp = await fetchEmployee(session.employeeId);
  if (!emp) {
    console.error(PORTAL_LOG, 'dashboard: falha — colaborador não encontrado para employeeId=', session.employeeId);
    clearSession();
    showEl('portal-home', false);
    showEl('portal-login', true);
    showLoginError('Cadastro de colaborador não encontrado. Procure o RH.');
    return;
  }
  console.log(PORTAL_LOG, 'dashboard: colaborador carregado com sucesso', { employeeId: emp.id, name: emp.name });
  const teamInfo = await resolveTeamLabel(emp);
  const [evaluations, holerites] = await Promise.all([
    fetchEvaluationsForEmployee(session.employeeId),
    fetchHoleritesForEmployee(session.employeeId, emp.rhMatricula)
  ]);
  renderDashboard(emp, teamInfo, session.name, evaluations, holerites);
}

async function onLoginSubmit(e) {
  e.preventDefault();
  showLoginError('');

  const email = $('portal-email')?.value;
  const password = $('portal-password')?.value;
  const btn = $('portal-btn-submit');
  if (btn) { btn.disabled = true; }

  try {
    console.log(PORTAL_LOG, 'login: buscando usuário por e-mail', { email: normEmail(email) });
    const user = await fetchUserByEmail(email);
    if (!user) {
      console.warn(PORTAL_LOG, 'login: nenhum usuário encontrado na coleção users para este e-mail');
      showLoginError('E-mail ou senha inválidos.');
      return;
    }

    console.log(PORTAL_LOG, 'login: usuário encontrado', {
      docId: user.id,
      email: user.email,
      role: user.role,
      active: user.active,
      hasEmployeeId: !!user.employeeId,
      employeeId: user.employeeId != null ? String(user.employeeId) : null
    });

    if (user.active === false) {
      showLoginError('Usuário desativado. Fale com o administrador.');
      return;
    }

    if (user.role !== 'employee') {
      console.warn(PORTAL_LOG, 'login: recusado — role não é employee', { role: user.role });
      showLoginError('Este acesso é exclusivo para colaboradores (perfil employee).');
      return;
    }

    if (!passwordMatches(password, user.password)) {
      console.warn(PORTAL_LOG, 'login: senha inválida ou ausente no documento');
      showLoginError('E-mail ou senha inválidos.');
      return;
    }

    const empIdTrim = user.employeeId != null ? String(user.employeeId).trim() : '';
    if (!empIdTrim) {
      console.warn(PORTAL_LOG, 'login: recusado — employeeId ausente no documento users');
      showLoginError('Seu usuário ainda não está vinculado a um colaborador (employeeId). Fale com o RH.');
      return;
    }

    writeSession({
      userId:     user.id,
      email:      normEmail(user.email || email),
      name:       user.name || '',
      employeeId: empIdTrim
    });

    console.log(PORTAL_LOG, 'login: sessão gravada; employeeId utilizado', empIdTrim);
    await loadAndShowDashboard(readSession());
  } catch (err) {
    console.error('[Portal]', err);
    showLoginError('Não foi possível conectar. Tente novamente.');
  } finally {
    if (btn) { btn.disabled = false; }
  }
}

function onLogout() {
  clearSession();
  showEl('portal-home', false);
  showEl('portal-login', true);
  $('portal-login-form')?.reset?.();
  showLoginError('');
}

async function boot() {
  setLoading(true);
  try {
    const session = readSession();
    if (session) {
      await loadAndShowDashboard(session);
    } else {
      showEl('portal-login', true);
    }
  } catch (err) {
    console.error('[Portal] boot', err);
    showEl('portal-login', true);
    showLoginError('Erro ao carregar dados. Atualize a página.');
  } finally {
    setLoading(false);
  }
}

// ─── Eventos ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  $('portal-login-form')?.addEventListener('submit', onLoginSubmit);
  $('portal-btn-logout')?.addEventListener('click', onLogout);
  boot();
});
