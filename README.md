# Lumini — Gestão de Carreira & Polivalência

Sistema web completo para gestão de trilha de carreira, polivalência, equipes de produção e módulo RH com dashboard de turnover.

---

## 🚀 Funcionalidades Implementadas

### 🔐 Autenticação & Perfis
- Login por e-mail/senha com 5 perfis: Admin, Gerente, Supervisores, Diretor, RH
- Sessão persistida via `sessionStorage`
- Logout com limpeza de estado

### 📊 Dashboards
| Perfil | Dashboard |
|--------|-----------|
| Admin (Wesley) | KPIs de carreira, gráficos por cargo/equipe/status, histórico de promoções |
| Gerente (André) | Resumo da equipe, pendências de aprovação |
| Supervisor | Painel pessoal, funcionários aptos |
| Diretor (Carlos) | Painel geral, aprovação final, RH e turnover |
| RH | Dashboard RH, cadastro de colaboradores, turnover |

### 👥 Gestão de Funcionários
- Tabela completa com busca, filtros e paginação
- Modal de cadastro com vínculo ao banco RH (179 colaboradores)
- Importação em lote do banco RH
- Trilha de carreira por colaborador

### 🏗️ Equipes de Produção (Admin + Gerente apenas)
- CRUD completo de equipes
- Auto-população a partir dos dados RH
- Visão por supervisor com métricas de eficiência
- Modal de membros com tabela detalhada

### 📈 Módulo RH (Firebase)
- 179 colaboradores reais seeded do arquivo rh-newtime.xlsx
- Dashboard com indicadores de admissão, demissão e turnover
- Filtros por setor, status, líder
- Turnover mensal com gráficos

### 📋 Fluxo de Promoções
- Supervisor inicia avaliação → Gerente aprova → Diretor homologa
- Solicitações de exceção (abaixo do tempo mínimo)
- Histórico completo com timeline

### 🌙 Modo Claro / Escuro
- Toggle iPhone-style no topbar
- ~40 variáveis CSS gerenciadas em `:root` e `body.dark-mode`
- Preferência salva em `localStorage` (`nt_dark_mode`)
- Aplica antes do DOM carregar (sem flash)

---

## 🎓 Tutorial Interativo (NOVO)

### Funcionamento
- **Exibição automática** no primeiro acesso de cada perfil
- **Botão "❓ Ajuda & Tutorial"** no rodapé da sidebar (sempre visível)
- **Badge "NOVO"** some após o tour ser concluído
- Tour disponível no **menu do avatar** (canto superior direito)

### Tours por Perfil
| Perfil | Passos | Destaques |
|--------|--------|-----------|
| Admin | 8 passos | Dashboard, Funcionários, Equipes, RH, Dark Mode, Notificações |
| Gerente | 6 passos | Painel, Exceções, Promoções, Equipes |
| Supervisor | 6 passos | Painel, Equipe, Exceções, Histórico |
| Diretor | 4 passos | Aprovação Final, Dashboard RH |
| RH | 5 passos | Dashboard, Cadastro, Turnover |

### Gerenciamento (Admin)
No Dashboard do Admin, seção **"Gerenciar Tutorial por Perfil"**:
- Resetar tutorial por perfil individualmente
- Resetar todos de uma vez
- Após reset, o usuário verá o tour automaticamente no próximo acesso

### Atalho de Teclado
- **`Alt + T`** → Abre o tutorial do perfil atual

---

## ⚡ Melhorias de UI/UX

### Sistema de Toast (Notificações)
```javascript
window._ntShowToast('Mensagem', 'success'); // success | error | warning | info
```
- Stack de toasts no canto inferior direito
- Auto-dismiss em 4 segundos
- Botão de fechar manual
- Animação de entrada/saída suave

### Confirm Dialog Moderno
```javascript
const ok = await window._ntConfirm({
  title: 'Confirmar exclusão',
  message: 'Esta ação não pode ser desfeita.',
  icon: '⚠️',
  okText: 'Excluir',
  cancelText: 'Cancelar'
});
```
- Substitui o `window.confirm` nativo
- Fecha com Esc
- Animação de entrada com spring

