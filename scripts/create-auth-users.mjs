import admin from 'firebase-admin';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const USERS = [
  { email: 'admin@lumini.com',       password: 'Luminiadmin'    },
  { email: 'admin2@lumini.com',      password: 'Luminiadmin2'   },
  { email: 'lumini@lumini.com',      password: 'Luminilumini'   },
  { email: 'wesley@lumini.com',      password: 'Lumini@Wesley'  },
  { email: 'gustavo@lumini.com',     password: 'Lumini@Gustavo' },
  { email: 'diretor@lumini.com',     password: 'Luminidiretor'  },
  { email: 'carlos@lumini.com',      password: 'Lumini@Carlos'  },
  { email: 'gerente@lumini.com',     password: 'Luminigerente'  },
  { email: 'samuel@lumini.com',      password: 'Lumini@Samuel'  },
  { email: 'rh@lumini.com',          password: 'Luminirh'       },
  { email: 'rh2@lumini.com',         password: 'Luminirh2'      },
  { email: 'sup1@lumini.com',        password: 'Luminisup1'     },
  { email: 'sup2@lumini.com',        password: 'Luminisup2'     },
  { email: 'sup3@lumini.com',        password: 'Luminisup3'     },
  { email: 'sup4@lumini.com',        password: 'Luminisup4'     },
  { email: 'gustavo.exp@lumini.com', password: 'Lumini@GExp'    }
];

/** Alinha papéis aos e-mails seed (local antes de @). */
function resolveRole(email) {
  const local = String(email || '').split('@')[0].toLowerCase();
  if (local === 'gustavo.exp') return 'supervisor';
  if (/^sup[1-4]$/.test(local)) return 'supervisor';
  if (local === 'rh' || local === 'rh2') return 'rh';
  if (local === 'diretor' || local === 'carlos') return 'boss';
  if (local === 'gerente' || local === 'samuel') return 'manager';
  if (local.startsWith('admin') || local === 'lumini' || local === 'wesley' || local === 'gustavo') {
    return 'admin';
  }
  return 'supervisor';
}

let criados = 0;
let existiam = 0;
let falhas = 0;

for (const u of USERS) {
  try {
    const userRecord = await admin.auth().createUser({ email: u.email, password: u.password });
    await admin.firestore().collection('users').doc(userRecord.uid).set({
      email: u.email,
      name: u.email,
      role: resolveRole(u.email),
      createdAt: new Date()
    });
    console.log(`✅ Criado: ${u.email}`);
    criados++;
  } catch (e) {
    if (e.code === 'auth/email-already-exists') {
      console.log(`⚠️  Já existe: ${u.email}`);
      existiam++;
    } else {
      console.error(`❌ Falha: ${u.email} — ${e.message}`);
      falhas++;
    }
  }
}

console.log(`\n📊 Resultado: ${criados} criados | ${existiam} já existiam | ${falhas} falhas`);
process.exit(0);
