# Migração Firestore — Presença (`daily_attendance` + `frequencias`)

Este pacote contém um script **one-shot** (Node.js + Firebase Admin) para:

- Ler e unificar os dados de presença de `frequencias` (legado) e `daily_attendance` (novo)
- Normalizar datas para **string `YYYY-MM-DD`**
- Normalizar status para **`presente` | `falta` | `justificado`**
- Garantir `teamId` em **SNAKE_CASE (MAIÚSCULO sem espaços)** e `updatedAt` como **Timestamp**
- Deduplicar por **(teamId, date, employeeId)** mantendo o registro mais recente (por `updatedAt`)
- Gravar em **`daily_attendance`** usando `writeBatch` em blocos de **500**
- (Opcional) Limpar o legado apagando `frequencias` e/ou documentos “sujos” em `daily_attendance`

## Pré-requisitos

- Node.js 18+
- Uma Service Account com permissão no Firestore (Admin SDK)

## Setup

Dentro de `scripts/migration/`:

```bash
npm i
```

Crie um arquivo `.env` (opcional) em `scripts/migration/.env`:

```bash
# Recomendado: arquivo JSON da service account
GOOGLE_APPLICATION_CREDENTIALS="C:\\caminho\\service-account.json"

# Alternativa (sem arquivo): JSON completo da service account numa variável
# (útil em CI; cuidado com histórico/segredos)
# SERVICE_ACCOUNT_JSON="{\"type\":\"service_account\", ... }"

# Opcional (se não estiver no JSON / ou quiser forçar)
FIREBASE_PROJECT_ID="seu-project-id"

# Segurança
DRY_RUN="true"
```

## Rodar migração (dry-run primeiro)

```bash
npm run migrate:attendance
```

Quando estiver satisfeito, rode em modo real:

```bash
set DRY_RUN=false
npm run migrate:attendance
```

## Limpeza do legado (apagar coleções antigas)

Para habilitar limpeza você precisa **duas travas**:

- Rodar com `--cleanup`
- Setar `CONFIRM_DELETE_LEGACY=true`

Exemplo:

```bash
set CONFIRM_DELETE_LEGACY=true
node ./migrate-attendance.mjs --cleanup
```

Flags de limpeza (env):

- `DELETE_FREQUENCIAS=true|false` (default: `false`)
- `DELETE_DIRTY_DAILY=true|false` (default: `false`)

> Dica: ative uma de cada vez, começando por `DELETE_FREQUENCIAS=true`.

## Normalizar `teamId` em `users` e `leaders` (go-live das regras)

Se o `teamId` estiver divergente entre:

- CSV (coluna LÍDER)
- `daily_attendance.teamId`
- `users/{uid}.teamId` e/ou `leaders/{docId}.teamId`

o escopo vai falhar nas regras (`data.teamId == userTeamId()`) e o dashboard pode “zerar”.

Rode primeiro em dry-run:

```bash
node ./normalize-teamids.mjs
```

Depois, em modo real:

```bash
set DRY_RUN=false
node ./normalize-teamids.mjs
```

Se você ainda usa a coleção `leaders` com **ID do documento igual ao teamId**, e quiser apagar os docs antigos após copiar para o ID normalizado:

```bash
set DRY_RUN=false
node ./normalize-teamids.mjs --delete-old-leader-docs
```

