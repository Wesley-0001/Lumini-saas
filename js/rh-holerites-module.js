/* =============================================
   RH-HOLERITES-MODULE.JS — Publicação de holerites (PDF)
   Lumini — impacto mínimo; Firestore via firebase-db.js

   TEMPORÁRIO (demo): PDF lido no navegador (FileReader → data URL) e salvo em Firestore
   no campo fileDataUrl — sem Firebase Storage (evita CORS local). Ver comentários em
   _ntPublishHolerite em firebase-db.js. Limite de tamanho: ver HOLERITE_DEMO_MAX_BYTES.
============================================= */

(function() {
'use strict';

/** TEMP demo: Firestore limita documento a ~1 MiB; base64 aumenta ~33% o tamanho. */
const HOLERITE_DEMO_MAX_BYTES = 600 * 1024;

function _toast(msg, type) {
  if (window._ntShowToast) window._ntShowToast(msg, type || 'success');
  else alert(msg);
}

function _getCareerEmployees() {
  const fn = window.getEmployees;
  if (typeof fn !== 'function') return [];
  return fn().filter(e => e && e.rhMatricula && String(e.rhMatricula).trim() !== '');
}

function _escapeAttr(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function _isPdfFile(file) {
  if (!file) return false;
  if (!/\.pdf$/i.test(file.name || '')) return false;
  const t = file.type || '';
  if (t === 'application/pdf' || t === '') return true;
  if (t === 'application/octet-stream') return true;
  return false;
}

/**
 * @param {File} file
 * @returns {Promise<string>}
 */
function _readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(new Error('Não foi possível ler o arquivo. Tente outro PDF.'));
    r.readAsDataURL(file);
  });
}

/**
 * Renderiza a página de publicação de holerite.
 * @param {string} [targetId] — ex.: page-rh-holerites, page-admin-rh-holerites
 */
