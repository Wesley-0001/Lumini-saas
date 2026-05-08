import 'dotenv/config';
import admin from 'firebase-admin';

// ========= Config =========
const COL_DAILY = 'daily_attendance';
const COL_LEGACY = 'frequencias';

const DRY_RUN = String(process.env.DRY_RUN || 'true').toLowerCase() !== 'false';
const FIREBASE_PROJECT_ID =
  (process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || '').trim();

const SERVICE_ACCOUNT_JSON = (process.env.SERVICE_ACCOUNT_JSON || '').trim();

const CONFIRM_DELETE_LEGACY =
  String(process.env.CONFIRM_DELETE_LEGACY || '').trim().toLowerCase() === 'true';
const DELETE_FREQUENCIAS =
  String(process.env.DELETE_FREQUENCIAS || '').trim().toLowerCase() === 'true';
const DELETE_DIRTY_DAILY =
  String(process.env.DELETE_DIRTY_DAILY || '').trim().toLowerCase() === 'true';

const RUN_CLEANUP = process.argv.includes('--cleanup');

// ========= Init Firebase Admin =========
if (admin.apps.length === 0) {
  if (SERVICE_ACCOUNT_JSON) {
    let sa;
    try {
      sa = JSON.parse(SERVICE_ACCOUNT_JSON);
    } catch (e) {
      throw new Error('SERVICE_ACCOUNT_JSON inválido (não é JSON).');
    }
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      projectId: FIREBASE_PROJECT_ID || sa.project_id
    });
  } else {
    // Usa Application Default Credentials (ex.: GOOGLE_APPLICATION_CREDENTIALS apontando para um JSON)
    admin.initializeApp(FIREBASE_PROJECT_ID ? { projectId: FIREBASE_PROJECT_ID } : undefined);
  }
}
const db = admin.firestore();

// ========= Utils =========
function logProgress(i, total, extra = '') {
  const pct = total ? ((i / total) * 100).toFixed(1) : '0.0';
  process.stdout.write(
    `[MIGRAÇÃO] Processando documento ${i} de ${total} (${pct}%)${extra ? ' — ' + extra : ''}\n`
  );
}

function safeString(v) {
  return String(v == null ? '' : v).trim();
}

function normalizeTeamId(v) {
  const s = safeString(v);
  if (!s) return '';
  // Canonical team key:
  // - trim
  // - remove diacritics
  // - uppercase
  // - convert spaces/hyphens to underscore
  // - collapse underscores
  // - strip non [A-Z0-9_]
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[\s\-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/[^A-Z0-9_]/g, '');
}

function toMillisMaybe(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') {
    try {
      return ts.toMillis();
    } catch {
      return 0;
    }
  }
  if (typeof ts === 'object' && ts.seconds != null) {
    const s = Number(ts.seconds) || 0;
    const ns = Number(ts.nanoseconds) || 0;
    return s * 1000 + ns / 1e6;
  }
  return 0;
}

function isIsoDateString(s) {
  const str = safeString(s);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const [y, m, d] = str.split('-').map((x) => parseInt(x, 10));
  if (!y || !m || !d) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  return true;
}

function parsePtBrToIso(s) {
  const raw = safeString(s);
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return '';
  const dd = String(parseInt(m[1], 10)).padStart(2, '0');
  const mm = String(parseInt(m[2], 10)).padStart(2, '0');
  let yy = parseInt(m[3], 10);
  if (!Number.isFinite(yy)) return '';
  if (yy < 100) yy = yy <= 30 ? 2000 + yy : 1900 + yy;
  return `${yy}-${mm}-${dd}`;
}

function normalizeDateToIso(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'string') {
    const s = safeString(v);
    if (isIsoDateString(s)) return s;
    const pt = parsePtBrToIso(s);
    if (pt) return pt;
    // last resort: try Date parse
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return '';
  }
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v?.toDate === 'function') {
    try {
      const d = v.toDate();
      if (d instanceof Date && !Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    } catch {
      /* ignore */
    }
  }
  const d2 = new Date(String(v));
  if (!Number.isNaN(d2.getTime())) return d2.toISOString().slice(0, 10);
  return '';
}

