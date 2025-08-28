// ==============================================================================
// 檔案路徑: warehouse-panel/js/modules/warehouse/shipping.js
// 版本: v45.5 - UX 升級（內嵌 Modal）+ 穩健錯誤處理
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

import { supabase } from '/_shared/js/supabaseClient.js';
import { showNotification, setFormSubmitting } from '/_shared/js/utils.js';
import { requireWarehouseLogin, handleWarehouseLogout } from '/warehouse-panel/js/core/warehouseAuth.js';
import { TABLE_NAMES, FUNCTION_NAMES } from '/warehouse-panel/js/core/constants.js';

let currentUser = null;
let ordersCache = [];
let shippingRatesCache = [];
let cancellationReasonsCache = [];
let selectedOrderId = null;
let currentStatusTab = 'pending_payment';

const logoutBtn = document.getElementById('logout-btn');
const currentUserEmailEl = document.getElementById('current-user-email');
const userManagementLink = document.getElementById('user-management-link');
const tabs = document.querySelectorAll('.tab-link');
const orderListContainer = document.getElementById('order-list-container');
const searchFormContainer = document.getElementById('search-form-container');
const shippedOrderSearchForm = document.getElementById('shipped-order-search-form');
const orderDetailView = document.getElementById('order-detail-view');
const searchResultsContainer = document.getElementById('search-results-container');
const searchResultsList = document.getElementById('search-results-list');
const emptyView = document.getElementById('empty-view');
const orderNumberTitle = document.getElementById('order-number-title');
const pickingListEl = document.getElementById('picking-list');
const shippingAddressEl = document.getElementById('shipping-address');
const shippingMethodDetailsEl = document.getElementById('shipping-method-details');
const paymentDetailsEl = document.getElementById('payment-details');
const paymentConfirmationSection = document.getElementById('payment-confirmation-section');
const paymentConfirmationForm = document.getElementById('payment-confirmation-form');
const paymentMethodSelector = document.getElementById('payment-method-selector');
const paymentReferenceInput = document.getElementById('payment-reference-input');
const shippingActionSection = document.getElementById('shipping-action-section');
const shippingForm = document.getElementById('shipping-form');
const carrierSelector = document.getElementById('carrier-selector');
const trackingCodeInput = document.getElementById('tracking-code-input');
const printBtn = document.getElementById('print-btn');
const cancellationActionSection = document.getElementById('cancellation-action-section');
const btnCancelOrder = document.getElementById('btn-cancel-order');

/* ------------------------- 共用：資料讀取 ------------------------- */
async function fetchOrdersByStatus(status) {
  orderListContainer.innerHTML = '<div class="loading-spinner">載入中...</div>';
  try {
    const client = await supabase;
    const { data, error } = await client.functions.invoke(FUNCTION_NAMES.GET_PAID_ORDERS, {
      body: { status }
    });
    if (error) throw error;
    ordersCache = data;
    renderOrderList();
  } catch (e) {
    console.error(`讀取 status=${status} 的訂單失敗:`, e);
    orderListContainer.innerHTML = '<p class="error-message">讀取訂單失敗，請稍後再試。</p>';
  }
}

function renderOrderList() {
  if (ordersCache.length === 0) {
    const msg = currentStatusTab === 'paid'
      ? '所有訂單皆已出貨，或尚有訂單在「待備貨」區等待確認付款。'
      : '目前沒有待備貨的訂單。';
    orderListContainer.innerHTML = `<p style="padding:1rem;text-align:center;opacity:.7">${msg}</p>`;
    return;
  }
  orderListContainer.innerHTML = ordersCache.map(o => `
    <div class="order-list-item ${o.id === selectedOrderId ? 'active' : ''}" data-order-id="${o.id}">
      <strong class="order-number">${o.order_number}</strong>
      <span class="recipient-name">${o.shipping_address_snapshot?.recipient_name || 'N/A'}</span>
      <span class="order-date">${new Date(o.created_at).toLocaleDateString()}</span>
    </div>
  `).join('');
}

