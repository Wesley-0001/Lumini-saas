/*
  ============================================================
  FIREBASE-CONFIG.JS — Fonte única de configuração
  Lumini — Gestão de Carreira & Polivalência
  ============================================================

  ## Manual rápido: como trocar a API Key no futuro

  Esta aplicação lê o config do Firebase a partir de `window.firebaseConfig`
  (definido aqui) e o módulo `js/firebase-db.js` inicializa o Firebase usando
  exatamente este objeto.

  Quando a API Key for rotacionada/restrita no Google Cloud, o sintoma típico
  no front é falha de autenticação/conexão (ex.: `auth/api-key-not-valid`).

  Passo a passo (Google Cloud Console):
  - Acesse o projeto correto no Google Cloud Console.
  - Vá em **APIs e serviços → Credenciais**.
  - Encontre a credencial **Chave de API** usada pelo Firebase e escolha:
    - **Editar** para ajustar restrições (HTTP referrers / websites), ou
    - **Criar chave** / **Rotacionar** (se necessário).
  - Copie a nova chave e substitua o valor em `apiKey` abaixo.

  Observações importantes:
  - Esta chave deve ser para uso **Web** e normalmente é restringida por domínio
    (HTTP referrers). Se você alterar o domínio (ex.: novo host), atualize as
    restrições na mesma tela do Google Cloud Console.
  - Cole a chave sem espaços/quebras de linha. Este arquivo aplica `.trim()`
    como proteção contra caracteres invisíveis.

  Ordem dos scripts:
  - `js/firebase-config.js` deve ser carregado ANTES de qualquer arquivo que
    dependa de `window.firebaseConfig` (incluindo `js/firebase-db.js` e `js/app.js`).
*/

(function () {
  'use strict';

  // Sanitização extrema: garante que não exista whitespace/quebras de linha/caracteres ocultos na apiKey.
  // Evita casos onde a chave "parece" correta, mas foi colada com caracteres invisíveis.
  const apiKey = String("AIzaSyAVB6QZCUbE4fUyrFMh7Oex0rcNRLVP9uI").trim();

  window.firebaseConfig = {
    apiKey,
    authDomain:        "lumini-sabor-nt.firebaseapp.com",
    projectId:         "lumini-sabor-nt",
    storageBucket:     "lumini-sabor-nt.firebasestorage.app",
    messagingSenderId: "622572697165",
    appId:             "1:622572697165:web:8b2d201870b39dc88b0e04"
  };
})();
