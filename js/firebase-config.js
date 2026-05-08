/* =============================================
   FIREBASE-CONFIG.JS — Fonte única de configuração
   Lumini — Gestão de Carreira & Polivalência

   ▸ Script CLÁSSICO (sem type="module") — executa
     SÍNCRONAMENTE quando encontrado no HTML, antes
     de qualquer módulo deferido.
   ▸ Centraliza a config do Firebase para que tanto
     o módulo `firebase-db.js` quanto scripts clássicos
     (app.js etc.) leiam do mesmo lugar.
   ▸ DEVE ser carregado ANTES de todos os outros scripts
     que dependem de `window.firebaseConfig`.

   Projeto Firebase: lumini-sabor-nt
============================================= */

(function () {
  'use strict';

  window.firebaseConfig = {
    apiKey:            "AIzaSyAVB6QZCUE4fUyrFMh7Oex0rcNRLVP9uI",
    authDomain:        "lumini-sabor-nt.firebaseapp.com",
    projectId:         "lumini-sabor-nt",
    storageBucket:     "lumini-sabor-nt.firebasestorage.app",
    messagingSenderId: "622572697165",
    appId:             "1:622572697165:web:8b2d201870b39dc88b0e04"
  };
})();