function renderPickingList(items) {
  if (!items || items.length === 0) {
    pickingListEl.innerHTML = '<p class="error-message">無法載入此訂單的商品項目。</p>';
    return;
  }
  const rows = items.map(it => `
    <tr>
      <td>${it.product_variants.products.name}<small>（${it.product_variants.name}）</small></td>
      <td class="sku">${it.product_variants.sku}</td>
      <td class="quantity">${it.quantity}</td>
    </tr>`).join('');
  pickingListEl.innerHTML = `<table class="picking-table"><thead><tr><th>品名(規格)</th><th class="sku">SKU</th><th class="quantity">數量</th></tr></thead><tbody>${rows}</tbody></table>`;
}

async function handleOrderSelection(orderId) {
  selectedOrderId = orderId;
  renderOrderList();
  const order = ordersCache.find(o => o.id === orderId);
  if (!order) return;

  emptyView.classList.add('hidden');
  searchResultsContainer.classList.add('hidden');
  orderDetailView.classList.remove('hidden');
  [paymentConfirmationSection, shippingActionSection, cancellationActionSection].forEach(el => el.classList.add('hidden'));

  trackingCodeInput.value = '';
  paymentReferenceInput.value = '';
  orderNumberTitle.textContent = `訂單 #${order.order_number}`;

  const adr = order.shipping_address_snapshot;
  shippingAddressEl.innerHTML = (adr && typeof adr === 'object')
    ? `<p><strong>收件人:</strong> ${adr.recipient_name || 'N/A'}</p>
       <p><strong>手機:</strong> ${adr.phone_number || 'N/A'}</p>
       ${adr.tel_number ? `<p><strong>市話:</strong> ${adr.tel_number}</p>` : ''}
       <p><strong>地址:</strong> ${adr.postal_code || ''} ${adr.city || ''}${adr.district || ''}${adr.street_address || ''}</p>`
    : `<p class="error-message">無有效的收件資訊。</p>`;

  const methodName = order.shipping_rates?.method_name || '未指定';
  shippingMethodDetailsEl.innerHTML = `<p><strong>配送方式:</strong> ${methodName}</p>`;

  const paidText = order.payment_status === 'paid' ? '已付款' : '待付款';
  paymentDetailsEl.innerHTML = `<p><strong>付款狀態:</strong> <span class="status-${order.payment_status}">${paidText}</span></p>
                                <p><strong>付款參考:</strong> ${order.payment_reference || '無'}</p>`;

  if (order.status === 'pending_payment') {
    paymentConfirmationSection.classList.remove('hidden');
    cancellationActionSection.classList.remove('hidden');
  } else if (order.status === 'paid') {
    shippingActionSection.classList.remove('hidden');
    cancellationActionSection.classList.remove('hidden');
  }

  pickingListEl.innerHTML = '<div class="loading-spinner">載入商品項目中...</div>';
  try {
    const client = await supabase;
    const { data: items, error } = await client.functions.invoke(FUNCTION_NAMES.GET_ORDER_DETAILS, { body: { orderId } });
    if (error) throw error;
    renderPickingList(items);
  } catch (e) {
    console.error('讀取商品項目失敗:', e);
    pickingListEl.innerHTML = '<p class="error-message">讀取商品項目失敗。</p>';
  }

  await populateCarrierSelector(methodName);
}

async function populateCarrierSelector(defaultCarrier) {
  if (shippingRatesCache.length === 0) {
    try {
      const client = await supabase;
      const { data, error } = await client.from(TABLE_NAMES.SHIPPING_RATES).select('*').eq('is_active', true);
      if (error) throw error;
      shippingRatesCache = data;
    } catch (e) {
      console.error('讀取運送方式失敗', e);
      return;
    }
  }
  carrierSelector.innerHTML = shippingRatesCache.map(r => `
    <option value="${r.method_name}" ${r.method_name === defaultCarrier ? 'selected' : ''}>${r.method_name}</option>
  `).join('');
}

/* ------------------------- 出貨/收款流程（原樣） ------------------------- */
async function handlePaymentConfirmation(e) {
  e.preventDefault();
  setFormSubmitting(paymentConfirmationForm, true, '確認中...');
  try {
    const client = await supabase;
    const { data, error } = await client.functions.invoke(FUNCTION_NAMES.MARK_ORDER_AS_PAID, {
      body: { orderId: selectedOrderId, paymentMethod: paymentMethodSelector.value, paymentReference: paymentReferenceInput.value.trim() }
    });
    if (error) throw new Error(error.message);
    if (data.error) throw new Error(data.error);
    showNotification('收款確認成功！訂單已移至「待出貨」。', 'success');
    ordersCache = ordersCache.filter(o => o.id !== selectedOrderId);
    selectedOrderId = null;
    renderOrderList();
    orderDetailView.classList.add('hidden');
    emptyView.classList.remove('hidden');
  } catch (e) {
    showNotification(`確認收款失敗：${e.message}`, 'error');
  } finally {
    setFormSubmitting(paymentConfirmationForm, false, '確認收款');
  }
}