### Breadcrumb na Topbar
- Atualizado automaticamente ao navegar
- Visível em telas ≥ 640px

### Atalhos de Teclado
| Atalho | Ação |
|--------|------|
| `Alt + D` | Ir para o Dashboard |
| `Alt + T` | Abrir Tutorial |
| `Alt + M` | Alternar Dark Mode |
| `Alt + S` | Toggle Sidebar (mobile) |
| `Esc` | Fechar modais abertos |

### Micro-interações
- **Ripple effect** em botões `.btn-primary` e `.btn-outline`
- **Skeleton loaders** (classes `.skeleton`, `.skeleton-text`, etc.)
- **Tooltips** via atributo `data-tooltip="texto"`
- **Animações de entrada** para page sections e stat cards
- **Focus ring** acessível em todos os elementos interativos
- **Seleção de texto** com cor da marca

---

## 📁 Estrutura de Arquivos

```
index.html              — App principal (SPA)
css/
  style.css             — Estilos globais + variáveis + dark mode + onboarding
js/
  data.js               — Dados demo, usuários, cargos
  rh-data.js            — 179 colaboradores reais (seed)
  firebase-config.js    — Configuração Firebase
  firebase-db.js        — Persistência Firestore + listeners
  app.js                — Lógica principal, navegação, toast, confirm, breadcrumb
  rh-module.js          — Módulo RH (dashboard, tabelas, turnover)
  teams-module.js       — Módulo Equipes de Produção
  onboarding.js         — Tutorial interativo por perfil ← NOVO
images/
  logo-white.png        — Logo
  logo-black.png        — Favicon
  stamp-1..6.jpg        — Estampas da tela de login
```

---

## 🗄️ Modelo de Dados (Firebase Firestore)

| Coleção | Descrição |
|---------|-----------|
| `employees` | Funcionários na trilha de carreira (campo `rhMatricula` obrigatório) |
| `careers` | 10 cargos com requisitos de tempo mínimo |
| `evaluations` | Avaliações de desempenho |
| `excecoes` | Solicitações de exceção de promoção |
| `teams` | Equipes de produção por supervisor |

---

## 🔑 Credenciais de Acesso (Demo)

Senhas de demonstração: prefixo **Lumini** + sufixo por função — `admin` e `admin2` (dois administradores), `diretor`, `gerente`, `sup1` a `sup4` (supervisores) e `rh`. Exemplos: `Luminiadmin`, `Luminiadmin2`, `Luminidiretor`, `Luminigerente`, `Luminisup1`, `Luminirh`.

| Usuário | E-mail | Senha | Perfil |
|--------|--------|--------|--------|
| Wesley | admin@lumini | Luminiadmin | Administrador |
| Gustavo | admin2@lumini | Luminiadmin2 | Administrador |
| Carlos | diretor@lumini | Luminidiretor | Diretor |
| Samuel | gerente@lumini | Luminigerente | Gerente |
| Daniel | sup1@lumini | Luminisup1 | Supervisor |
| Kauê | sup2@lumini | Luminisup2 | Supervisor |
| Toni | sup3@lumini | Luminisup3 | Supervisor |
| Hélcio | sup4@lumini | Luminisup4 | Supervisor |
| RH | rh@lumini | Luminirh | RH |

---

## 🔧 Próximas Melhorias Sugeridas

- [ ] Modo offline com Service Worker
- [ ] Exportação de relatórios em PDF/Excel
- [ ] Notificações push via Firebase Cloud Messaging
- [ ] Avatar personalizado por usuário
- [ ] Log de auditoria (quem fez o quê e quando)
- [ ] Pesquisa global (`Ctrl+K`) com resultados de funcionários e páginas
- [ ] Bulk actions na tabela de funcionários
- [ ] Integração com calendário para datas de avaliação
