import 'dotenv/config';
import admin from 'firebase-admin';

const DRY_RUN = String(process.env.DRY_RUN || 'true').toLowerCase() !== 'false';
const FIREBASE_PROJECT_ID =
  (process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || '').trim();
const SERVICE_ACCOUNT_JSON = (process.env.SERVICE_ACCOUNT_JSON || '').trim();

const DELETE_OLD_LEADER_DOCS = process.argv.includes('--delete-old-leader-docs');

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
    admin.initializeApp(FIREBASE_PROJECT_ID ? { projectId: FIREBASE_PROJECT_ID } : undefined);
  }
}

const db = admin.firestore();

function safeString(v) {
  return String(v == null ? '' : v).trim();
}

function normalizeTeamId(v) {
  const s = safeString(v);
  if (!s) return '';
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[\s\-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/[^A-Z0-9_]/g, '');
}

async function listAllDocs(collectionName) {
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

async function flushBatch(batch, ops) {
  if (!ops) return;
  if (DRY_RUN) return;
  await batch.commit();
}

async function normalizeUsers() {
  const COL = 'users';
  const all = await listAllDocs(COL);
  console.log('[TEAMID] users: lidos', all.length);

  let batch = db.batch();
  let ops = 0;
  let updated = 0;
  for (const { id, data } of all) {
    const current = safeString(data.teamId);
    const norm = normalizeTeamId(current);
    if (!current || !norm || current === norm) continue;
    const ref = db.collection(COL).doc(id);
    batch.update(ref, { teamId: norm, updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: 'normalize-teamids' });
    ops += 1;
    updated += 1;
    if (ops >= 450) {
      await flushBatch(batch, ops);
      batch = db.batch();
      ops = 0;
    }
  }
  await flushBatch(batch, ops);
  console.log('[TEAMID] users: teamId normalizados', updated, DRY_RUN ? '(DRY_RUN)' : '');
}

async function normalizeLeaders() {
  const COL = 'leaders';
  const all = await listAllDocs(COL);
  console.log('[TEAMID] leaders: lidos', all.length);

  let batch = db.batch();
  let ops = 0;
  let updatedFields = 0;
  let copiedDocs = 0;
  let deletedOld = 0;

  for (const { id, data } of all) {
    const currentField = safeString(data.teamId || data.teamKey || data.leaderKey);
    const norm = normalizeTeamId(currentField || id);
    if (!norm) continue;

    const needsFieldUpdate = safeString(data.teamId) !== norm;
    const needsIdMove = id !== norm;

    if (needsIdMove) {
      const fromRef = db.collection(COL).doc(id);
      const toRef = db.collection(COL).doc(norm);

      const payload = {
        ...data,
        teamId: norm,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: 'normalize-teamids'
      };

      batch.set(toRef, payload, { merge: true });
      ops += 1;
      copiedDocs += 1;

      if (DELETE_OLD_LEADER_DOCS) {
        batch.delete(fromRef);
        ops += 1;
        deletedOld += 1;
      }
    } else if (needsFieldUpdate) {
      const ref = db.collection(COL).doc(id);
      batch.update(ref, { teamId: norm, updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: 'normalize-teamids' });
      ops += 1;
      updatedFields += 1;
    }

    if (ops >= 400) {
      await flushBatch(batch, ops);
      batch = db.batch();
      ops = 0;
    }
  }

  await flushBatch(batch, ops);
  console.log('[TEAMID] leaders: campos atualizados', updatedFields, DRY_RUN ? '(DRY_RUN)' : '');
  console.log('[TEAMID] leaders: docs copiados p/ ID normalizado', copiedDocs, DRY_RUN ? '(DRY_RUN)' : '');
  console.log('[TEAMID] leaders: docs antigos deletados', deletedOld, DRY_RUN ? '(DRY_RUN)' : '');
}

async function main() {
  console.log('[TEAMID] Normalização de teamId iniciada.');
  console.log('[TEAMID] Config:', { DRY_RUN, projectId: FIREBASE_PROJECT_ID || '(auto)', DELETE_OLD_LEADER_DOCS });

  await normalizeUsers();
  await normalizeLeaders();

  console.log('[TEAMID] Finalizado.');
}

main().catch((e) => {
  console.error('[TEAMID] Erro fatal:', e?.stack || e);
  process.exitCode = 1;
});