async function handleShippingFormSubmit(e) {
  e.preventDefault();
  setFormSubmitting(shippingForm, true, '處理中...');
  try {
    const client = await supabase;
    const { data, error } = await client.functions.invoke(FUNCTION_NAMES.MARK_ORDER_AS_SHIPPED, {
      body: { orderId: selectedOrderId, shippingTrackingCode: trackingCodeInput.value.trim(), selectedCarrierMethodName: carrierSelector.value }
    });
    if (error) throw new Error(error.message);
    if (data.error) throw new Error(data.error);
    showNotification('出貨成功！訂單已更新並已通知顧客。', 'success');
    ordersCache = ordersCache.filter(o => o.id !== selectedOrderId);
    selectedOrderId = null;
    renderOrderList();
    orderDetailView.classList.add('hidden');
    emptyView.classList.remove('hidden');
  } catch (e) {
    showNotification(`出貨失敗：${e.message}`, 'error');
  } finally {
    setFormSubmitting(shippingForm, false, '確認出貨並通知顧客');
  }
}

/* ------------------------- 取消訂單：Modal 版 ------------------------- */
async function fetchCancellationReasons() {
  if (cancellationReasonsCache.length > 0) return;
  try {
    const client = await supabase;
    const { data, error } = await client
      .from('order_cancellation_reasons')
      .select('reason')
      .eq('is_active', true)
      .order('sort_order');
    if (error) throw error;
    cancellationReasonsCache = data.map(x => x.reason);
  } catch (e) {
    console.error('讀取取消原因失敗:', e);
    cancellationReasonsCache = ['顧客要求取消', '其他 (請於備註詳述)'];
  }
}

function buildCancelModal(orderNumber) {
  // 若已存在則移除，保證乾淨 DOM
  document.getElementById('cancel-order-modal')?.remove();

  const wrapper = document.createElement('div');
  wrapper.id = 'cancel-order-modal';
  wrapper.style.position = 'fixed';
  wrapper.style.inset = '0';
  wrapper.style.background = 'rgba(0,0,0,.45)';
  wrapper.style.display = 'flex';
  wrapper.style.alignItems = 'center';
  wrapper.style.justifyContent = 'center';
  wrapper.style.zIndex = '9999';

  wrapper.innerHTML = `
    <div role="dialog" aria-modal="true" style="background:#fff;min-width:420px;max-width:520px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.2)">
      <div style="padding:18px 20px;border-bottom:1px solid #eee">
        <h3 style="margin:0">取消訂單 #${orderNumber}</h3>
        <p style="margin:.25rem 0 0;color:#666">此動作將回補庫存且不可復原</p>
      </div>
      <div style="padding:16px 20px;">
        <label style="display:block;margin-bottom:8px;font-weight:600">取消原因</label>
        <select id="cancel-reason-select" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:8px;margin-bottom:10px"></select>

        <label style="display:block;margin:8px 0 6px;font-weight:600">補充說明（選填）</label>
        <textarea id="cancel-reason-note" rows="3" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:8px"></textarea>
      </div>
      <div style="padding:14px 20px;border-top:1px solid #eee;display:flex;gap:10px;justify-content:flex-end">
        <button id="cancel-modal-close" class="btn-secondary" style="padding:8px 14px;border:1px solid #ddd;border-radius:8px;background:#fff">返回</button>
        <button id="cancel-modal-confirm" class="btn-danger" style="padding:8px 14px;border:none;border-radius:8px;background:#cc1f1a;color:#fff">確認取消</button>
      </div>
    </div>
  `;
  document.body.appendChild(wrapper);

  // ESC 關閉 & Enter 確認
  const onKey = (e) => {
    if (e.key === 'Escape') wrapper.remove();
    if (e.key === 'Enter') document.getElementById('cancel-modal-confirm')?.click();
  };
  setTimeout(() => document.addEventListener('keydown', onKey), 0);
  wrapper.addEventListener('click', (e) => { if (e.target === wrapper) { wrapper.remove(); document.removeEventListener('keydown', onKey); }});
  document.getElementById('cancel-modal-close')?.addEventListener('click', () => { wrapper.remove(); document.removeEventListener('keydown', onKey); });

  return {
    wrapper,
    reasonSelect: wrapper.querySelector('#cancel-reason-select'),
    noteInput: wrapper.querySelector('#cancel-reason-note'),
    confirmBtn: wrapper.querySelector('#cancel-modal-confirm')
  };
}