function normalizeStatus(raw) {
  const s = safeString(raw)
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/-/g, '_');

  if (s === 'p' || s === 'presenca' || s === 'presença' || s === 'presente') return 'presente';
  if (s === 'f' || s === 'falta') return 'falta';

  // tudo que não é P/F vira "justificado" (regra solicitada)
  if (s === 'j' || s === 'justificado') return 'justificado';
  if (s === 'folga' || s === 'atestado' || s === 'turno_cancelado' || s === 'cancelado') return 'justificado';
  if (!s || s === 'pending') return 'justificado';
  return 'justificado';
}

function pick(obj, keys) {
  for (const k of keys) {
    if (obj && obj[k] != null && obj[k] !== '') return obj[k];
  }
  return null;
}

function dailyDocId(teamIdUpper, dateStr) {
  // mantém o mesmo padrão do seu front (teamId + '_' + date),
  // mas com teamId em MAIÚSCULAS como você pediu.
  const t = safeString(teamIdUpper).replaceAll('/', '_');
  const d = safeString(dateStr);
  return `${t}_${d}`;
}

function normalizeDailyDoc(raw, fallbackTeamId = '') {
  const dateVal = pick(raw, ['date', 'data', 'day', 'dia', 'createdAt']);
  const dateStr = normalizeDateToIso(dateVal);
  const teamId = normalizeTeamId(raw.teamId || fallbackTeamId);

  const recordsRaw = Array.isArray(raw.records)
    ? raw.records
    : Array.isArray(raw.frequencias)
      ? raw.frequencias
      : Array.isArray(raw.lista)
        ? raw.lista
        : Array.isArray(raw.presencas)
          ? raw.presencas
          : [];

  const docUpdatedMs =
    toMillisMaybe(raw.updatedAt) ||
    toMillisMaybe(raw.updateAt) ||
    toMillisMaybe(raw.updated_at) ||
    0;

  const records = (Array.isArray(recordsRaw) ? recordsRaw : [])
    .map((r) => {
      if (!r) return null;
      const employeeId = safeString(
        r.employeeId != null ? r.employeeId :
        r.colaboradorId != null ? r.colaboradorId :
        r.id != null ? r.id :
        r.matricula != null ? r.matricula :
        r.userId != null ? r.userId :
        r.uid != null ? r.uid :
        ''
      );
      if (!employeeId) return null;

      const status = normalizeStatus(
        r.status != null ? r.status :
        r.situacao != null ? r.situacao :
        r.presenca != null ? r.presenca :
        r.valor != null ? r.valor :
        ''
      );

      const rowUpdatedMs =
        toMillisMaybe(r.updatedAt) ||
        toMillisMaybe(r.updateAt) ||
        toMillisMaybe(r.updated_at) ||
        docUpdatedMs ||
        0;

      return {
        employeeId,
        status,
        _srcUpdatedMs: rowUpdatedMs,
        // preserva auditoria se existir (não é obrigatório pra migração, mas é útil)
        createdBy: safeString(r.createdBy) || undefined,
        createdRole: safeString(r.createdRole) || undefined,
        updatedBy: safeString(r.updatedBy) || undefined,
        updatedRole: safeString(r.updatedRole) || undefined
      };
    })
    .filter(Boolean);

  return {
    teamId,
    date: dateStr,
    _srcUpdatedMs: docUpdatedMs,
    records
  };
}

async function listAllDocs(collectionName) {
  // paginação por documentId para evitar limites em coleções grandes
  const out = [];
  const pageSize = 1000;
  let last = null;

  while (true) {
    let q = db.collection(collectionName).orderBy(admin.firestore.FieldPath.documentId()).limit(pageSize);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    for (const d of snap.docs) out.push({ id: d.id, data: d.data() || {} });
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < pageSize) break;
  }
  return out;
}

