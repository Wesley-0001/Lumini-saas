/* =============================================
   PURCHASES-MODULE.JS — Módulo de Compras
   Lumini — Gestão de Carreira & Polivalência

   Entidades:
   - suppliers  (fornecedores)
   - products   (produtos/insumos)
   - purchases  (requisições de compra)
============================================= */

(function() {
'use strict';

// ─── ESTADO LOCAL ────────────────────────────
let _suppliers = [];
let _products  = [];
let _purchases = [];

// ─── FILTROS E PAGINAÇÃO ─────────────────────
let _purchFilter = { search: '', status: '', supplier: '' };
let _supplFilter = { search: '' };
let _prodFilter  = { search: '' };

// ─── STATUS CONFIG ───────────────────────────
const STATUS = {
  pending:   { label: 'Pendente',   cls: 'badge-warning',  icon: '⏳' },
  approved:  { label: 'Aprovada',   cls: 'badge-info',     icon: '✅' },
  purchased: { label: 'Comprado',   cls: 'badge-primary',  icon: '🛒' },
  delivered: { label: 'Entregue',   cls: 'badge-success',  icon: '📦' },
  cancelled: { label: 'Cancelada',  cls: 'badge-danger',   icon: '❌' }
};

// ─── GETTERS/SETTERS VIA FIREBASE ────────────
function getSuppliers() { return window._cache.suppliers || []; }
function getProducts()  { return window._cache.products  || []; }
function getPurchases() { return window._cache.purchases || []; }

function saveSuppliers(arr) {
  window._cache.suppliers = arr;
  if (window.persistCollection) window.persistCollection('suppliers', arr);
}
function saveProducts(arr) {
  window._cache.products = arr;
  if (window.persistCollection) window.persistCollection('products', arr);
}
function savePurchases(arr) {
  window._cache.purchases = arr;
  if (window.persistCollection) window.persistCollection('purchases', arr);
}

// ─── HELPERS ─────────────────────────────────
function uid() { return 'pur-' + Date.now() + '-' + Math.random().toString(36).slice(2,7); }
function fmtCurrency(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('pt-BR');
}
function currentUserName() {
  return window.currentUser ? window.currentUser.name : 'Sistema';
}

function _normPurchEmail(e) {
  return String(e || '').trim().toLowerCase();
}

function _isPurchaseRequester(p) {
  const u = window.currentUser;
  if (!u) return false;
  if (p.requesterEmail && _normPurchEmail(p.requesterEmail) === _normPurchEmail(u.email)) return true;
  if (p.requester && String(p.requester).trim() === String(u.name).trim()) return true;
  return false;
}

function _canRequestPurchaseCancel(p) {
  if (['cancelled', 'delivered'].includes(p.status)) return false;
  if (p.cancelRequestStatus === 'pending') return false;
  if (!_isPurchaseRequester(p)) return false;
  return ['pending', 'approved', 'purchased'].includes(p.status);
}

function _toast(msg, type = 'success') {
  if (window._ntShowToast) window._ntShowToast(msg, type);
}

async function _confirm(opts) {
  if (window._ntConfirm) return await window._ntConfirm(opts);
  return window.confirm(opts.message || 'Confirmar?');
}

// ─── RENDER PRINCIPAL — COMPRAS ──────────────
window._purchRender = function(containerId = 'page-purchases') {
  if (!window.guardPage('purchases')) return;

  const container = document.getElementById(containerId);
  if (!container) return;

  _purchases = getPurchases();
  _suppliers = getSuppliers();
  _products  = getProducts();

  const canApprove = ['admin','manager','boss'].includes(window.currentUser?.role);
  const canCreate  = window.currentUser?.role !== 'boss';

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2><i class="fas fa-shopping-cart"></i> Compras</h2>
        <span class="page-sub">Requisições de compra e controle de fornecedores</span>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${canCreate ? `
        <button class="btn-outline" onclick="window._purchOpenSuppliers()">
          <i class="fas fa-truck"></i> Fornecedores
        </button>
        <button class="btn-outline" onclick="window._purchOpenProducts()">
          <i class="fas fa-box"></i> Produtos
        </button>
        <button class="btn-primary" onclick="window._purchOpenModal()">
          <i class="fas fa-plus"></i> Nova Requisição
        </button>
        ` : ''}
      </div>
    </div>

    <!-- KPIs -->
    <div class="cards-grid" style="grid-template-columns:repeat(auto-fill,minmax(180px,1fr));margin-bottom:20px">
      ${_renderPurchKpis()}
    </div>

    <!-- Filtros -->
    <div class="rh-filter-bar" style="margin-bottom:16px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">
      <div class="rh-search-wrap" style="flex:1;min-width:200px">
        <i class="fas fa-search" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#9CA3AF;font-size:13px"></i>
        <input type="text" id="purch-search" placeholder="Buscar requisição..." value="${_purchFilter.search}"
          style="padding-left:36px;width:100%"
          oninput="_purchFilter.search=this.value;window._purchRender('${containerId}')">
      </div>
      <select class="rh-select" id="purch-status-filter" onchange="_purchFilter.status=this.value;window._purchRender('${containerId}')">
        <option value="">Todos os status</option>
        ${Object.entries(STATUS).map(([k,v])=>`<option value="${k}" ${_purchFilter.status===k?'selected':''}>${v.icon} ${v.label}</option>`).join('')}
      </select>
      <select class="rh-select" id="purch-sup-filter" onchange="_purchFilter.supplier=this.value;window._purchRender('${containerId}')">
        <option value="">Todos os fornecedores</option>
        ${getSuppliers().map(s=>`<option value="${s.id}" ${_purchFilter.supplier===s.id?'selected':''}>${s.name}</option>`).join('')}
      </select>
    </div>

    <!-- Tabela -->
    <div class="table-wrapper">
      <table class="data-table" id="purchases-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Título</th>
            <th>Fornecedor</th>
            <th>Itens</th>
            <th>Total</th>
            <th>Status</th>
            <th>Data</th>
            <th>Solicitante</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody id="purch-tbody">
          ${_renderPurchRows(canApprove)}
        </tbody>
      </table>
    </div>
  `;
};

function _renderPurchKpis() {
  const all = getPurchases();
  const total    = all.length;
  const pending  = all.filter(p => p.status === 'pending').length;
  const approved = all.filter(p => p.status === 'approved').length;
  const delivered = all.filter(p => p.status === 'delivered').length;
  const totalValue = all.reduce((s, p) => s + (p.total || 0), 0);

  return `
    <div class="stat-card blue">
      <div class="stat-icon"><i class="fas fa-file-alt"></i></div>
      <div class="stat-info"><span class="stat-value">${total}</span><span class="stat-label">Total de Requisições</span></div>
    </div>
    <div class="stat-card orange">
      <div class="stat-icon"><i class="fas fa-clock"></i></div>
      <div class="stat-info"><span class="stat-value">${pending}</span><span class="stat-label">Pendentes</span></div>
    </div>
    <div class="stat-card teal">
      <div class="stat-icon"><i class="fas fa-check-circle"></i></div>
      <div class="stat-info"><span class="stat-value">${approved}</span><span class="stat-label">Aprovadas</span></div>
    </div>
    <div class="stat-card green">
      <div class="stat-icon"><i class="fas fa-truck"></i></div>
      <div class="stat-info"><span class="stat-value">${delivered}</span><span class="stat-label">Entregues</span></div>
    </div>
    <div class="stat-card purple">
      <div class="stat-icon"><i class="fas fa-dollar-sign"></i></div>
      <div class="stat-info"><span class="stat-value" style="font-size:18px">${fmtCurrency(totalValue)}</span><span class="stat-label">Valor Total</span></div>
    </div>
  `;
}

function _renderPurchRows(canApprove) {
  let items = getPurchases();

  // Filtros
  if (_purchFilter.search) {
    const q = _purchFilter.search.toLowerCase();
    items = items.filter(p => p.title?.toLowerCase().includes(q) || p.requester?.toLowerCase().includes(q));
  }
  if (_purchFilter.status)   items = items.filter(p => p.status === _purchFilter.status);
  if (_purchFilter.supplier) items = items.filter(p => p.supplierId === _purchFilter.supplier);

  // Ordenar por data desc
  items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  if (!items.length) return `<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--text-muted)">
    <div style="font-size:32px;margin-bottom:8px">🛒</div>Nenhuma requisição encontrada</td></tr>`;

  return items.map((p, i) => {
    const sup = getSuppliers().find(s => s.id === p.supplierId);
    const st  = STATUS[p.status] || STATUS.pending;
    const cancelPending = p.cancelRequestStatus === 'pending';
    const canEdit = (p.status === 'pending') && (window.currentUser?.role !== 'boss') && !cancelPending;
    const showReqCancel = _canRequestPurchaseCancel(p);
    const canResolveCancel = canApprove && cancelPending;
    return `
    <tr>
      <td style="color:var(--text-muted);font-size:12px">#${String(i+1).padStart(3,'0')}</td>
      <td>
        <div style="font-weight:600;color:var(--text-primary)">${p.title || '—'}</div>
        <div style="font-size:11px;color:var(--text-muted)">${(p.items||[]).length} item(s)</div>
      </td>
      <td>${sup ? `<span style="font-weight:500">${sup.name}</span>` : '<span style="color:var(--text-muted)">—</span>'}</td>
      <td style="text-align:center">${(p.items||[]).length}</td>
      <td style="font-weight:700;color:var(--text-primary)">${fmtCurrency(p.total)}</td>
      <td>
        <span class="purch-badge ${st.cls}">${st.icon} ${st.label}</span>
        ${cancelPending ? '<div style="margin-top:4px"><span class="purch-badge badge-warning" title="Cancelamento pendente de análise"><i class="fas fa-hourglass-half"></i> Cancel. pendente</span></div>' : ''}
      </td>
      <td style="font-size:12px;color:var(--text-secondary)">${fmtDate(p.createdAt)}</td>
      <td style="font-size:12px">${p.requester || '—'}</td>
      <td>
        <div style="display:flex;gap:4px;flex-wrap:wrap">
          <button class="btn-icon" onclick="window._purchViewModal('${p.id}')" title="Ver detalhes" data-tooltip="Ver detalhes">
            <i class="fas fa-eye"></i>
          </button>
          ${canEdit ? `<button class="btn-icon" onclick="window._purchOpenModal('${p.id}')" title="Editar" data-tooltip="Editar">
            <i class="fas fa-edit"></i>
          </button>` : ''}
          ${canApprove && p.status === 'pending' && !cancelPending ? `<button class="btn-icon" style="color:#16A34A" onclick="window._purchApprove('${p.id}')" title="Aprovar" data-tooltip="Aprovar">
            <i class="fas fa-check"></i>
          </button>` : ''}
          ${canApprove && p.status === 'approved' && !cancelPending ? `<button class="btn-icon" style="color:#2563EB" onclick="window._purchAdvance('${p.id}','purchased')" title="Marcar como Comprado" data-tooltip="Marcar Comprado">
            <i class="fas fa-shopping-bag"></i>
          </button>` : ''}
          ${canApprove && p.status === 'purchased' && !cancelPending ? `<button class="btn-icon" style="color:#0D9488" onclick="window._purchAdvance('${p.id}','delivered')" title="Marcar como Entregue" data-tooltip="Marcar Entregue">
            <i class="fas fa-truck"></i>
          </button>` : ''}
          ${canEdit ? `<button class="btn-icon" style="color:#DC2626" onclick="window._purchDelete('${p.id}')" title="Excluir" data-tooltip="Excluir">
            <i class="fas fa-trash"></i>
          </button>` : ''}
          ${showReqCancel ? `<button class="btn-icon" style="color:#B45309" onclick="window._purchRequestCancel('${p.id}')" title="Solicitar cancelamento">
            <i class="fas fa-ban"></i>
          </button>` : ''}
          ${canResolveCancel ? `
          <button class="btn-icon" style="color:#16A34A" onclick="window._purchResolveCancel('${p.id}',true)" title="Aprovar cancelamento">
            <i class="fas fa-check-double"></i>
          </button>
          <button class="btn-icon" style="color:#DC2626" onclick="window._purchResolveCancel('${p.id}',false)" title="Recusar cancelamento">
            <i class="fas fa-times-circle"></i>
          </button>` : ''}
        </div>
      </td>
    </tr>`;
  }).join('');
}

// ─── MODAL CRIAR / EDITAR REQUISIÇÃO ─────────
window._purchOpenModal = function(editId) {
  const existing = editId ? getPurchases().find(p => p.id === editId) : null;
  const suppliers = getSuppliers();
  const products  = getProducts();

  const items = existing ? JSON.parse(JSON.stringify(existing.items || [])) : [];

  const html = `
  <div class="modal-overlay" id="purch-modal-overlay">
    <div class="modal" style="max-width:680px;width:calc(100% - 32px);max-height:90vh;overflow-y:auto">
      <div class="modal-header">
        <h3><i class="fas fa-shopping-cart"></i> ${editId ? 'Editar' : 'Nova'} Requisição de Compra</h3>
        <button class="modal-close" onclick="document.getElementById('purch-modal-overlay').remove()">×</button>
      </div>
      <div class="modal-body" style="padding:24px">

        <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div class="form-group" style="margin:0">
            <label>Título da Requisição <span class="required">*</span></label>
            <input type="text" id="pm-title" placeholder="Ex: Compra de insumos mensais" value="${existing?.title || ''}">
          </div>
          <div class="form-group" style="margin:0">
            <label>Fornecedor</label>
            <select id="pm-supplier">
              <option value="">Selecionar fornecedor...</option>
              ${suppliers.map(s => `<option value="${s.id}" ${existing?.supplierId === s.id ? 'selected':''}>${s.name}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="form-group" style="margin-bottom:16px">
          <label>Observações</label>
          <textarea id="pm-notes" rows="2" placeholder="Informações adicionais sobre esta requisição..." style="width:100%;resize:vertical">${existing?.notes || ''}</textarea>
        </div>

        <!-- Lista de itens -->
        <div style="margin-bottom:12px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
            <label style="font-weight:600;font-size:14px"><i class="fas fa-list" style="color:#002B5B;margin-right:6px"></i>Itens da Requisição</label>
            <button class="btn-outline" style="padding:6px 12px;font-size:12px" onclick="window._purchAddItem()">
              <i class="fas fa-plus"></i> Adicionar Item
            </button>
          </div>
          <div id="pm-items-list">
            ${items.length ? items.map((it,i) => _renderItemRow(it, i, products)).join('') : _renderItemRow({},0,products)}
          </div>
          <div style="border-top:2px solid var(--border);margin-top:12px;padding-top:12px;text-align:right">
            <span style="font-size:13px;color:var(--text-secondary)">Total: </span>
            <span id="pm-total" style="font-size:18px;font-weight:800;color:var(--text-primary)">R$ 0,00</span>
          </div>
        </div>
      </div>

      <div class="modal-footer" style="padding:16px 24px;display:flex;gap:10px;justify-content:flex-end;border-top:1px solid var(--border)">
        <button class="btn-outline" onclick="document.getElementById('purch-modal-overlay').remove()">Cancelar</button>
        <button class="btn-primary" onclick="window._purchSave('${editId || ''}')">
          <i class="fas fa-save"></i> ${editId ? 'Salvar Alterações' : 'Criar Requisição'}
        </button>
      </div>
    </div>
  </div>`;

  document.body.insertAdjacentHTML('beforeend', html);

  // Inicializa _items no modal
  window._pmItems = items.length ? [...items] : [{ productId:'', name:'', qty:1, unit:'un', price:0 }];
  _refreshItemsUI(products);
  _calcTotal();
};

function _renderItemRow(item, idx, products) {
  return `
  <div class="pm-item-row" data-idx="${idx}" style="display:grid;grid-template-columns:2fr 80px 80px 110px 36px;gap:8px;margin-bottom:8px;align-items:center">
    <select class="pm-item-product" onchange="window._purchItemChange(${idx},'productId',this.value)" style="font-size:13px">
      <option value="">Produto / insumo...</option>
      ${products.map(p=>`<option value="${p.id}" ${item.productId===p.id?'selected':''}>${p.name}</option>`).join('')}
      <option value="__custom__" ${item.productId==='__custom__'?'selected':''}>✏️ Digitar manualmente</option>
    </select>
    <input type="number" class="pm-item-qty" value="${item.qty||1}" min="1" placeholder="Qtd"
      onchange="window._purchItemChange(${idx},'qty',parseFloat(this.value)||1)"
      style="font-size:13px;text-align:center">
    <input type="text" class="pm-item-unit" value="${item.unit||'un'}" placeholder="un"
      onchange="window._purchItemChange(${idx},'unit',this.value)"
      style="font-size:13px;text-align:center">
    <input type="number" class="pm-item-price" value="${item.price||''}" min="0" step="0.01" placeholder="R$ 0,00"
      onchange="window._purchItemChange(${idx},'price',parseFloat(this.value)||0)"
      style="font-size:13px;text-align:right">
    <button class="btn-icon" style="color:#DC2626;padding:6px;min-width:32px" onclick="window._purchRemoveItem(${idx})" title="Remover">
      <i class="fas fa-times"></i>
    </button>
  </div>`;
}

window._purchItemChange = function(idx, field, value) {
  if (!window._pmItems) return;
  if (!window._pmItems[idx]) window._pmItems[idx] = {};
  window._pmItems[idx][field] = value;
  // Se selecionar produto do catálogo, preenche preço
  if (field === 'productId' && value && value !== '__custom__') {
    const prod = getProducts().find(p => p.id === value);
    if (prod) {
      window._pmItems[idx].name  = prod.name;
      window._pmItems[idx].unit  = prod.unit || 'un';
      window._pmItems[idx].price = prod.price || 0;
    }
    _refreshItemsUI(getProducts());
  }
  _calcTotal();
};

window._purchAddItem = function() {
  if (!window._pmItems) window._pmItems = [];
  window._pmItems.push({ productId:'', name:'', qty:1, unit:'un', price:0 });
  _refreshItemsUI(getProducts());
  _calcTotal();
};

window._purchRemoveItem = function(idx) {
  if (!window._pmItems || window._pmItems.length <= 1) return;
  window._pmItems.splice(idx, 1);
  _refreshItemsUI(getProducts());
  _calcTotal();
};

function _refreshItemsUI(products) {
  const container = document.getElementById('pm-items-list');
  if (!container) return;
  container.innerHTML = (window._pmItems || []).map((it, i) => _renderItemRow(it, i, products)).join('');
}

function _calcTotal() {
  const total = (window._pmItems || []).reduce((s, it) => s + ((it.qty || 0) * (it.price || 0)), 0);
  const el = document.getElementById('pm-total');
  if (el) el.textContent = fmtCurrency(total);
  return total;
}

// ─── SALVAR REQUISIÇÃO ────────────────────────
window._purchSave = function(editId) {
  const title    = document.getElementById('pm-title')?.value.trim();
  const supId    = document.getElementById('pm-supplier')?.value;
  const notes    = document.getElementById('pm-notes')?.value.trim();
  const items    = (window._pmItems || []).filter(it => it.name || it.productId);
  const total    = _calcTotal();

  if (!title) { _toast('Informe o título da requisição.', 'warning'); return; }
  if (!items.length) { _toast('Adicione pelo menos um item.', 'warning'); return; }

  const purchases = getPurchases();

  if (editId) {
    const idx = purchases.findIndex(p => p.id === editId);
    if (idx >= 0) {
      purchases[idx] = { ...purchases[idx], title, supplierId: supId, notes, items, total, updatedAt: Date.now() };
    }
    _toast('✅ Requisição atualizada!', 'success');
  } else {
    purchases.push({
      id:        uid(),
      title,
      supplierId: supId,
      notes,
      items,
      total,
      status:    'pending',
      requester: currentUserName(),
      requesterEmail: window.currentUser?.email || '',
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
    _toast('✅ Requisição criada com sucesso!', 'success');
  }

  savePurchases(purchases);
  document.getElementById('purch-modal-overlay')?.remove();
  window._pmItems = null;
  window._purchRender('page-purchases');
};

// ─── VER DETALHES ─────────────────────────────
window._purchViewModal = function(id) {
  const p = getPurchases().find(x => x.id === id);
  if (!p) return;
  const sup = getSuppliers().find(s => s.id === p.supplierId);
  const st  = STATUS[p.status] || STATUS.pending;

  const html = `
  <div class="modal-overlay" id="purch-view-overlay">
    <div class="modal" style="max-width:560px;width:calc(100%-32px)">
      <div class="modal-header">
        <h3><i class="fas fa-file-invoice"></i> Detalhes da Requisição</h3>
        <button class="modal-close" onclick="document.getElementById('purch-view-overlay').remove()">×</button>
      </div>
      <div class="modal-body" style="padding:24px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;flex-wrap:wrap;gap:8px">
          <div>
            <div style="font-size:18px;font-weight:700;color:var(--text-primary)">${p.title}</div>
            <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">Criado por ${p.requester} em ${fmtDate(p.createdAt)}</div>
          </div>
          <span class="purch-badge ${st.cls}" style="font-size:13px;padding:6px 14px">${st.icon} ${st.label}</span>
        </div>

        ${sup ? `<div style="background:var(--bg-surface-2);border-radius:10px;padding:12px;margin-bottom:16px;display:flex;gap:10px;align-items:center">
          <i class="fas fa-truck" style="color:#002B5B;font-size:16px"></i>
          <div>
            <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px">Fornecedor</div>
            <div style="font-weight:600">${sup.name}</div>
            ${sup.contact ? `<div style="font-size:12px;color:var(--text-secondary)">${sup.contact}</div>` : ''}
          </div>
        </div>` : ''}

        ${p.notes ? `<div style="background:var(--bg-surface-2);border-radius:10px;padding:12px;margin-bottom:16px;font-size:13px;color:var(--text-secondary)">${p.notes}</div>` : ''}

        <div style="font-weight:600;margin-bottom:10px;font-size:14px"><i class="fas fa-list" style="color:#002B5B;margin-right:6px"></i>Itens</div>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="background:var(--table-header-bg)">
              <th style="padding:8px 10px;text-align:left;border-bottom:1px solid var(--border);color:var(--text-secondary);font-size:11px;text-transform:uppercase">Produto</th>
              <th style="padding:8px 10px;text-align:center;border-bottom:1px solid var(--border);color:var(--text-secondary);font-size:11px;text-transform:uppercase">Qtd</th>
              <th style="padding:8px 10px;text-align:right;border-bottom:1px solid var(--border);color:var(--text-secondary);font-size:11px;text-transform:uppercase">Unit.</th>
              <th style="padding:8px 10px;text-align:right;border-bottom:1px solid var(--border);color:var(--text-secondary);font-size:11px;text-transform:uppercase">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${(p.items||[]).map(it => `
              <tr style="border-bottom:1px solid var(--border)">
                <td style="padding:8px 10px;font-weight:500">${it.name || it.productId || '—'}</td>
                <td style="padding:8px 10px;text-align:center">${it.qty} ${it.unit}</td>
                <td style="padding:8px 10px;text-align:right">${fmtCurrency(it.price)}</td>
                <td style="padding:8px 10px;text-align:right;font-weight:700">${fmtCurrency((it.qty||0)*(it.price||0))}</td>
              </tr>`).join('')}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="3" style="padding:12px 10px;text-align:right;font-weight:700;font-size:14px">Total</td>
              <td style="padding:12px 10px;text-align:right;font-size:18px;font-weight:800;color:var(--text-primary)">${fmtCurrency(p.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div class="modal-footer" style="padding:16px 24px;text-align:right;border-top:1px solid var(--border)">
        <button class="btn-outline" onclick="document.getElementById('purch-view-overlay').remove()">Fechar</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
};

// ─── APROVAÇÃO / AVANÇO DE STATUS ─────────────
window._purchApprove = async function(id) {
  const ok = await _confirm({ title:'Aprovar Requisição', message:'Confirma a aprovação desta requisição de compra?', icon:'✅', okText:'Aprovar', okClass:'confirm-ok-primary', cancelText:'Cancelar' });
  if (!ok) return;
  _advancePurchase(id, 'approved');
  _toast('✅ Requisição aprovada!', 'success');
};

window._purchAdvance = async function(id, newStatus) {
  const labels = { purchased: 'marcar como Comprado', delivered: 'marcar como Entregue' };
  const ok = await _confirm({ title:'Atualizar Status', message:`Deseja ${labels[newStatus] || 'atualizar'} esta requisição?`, icon:'🔄', okText:'Confirmar', okClass:'confirm-ok-primary', cancelText:'Cancelar' });
  if (!ok) return;
  _advancePurchase(id, newStatus);
  _toast(`Status atualizado para: ${STATUS[newStatus]?.label}`, 'success');
};

function _advancePurchase(id, status) {
  const arr = getPurchases();
  const idx = arr.findIndex(p => p.id === id);
  let updated = null;
  if (idx >= 0) {
    arr[idx].status    = status;
    arr[idx].updatedAt = Date.now();
    arr[idx][`${status}By`]  = currentUserName();
    arr[idx][`${status}At`]  = Date.now();
    updated = arr[idx];
  }
  savePurchases(arr);
  if (status === 'approved' && updated && window._ntNotifyPurchaseApproved) {
    try { window._ntNotifyPurchaseApproved(updated); } catch (e) { console.warn(e); }
  }
  window._purchRender('page-purchases');
}

window._purchRequestCancel = async function(id) {
  const ok = await _confirm({
    title: 'Solicitar cancelamento',
    message: 'Deseja solicitar o cancelamento desta requisição? Administradores, diretores e gerentes serão notificados.',
    icon: '⚠️',
    okText: 'Enviar solicitação',
    okClass: 'confirm-ok-primary',
    cancelText: 'Voltar'
  });
  if (!ok) return;
  const arr = getPurchases();
  const idx = arr.findIndex(p => p.id === id);
  if (idx < 0) return;
  arr[idx].cancelRequestStatus = 'pending';
  arr[idx].cancelRequestedAt = Date.now();
  savePurchases(arr);
  if (window._ntNotifyPurchaseCancelRequested) {
    try { window._ntNotifyPurchaseCancelRequested(arr[idx]); } catch (e) { console.warn(e); }
  }
  _toast('Solicitação de cancelamento enviada.', 'success');
  window._purchRender('page-purchases');
};

window._purchResolveCancel = async function(id, approved) {
  const p = getPurchases().find(x => x.id === id);
  if (!p || p.cancelRequestStatus !== 'pending') return;
  const ok = await _confirm({
    title: approved ? 'Aprovar cancelamento' : 'Recusar cancelamento',
    message: approved
      ? 'Confirma o cancelamento desta requisição de compra?'
      : 'Confirma recusar o pedido de cancelamento? O status da requisição permanece o mesmo.',
    icon: approved ? '✅' : '❌',
    okText: approved ? 'Aprovar cancelamento' : 'Recusar',
    okClass: approved ? 'confirm-ok-primary' : 'confirm-ok-primary',
    cancelText: 'Voltar'
  });
  if (!ok) return;
  const arr = getPurchases();
  const idx = arr.findIndex(x => x.id === id);
  if (idx < 0) return;
  if (approved) {
    arr[idx].status = 'cancelled';
    arr[idx].cancelRequestStatus = 'approved';
    arr[idx].cancelledResolvedAt = Date.now();
  } else {
    arr[idx].cancelRequestStatus = 'rejected';
    arr[idx].cancelRejectedAt = Date.now();
  }
  savePurchases(arr);
  if (window._ntNotifyPurchaseCancelResolved) {
    try { window._ntNotifyPurchaseCancelResolved(arr[idx], approved); } catch (e) { console.warn(e); }
  }
  _toast(approved ? 'Cancelamento aprovado.' : 'Pedido de cancelamento recusado.', approved ? 'success' : 'info');
  window._purchRender('page-purchases');
};

// ─── EXCLUIR REQUISIÇÃO ───────────────────────
window._purchDelete = async function(id) {
  const p = getPurchases().find(x => x.id === id);
  if (!p) return;
  const ok = await _confirm({ title:'Excluir Requisição', message:`Excluir "${p.title}"? Esta ação não pode ser desfeita.`, icon:'🗑️', okText:'Excluir', cancelText:'Cancelar' });
  if (!ok) return;
  savePurchases(getPurchases().filter(x => x.id !== id));
  _toast('Requisição excluída.', 'info');
  window._purchRender('page-purchases');
};

// ─── MODAL FORNECEDORES ──────────────────────
window._purchOpenSuppliers = function() {
  const sups = getSuppliers();
  const html = `
  <div class="modal-overlay" id="sup-modal-overlay">
    <div class="modal" style="max-width:640px;width:calc(100%-32px);max-height:85vh;display:flex;flex-direction:column">
      <div class="modal-header">
        <h3><i class="fas fa-truck"></i> Fornecedores</h3>
        <button class="modal-close" onclick="document.getElementById('sup-modal-overlay').remove()">×</button>
      </div>
      <div class="modal-body" style="padding:20px;overflow-y:auto;flex:1">
        <!-- Form rápido -->
        <div style="background:var(--bg-surface-2);border-radius:12px;padding:16px;margin-bottom:16px">
          <div style="font-weight:600;margin-bottom:10px;font-size:13px"><i class="fas fa-plus" style="color:#002B5B;margin-right:6px"></i>Novo Fornecedor</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
            <input type="text" id="sup-name" placeholder="Nome do fornecedor *" style="font-size:13px">
            <input type="text" id="sup-doc"  placeholder="CNPJ / CPF" style="font-size:13px">
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
            <input type="text" id="sup-contact" placeholder="Contato / telefone" style="font-size:13px">
            <input type="email" id="sup-email"  placeholder="E-mail" style="font-size:13px">
          </div>
          <div style="display:grid;grid-template-columns:1fr auto;gap:10px">
            <input type="text" id="sup-category" placeholder="Categoria (ex: matéria-prima)" style="font-size:13px">
            <button class="btn-primary" style="white-space:nowrap" onclick="window._supSave()">
              <i class="fas fa-plus"></i> Adicionar
            </button>
          </div>
        </div>
        <!-- Lista -->
        <div id="sup-list">
          ${_renderSupList()}
        </div>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
};

function _renderSupList() {
  const sups = getSuppliers();
  if (!sups.length) return `<div style="text-align:center;padding:24px;color:var(--text-muted)"><i class="fas fa-truck" style="font-size:32px;opacity:.3;display:block;margin-bottom:8px"></i>Nenhum fornecedor cadastrado</div>`;
  return sups.map(s => `
    <div style="display:flex;align-items:center;gap:10px;padding:12px;border:1px solid var(--border);border-radius:10px;margin-bottom:8px;background:var(--bg-surface)">
      <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#002B5B,#1B4F8A);display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:13px;flex-shrink:0">
        ${s.name[0].toUpperCase()}
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:13px">${s.name}</div>
        <div style="font-size:11px;color:var(--text-muted)">${[s.doc, s.category, s.contact].filter(Boolean).join(' · ')}</div>
      </div>
      <button class="btn-icon" style="color:#DC2626" onclick="window._supDelete('${s.id}')" title="Excluir">
        <i class="fas fa-trash"></i>
      </button>
    </div>`).join('');
}

window._supSave = function() {
  const name = document.getElementById('sup-name')?.value.trim();
  if (!name) { _toast('Informe o nome do fornecedor.', 'warning'); return; }
  const sups = getSuppliers();
  sups.push({
    id: 'sup-' + Date.now(),
    name,
    doc:      document.getElementById('sup-doc')?.value.trim(),
    contact:  document.getElementById('sup-contact')?.value.trim(),
    email:    document.getElementById('sup-email')?.value.trim(),
    category: document.getElementById('sup-category')?.value.trim(),
    createdAt: Date.now()
  });
  saveSuppliers(sups);
  ['sup-name','sup-doc','sup-contact','sup-email','sup-category'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const listEl = document.getElementById('sup-list');
  if (listEl) listEl.innerHTML = _renderSupList();
  _toast('✅ Fornecedor adicionado!', 'success');
};

window._supDelete = async function(id) {
  const ok = await _confirm({ title:'Excluir Fornecedor', message:'Remover este fornecedor?', icon:'🗑️', okText:'Excluir' });
  if (!ok) return;
  saveSuppliers(getSuppliers().filter(s => s.id !== id));
  const listEl = document.getElementById('sup-list');
  if (listEl) listEl.innerHTML = _renderSupList();
  _toast('Fornecedor removido.', 'info');
};

// ─── MODAL PRODUTOS ───────────────────────────
window._purchOpenProducts = function() {
  const html = `
  <div class="modal-overlay" id="prod-modal-overlay">
    <div class="modal" style="max-width:640px;width:calc(100%-32px);max-height:85vh;display:flex;flex-direction:column">
      <div class="modal-header">
        <h3><i class="fas fa-box"></i> Produtos / Insumos</h3>
        <button class="modal-close" onclick="document.getElementById('prod-modal-overlay').remove()">×</button>
      </div>
      <div class="modal-body" style="padding:20px;overflow-y:auto;flex:1">
        <!-- Form rápido -->
        <div style="background:var(--bg-surface-2);border-radius:12px;padding:16px;margin-bottom:16px">
          <div style="font-weight:600;margin-bottom:10px;font-size:13px"><i class="fas fa-plus" style="color:#002B5B;margin-right:6px"></i>Novo Produto</div>
          <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px;margin-bottom:10px">
            <input type="text"   id="prod-name"  placeholder="Nome do produto *" style="font-size:13px">
            <input type="text"   id="prod-unit"  placeholder="Unidade (un, kg, l)" value="un" style="font-size:13px">
            <input type="number" id="prod-price" placeholder="Preço padrão" min="0" step="0.01" style="font-size:13px">
          </div>
          <div style="display:grid;grid-template-columns:1fr auto;gap:10px">
            <input type="text" id="prod-category" placeholder="Categoria" style="font-size:13px">
            <button class="btn-primary" style="white-space:nowrap" onclick="window._prodSave()">
              <i class="fas fa-plus"></i> Adicionar
            </button>
          </div>
        </div>
        <!-- Lista -->
        <div id="prod-list">${_renderProdList()}</div>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
};

function _renderProdList() {
  const prods = getProducts();
  if (!prods.length) return `<div style="text-align:center;padding:24px;color:var(--text-muted)"><i class="fas fa-box" style="font-size:32px;opacity:.3;display:block;margin-bottom:8px"></i>Nenhum produto cadastrado</div>`;
  return prods.map(p => `
    <div style="display:flex;align-items:center;gap:10px;padding:12px;border:1px solid var(--border);border-radius:10px;margin-bottom:8px;background:var(--bg-surface)">
      <div style="width:36px;height:36px;border-radius:10px;background:var(--bg-surface-2);display:flex;align-items:center;justify-content:center;color:var(--text-secondary);font-size:16px;flex-shrink:0">
        <i class="fas fa-box"></i>
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:13px">${p.name}</div>
        <div style="font-size:11px;color:var(--text-muted)">${p.unit} · ${p.category || 'Geral'} · ${fmtCurrency(p.price)}</div>
      </div>
      <button class="btn-icon" style="color:#DC2626" onclick="window._prodDelete('${p.id}')" title="Excluir">
        <i class="fas fa-trash"></i>
      </button>
    </div>`).join('');
}

window._prodSave = function() {
  const name = document.getElementById('prod-name')?.value.trim();
  if (!name) { _toast('Informe o nome do produto.', 'warning'); return; }
  const prods = getProducts();
  prods.push({
    id: 'prod-' + Date.now(),
    name,
    unit:     document.getElementById('prod-unit')?.value.trim() || 'un',
    price:    parseFloat(document.getElementById('prod-price')?.value) || 0,
    category: document.getElementById('prod-category')?.value.trim(),
    createdAt: Date.now()
  });
  saveProducts(prods);
  ['prod-name','prod-unit','prod-price','prod-category'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const listEl = document.getElementById('prod-list');
  if (listEl) listEl.innerHTML = _renderProdList();
  _toast('✅ Produto adicionado!', 'success');
};

window._prodDelete = async function(id) {
  const ok = await _confirm({ title:'Excluir Produto', message:'Remover este produto?', icon:'🗑️', okText:'Excluir' });
  if (!ok) return;
  saveProducts(getProducts().filter(p => p.id !== id));
  const listEl = document.getElementById('prod-list');
  if (listEl) listEl.innerHTML = _renderProdList();
  _toast('Produto removido.', 'info');
};

// ─── EXPÕE render para o app.js ─────────────
window._purchRenderPage = function() { window._purchRender('page-purchases'); };

console.log('✅ Purchases Module carregado.');
})();