async function handleCancelOrder() {
  const order = ordersCache.find(o => o.id === selectedOrderId);
  if (!order) return;

  await fetchCancellationReasons();
  const modal = buildCancelModal(order.order_number);

  // 填入選項
  modal.reasonSelect.innerHTML = cancellationReasonsCache
    .map(r => `<option value="${r}">${r}</option>`).join('');

  modal.confirmBtn.addEventListener('click', async () => {
    const base = modal.reasonSelect.value || '';
    const note = (modal.noteInput.value || '').trim();
    const finalReason = note ? `${base}｜${note}` : base;

    if (!finalReason) {
      showNotification('請選擇或輸入取消原因。', 'error');
      return;
    }

    if (!confirm(`你確定要取消訂單 #${order.order_number} 嗎？此操作無法復原。`)) {
      return;
    }

    setFormSubmitting(btnCancelOrder, true, '取消中...');
    modal.confirmBtn.disabled = true;

    try {
      const client = await supabase;
      const { data, error } = await client.functions.invoke(FUNCTION_NAMES.CANCEL_ORDER, {
        body: { orderId: selectedOrderId, reason: finalReason }
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      showNotification(data?.message || '訂單已成功取消！', 'success');
      ordersCache = ordersCache.filter(o => o.id !== selectedOrderId);
      selectedOrderId = null;
      renderOrderList();
      orderDetailView.classList.add('hidden');
      emptyView.classList.remove('hidden');
      modal.wrapper.remove();
    } catch (e) {
      showNotification(`取消訂單失敗：${e.message}`, 'error');
      console.error('[Cancel Order] Error:', e);
    } finally {
      setFormSubmitting(btnCancelOrder, false, '取消此訂單');
      modal.confirmBtn.disabled = false;
    }
  });
}

/* ------------------------- 查詢/重寄（原樣） ------------------------- */
async function handleSearchShippedOrders(e) {
  e.preventDefault();
  setFormSubmitting(shippedOrderSearchForm, true, '查詢中...');
  searchResultsList.innerHTML = '<div class="loading-spinner">查詢中...</div>';
  const params = {
    orderNumber: document.getElementById('search-order-number').value.trim(),
    recipientName: document.getElementById('search-recipient-name').value.trim(),
    email: document.getElementById('search-email').value.trim(),
    phone: document.getElementById('search-phone').value.trim(),
    startDate: document.getElementById('search-start-date').value,
    endDate: document.getElementById('search-end-date').value,
  };
  const filtered = Object.fromEntries(Object.entries(params).filter(([_, v]) => v));
  try {
    const client = await supabase;
    const { data: results, error } = await client.functions.invoke(FUNCTION_NAMES.SEARCH_SHIPPED_ORDERS, { body: filtered });
    if (error) throw error;
    renderSearchResults(results);
  } catch (e) {
    console.error('查詢已出貨訂單失敗:', e);
    searchResultsList.innerHTML = '<p class="error-message">查詢失敗，請稍後再試。</p>';
  } finally {
    setFormSubmitting(shippedOrderSearchForm, false, '查詢');
  }
}

function renderSearchResults(results) {
  if (!results || results.length === 0) {
    searchResultsList.innerHTML = '<p>找不到符合條件的已出貨訂單。</p>';
    return;
  }
  searchResultsList.innerHTML = results.map(order => {
    const adr = order.shipping_address_snapshot;
    const items = order.order_items;
    const adrHtml = (adr && typeof adr === 'object')
      ? `<p><strong>收件人:</strong> ${adr.recipient_name || 'N/A'}</p>
         <p><strong>手機:</strong> ${adr.phone_number || 'N/A'}</p>
         <p><strong>地址:</strong> ${adr.postal_code || ''} ${adr.city || ''}${adr.district || ''}${adr.street_address || ''}</p>`
      : '<p class="error-message">無有效的收件資訊。</p>';
    const itemsHtml = (items && items.length > 0)
      ? `<table class="picking-table"><tbody>${
          items.map(it => `<tr><td>${it.product_variants.products.name}<small>(${it.product_variants.name})</small></td><td class="quantity">x ${it.quantity}</td></tr>`).join('')
        }</tbody></table>`
      : '<p>無商品項目資訊。</p>';
    return `
      <div class="search-result-item">
        <div class="result-header">
          <h3>訂單 #${order.order_number}</h3>
          <div class="result-sub-header">
            <span><strong>出貨日期:</strong> ${new Date(order.shipped_at).toLocaleDateString()}</span>
            <span><strong>物流:</strong> ${order.carrier} - ${order.shipping_tracking_code}</span>
          </div>
        </div>
        <div class="result-body">
          <div class="result-section"><h4>商品明細</h4>${itemsHtml}</div>
          <div class="result-section"><h4>收件資訊</h4>${adrHtml}</div>
        </div>
        <div class="result-footer">
          <button class="btn-secondary btn-resend" data-order-id="${order.id}" data-order-number="${order.order_number}">重寄通知</button>
        </div>
      </div>`;
  }).join('');
}

async function handleResendNotification(orderId, orderNumber) {
  if (!confirm(`您確定要重新發送訂單 #${orderNumber} 的出貨通知嗎？`)) return;
  const btn = document.querySelector(`.btn-resend[data-order-id="${orderId}"]`);
  if (btn) { btn.disabled = true; btn.textContent = '處理中...'; }
  try {
    const client = await supabase;
    const { data, error } = await client.functions.invoke(FUNCTION_NAMES.RESEND_SHIPPED_NOTIFICATION, { body: { orderId } });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    alert(`訂單 #${orderNumber} 的出貨通知已成功重寄！`);
  } catch (e) {
    console.error(`重寄訂單 #${orderNumber} 通知失敗:`, e);
    alert(`重寄失敗：${e.message}`);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '重寄通知'; }
  }
}

/* ------------------------- 事件綁定/初始化 ------------------------- */
function bindEvents() {
  logoutBtn.addEventListener('click', handleWarehouseLogout);
  orderListContainer.addEventListener('click', (e) => {
    const t = e.target.closest('.order-list-item');
    if (t) handleOrderSelection(t.dataset.orderId);
  });
  searchResultsList.addEventListener('click', (e) => {
    const t = e.target.closest('.btn-resend');
    if (t) handleResendNotification(t.dataset.orderId, t.dataset.orderNumber);
  });
  paymentConfirmationForm.addEventListener('submit', handlePaymentConfirmation);
  shippingForm.addEventListener('submit', handleShippingFormSubmit);
  printBtn.addEventListener('click', () => window.print());
  tabs.forEach(tab => tab.addEventListener('click', handleTabClick));
  shippedOrderSearchForm.addEventListener('submit', handleSearchShippedOrders);
  btnCancelOrder.addEventListener('click', handleCancelOrder);
}

function handleTabClick(e) {
  const tab = e.target;
  if (currentStatusTab === tab.dataset.statusTab) return;
  currentStatusTab = tab.dataset.statusTab;
  tabs.forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  orderDetailView.classList.add('hidden');
  searchResultsContainer.classList.add('hidden');
  emptyView.classList.remove('hidden');

  if (currentStatusTab === 'search') {
    orderListContainer.classList.add('hidden');
    searchFormContainer.classList.remove('hidden');
    searchResultsContainer.classList.remove('hidden');
    searchResultsList.innerHTML = '<p>請輸入條件以開始查詢。</p>';
  } else {
    orderListContainer.classList.remove('hidden');
    searchFormContainer.classList.add('hidden');
    shippedOrderSearchForm.reset();
    selectedOrderId = null;
    ordersCache = [];
    fetchOrdersByStatus(currentStatusTab);
  }
}

export async function init() {
  currentUser = await requireWarehouseLogin();
  if (!currentUser) return;
  if (currentUserEmailEl) currentUserEmailEl.textContent = currentUser.email;
  const roles = currentUser.app_metadata?.roles || [];
  if (roles.includes('super_admin')) userManagementLink?.classList.remove('hidden');
  bindEvents();
  await fetchOrdersByStatus(currentStatusTab);
}