window._rhRenderHolerites = function(targetId) {
  const pageId = targetId || 'page-rh-holerites';
  const el = document.getElementById(pageId);
  if (!el) return;

  const emps = _getCareerEmployees().slice().sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'));

  const options = emps.map(e => {
    const mat = String(e.rhMatricula).trim();
    const label = `${e.name || '—'} · mat. ${mat}`;
    return `<option value="${_escapeAttr(e.id)}" data-mat="${_escapeAttr(mat)}" data-name="${_escapeAttr(e.name || '')}">${_escapeAttr(label)}</option>`;
  }).join('');

  const emptyOpt = '<option value="">Selecione o colaborador…</option>';
  const maxMb = (HOLERITE_DEMO_MAX_BYTES / (1024 * 1024)).toFixed(1).replace('.', ',');

  el.innerHTML = `
    <div class="page-header">
      <div>
        <h2><i class="fas fa-file-invoice-dollar"></i> Publicar Holerite</h2>
        <span class="page-sub">Envio de PDF para o Portal do Colaborador — vínculo pelo cadastro de carreira (matrícula RH)</span>
      </div>
    </div>

    <div class="rh-hol-card">
      <p class="rh-hol-intro">
        <i class="fas fa-info-circle" aria-hidden="true"></i>
        <strong>Modo demonstração (temporário):</strong> o PDF é lido no navegador e o conteúdo é gravado no Firestore
        (campo <code>fileDataUrl</code>) — <em>sem</em> Firebase Storage. Use PDFs de até ~${maxMb} MB para caber no limite do Firestore.
        O colaborador verá o documento em <strong>Meus Holerites</strong> no portal após o login.
      </p>

      <form id="rh-hol-form" class="rh-hol-form" autocomplete="off">
        <div class="form-row" style="display:grid;grid-template-columns:1fr;gap:14px;margin-bottom:14px">
          <div class="form-group" style="margin:0">
            <label for="rh-hol-employee">Colaborador <span class="required">*</span></label>
            <select id="rh-hol-employee" required class="rh-select" style="width:100%;max-width:100%">
              ${emptyOpt}
              ${options}
            </select>
            ${emps.length === 0 ? '<p class="rh-hol-warn">Nenhum colaborador com <code>rhMatricula</code> no cadastro de carreira. Importe do RH em Funcionários.</p>' : ''}
          </div>
        </div>

        <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;align-items:end">
          <div class="form-group" style="margin:0">
            <label for="rh-hol-competence">Competência (referência) <span class="required">*</span></label>
            <input type="month" id="rh-hol-competence" required class="rh-select" style="width:100%" />
            <span class="rh-hol-hint">Mês/ano a que o holerite se refere</span>
          </div>
          <div class="form-group" style="margin:0">
            <label for="rh-hol-file">Arquivo PDF <span class="required">*</span></label>
            <input type="file" id="rh-hol-file" accept="application/pdf,.pdf" required class="rh-hol-file-input" />
            <span class="rh-hol-hint">Apenas .pdf · máx. ${HOLERITE_DEMO_MAX_BYTES / 1024} KB (limite demo Firestore)</span>
          </div>
        </div>

        <div class="rh-hol-actions">
          <button type="submit" class="btn-primary" id="rh-hol-submit" ${emps.length === 0 ? 'disabled' : ''}>
            <i class="fas fa-cloud-upload-alt"></i> Publicar holerite
          </button>
        </div>
      </form>
    </div>
  `;

  const form = document.getElementById('rh-hol-form');
  if (!form) return;

  form.addEventListener('submit', async function(ev) {
    ev.preventDefault();
    if (!window._ntPublishHolerite) {
      _toast('Serviço de publicação indisponível. Recarregue a página.', 'error');
      return;
    }

    const sel = document.getElementById('rh-hol-employee');
    const opt = sel?.selectedOptions?.[0];
    const employeeId = sel?.value?.trim();
    const employeeName = opt?.getAttribute('data-name') || '';
    const rhMatricula  = opt?.getAttribute('data-mat') || '';

    const monthEl = document.getElementById('rh-hol-competence');
    const monthVal = monthEl?.value?.trim() || '';
    let competence = monthVal;
    if (monthVal && /^\d{4}-\d{2}$/.test(monthVal)) {
      const [y, m] = monthVal.split('-');
      competence = `${m}/${y}`;
    }

    const fileInput = document.getElementById('rh-hol-file');
    const file = fileInput?.files?.[0];
    const btn = document.getElementById('rh-hol-submit');

    if (!employeeId || !file) {
      _toast('Selecione colaborador e arquivo PDF.', 'warning');
      return;
    }

    if (!_isPdfFile(file)) {
      _toast('Envie apenas um arquivo PDF (.pdf).', 'warning');
      return;
    }

    if (file.size > HOLERITE_DEMO_MAX_BYTES) {
      _toast(
        `Arquivo muito grande (${Math.ceil(file.size / 1024)} KB). Para esta demonstração, use um PDF de até ${HOLERITE_DEMO_MAX_BYTES / 1024} KB (limite do Firestore por documento).`,
        'error'
      );
      return;
    }

    const uploadedBy = window.currentUser?.email || '';

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Lendo e gravando…';
    }

    try {
      const fileDataUrl = await _readFileAsDataURL(file);
      await window._ntPublishHolerite({
        employeeId,
        employeeName,
        rhMatricula,
        competence,
        fileName: file.name || 'holerite.pdf',
        fileDataUrl,
        uploadedBy
      });
      _toast('Holerite publicado com sucesso.', 'success');
      form.reset();
    } catch (err) {
      console.error('[RH Holerites]', err);
      const msg = err && err.message
        ? err.message
        : 'Falha ao publicar. Verifique Firestore, tamanho do PDF e permissões.';
      _toast(msg, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Publicar holerite';
      }
    }
  });
};

window._rhRenderHoleritesIn = function(targetId) {
  window._rhRenderHolerites(targetId || 'page-admin-rh-holerites');
};

console.log('✅ RH Holerites Module carregado.');
})();