function consolidate(dailyDocs, legacyDocs) {
  // Map dayKey -> { teamId, date, docUpdatedMs, byEmployee: Map }
  const byDay = new Map();

  const ingest = (doc, sourceLabel) => {
    if (!doc.teamId || !doc.date) return;
    const dayKey = `${doc.teamId}__${doc.date}`;
    let bucket = byDay.get(dayKey);
    if (!bucket) {
      bucket = { teamId: doc.teamId, date: doc.date, docUpdatedMs: doc._srcUpdatedMs || 0, byEmployee: new Map() };
      byDay.set(dayKey, bucket);
    } else {
      bucket.docUpdatedMs = Math.max(bucket.docUpdatedMs, doc._srcUpdatedMs || 0);
    }

    for (const r of doc.records || []) {
      const k = safeString(r.employeeId);
      if (!k) continue;
      const prev = bucket.byEmployee.get(k);
      const curMs = Number(r._srcUpdatedMs || 0) || 0;
      const prevMs = Number(prev?._srcUpdatedMs || 0) || 0;
      if (!prev || curMs >= prevMs) {
        bucket.byEmployee.set(k, { ...r, _srcUpdatedMs: curMs, _src: sourceLabel });
      }
    }
  };

  dailyDocs.forEach((d) => ingest(d, 'daily_attendance'));
  legacyDocs.forEach((d) => ingest(d, 'frequencias'));

  const out = [];
  for (const bucket of byDay.values()) {
    const records = Array.from(bucket.byEmployee.values()).map((r) => ({
      employeeId: r.employeeId,
      status: r.status,
      createdBy: r.createdBy,
      createdRole: r.createdRole,
      updatedBy: r.updatedBy,
      updatedRole: r.updatedRole,
      // mantém tipo Timestamp coerente
      updatedAt: r._srcUpdatedMs ? admin.firestore.Timestamp.fromMillis(r._srcUpdatedMs) : admin.firestore.Timestamp.now()
    }));
    out.push({
      teamId: bucket.teamId,
      date: bucket.date,
      records,
      _srcUpdatedMs: bucket.docUpdatedMs || 0
    });
  }

  out.sort((a, b) => (a.teamId + a.date).localeCompare(b.teamId + b.date));
  return out;
}

async function writeInBatches(consolidatedDocs) {
  let written = 0;
  let batch = db.batch();
  let ops = 0;

  const flush = async () => {
    if (ops === 0) return;
    if (DRY_RUN) {
      console.log(`[MIGRAÇÃO] DRY_RUN ativo — batch com ${ops} operações (não executado).`);
    } else {
      await batch.commit();
      console.log(`[MIGRAÇÃO] Batch commitado (${ops} operações).`);
    }
    batch = db.batch();
    ops = 0;
  };

  for (let i = 0; i < consolidatedDocs.length; i++) {
    const d = consolidatedDocs[i];
    logProgress(i + 1, consolidatedDocs.length, `${d.teamId} ${d.date}`);

    const docId = dailyDocId(d.teamId, d.date);
    const ref = db.collection(COL_DAILY).doc(docId);

    const payload = {
      teamId: d.teamId,
      date: d.date,
      records: d.records,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: 'migration',
      updatedRole: 'system'
    };

    batch.set(ref, payload, { merge: true });
    ops += 1;
    written += 1;

    if (ops >= 500) await flush();
  }
  await flush();
  return written;
}

async function deleteCollection(collectionName) {
  // delete em batches (Admin SDK). Para coleções gigantes, rode por etapas.
  const pageSize = 400;
  let deleted = 0;
  while (true) {
    const snap = await db
      .collection(collectionName)
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(pageSize)
      .get();
    if (snap.empty) break;
    let batch = db.batch();
    let ops = 0;
    for (const doc of snap.docs) {
      batch.delete(doc.ref);
      ops++;
      deleted++;
      if (ops >= 500) {
        if (!DRY_RUN) await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    }
    if (ops > 0 && !DRY_RUN) await batch.commit();
    console.log(`[MIGRAÇÃO] deleteCollection(${collectionName}) — deletados até agora: ${deleted}`);
    if (snap.size < pageSize) break;
  }
  return deleted;
}

async function cleanupLegacy({ deleteFrequencias, deleteDirtyDaily }) {
  if (!RUN_CLEANUP) {
    console.log('[MIGRAÇÃO] Cleanup não solicitado (use --cleanup).');
    return;
  }
  if (!CONFIRM_DELETE_LEGACY) {
    console.log('[MIGRAÇÃO] Para apagar legado, defina CONFIRM_DELETE_LEGACY=true.');
    return;
  }

  if (deleteFrequencias) {
    console.log('[MIGRAÇÃO] Apagando coleção legada frequencias...');
    const n = await deleteCollection(COL_LEGACY);
    console.log(`[MIGRAÇÃO] frequencias apagada. Total: ${n}`);
  }

  if (deleteDirtyDaily) {
    // Estratégia conservadora: apaga SOMENTE docs de daily_attendance que não respeitam o schema mínimo (teamId/date string)
    console.log('[MIGRAÇÃO] Procurando documentos "sujos" em daily_attendance para apagar (conservador)...');
    const all = await listAllDocs(COL_DAILY);
    let batch = db.batch();
    let ops = 0;
    let deleted = 0;
    for (let i = 0; i < all.length; i++) {
      const { id, data } = all[i];
      const teamId = normalizeTeamId(data.teamId);
      const dateStr = normalizeDateToIso(pick(data, ['date', 'data', 'day', 'dia']));
      const ok = !!teamId && !!dateStr && typeof pick(data, ['date', 'data']) !== 'object';
      if (ok) continue;
      const ref = db.collection(COL_DAILY).doc(id);
      batch.delete(ref);
      ops++;
      deleted++;
      if (ops >= 500) {
        if (!DRY_RUN) await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    }
    if (ops > 0 && !DRY_RUN) await batch.commit();
    console.log(`[MIGRAÇÃO] daily_attendance (docs sujos) apagados. Total: ${deleted}`);
  }
}

async function main() {
  console.log('[MIGRAÇÃO] Iniciando migração de presença.');
  console.log('[MIGRAÇÃO] Config:', {
    DRY_RUN,
    projectId: FIREBASE_PROJECT_ID || '(auto)',
    cleanup: RUN_CLEANUP,
    DELETE_FREQUENCIAS,
    DELETE_DIRTY_DAILY
  });

  const [dailyRaw, legacyRaw] = await Promise.all([
    listAllDocs(COL_DAILY),
    listAllDocs(COL_LEGACY)
  ]);

  console.log('[MIGRAÇÃO] Lidos:', {
    daily_attendance: dailyRaw.length,
    frequencias: legacyRaw.length
  });

  const dailyNorm = dailyRaw
    .map(({ data }) => normalizeDailyDoc(data))
    .filter((d) => d.teamId && d.date);
  const legacyNorm = legacyRaw
    .map(({ data }) => normalizeDailyDoc(data))
    .filter((d) => d.teamId && d.date);

  const consolidated = consolidate(dailyNorm, legacyNorm);
  console.log('[MIGRAÇÃO] Consolidado (teamId+date):', consolidated.length);

  const written = await writeInBatches(consolidated);
  console.log('[MIGRAÇÃO] Escritas agendadas:', written, DRY_RUN ? '(DRY_RUN)' : '');

  await cleanupLegacy({ deleteFrequencias: DELETE_FREQUENCIAS, deleteDirtyDaily: DELETE_DIRTY_DAILY });
  console.log('[MIGRAÇÃO] Finalizado.');
}

main().catch((e) => {
  console.error('[MIGRAÇÃO] Erro fatal:', e?.stack || e);
  process.exitCode = 1;
});

