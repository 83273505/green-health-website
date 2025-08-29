// ==============================================================================
// 檔案路徑: warehouse-panel/js/modules/warehouse/shipping.js
// 版本: v47.0 - 整合顧客輪廓、稽核日誌與訂單彙總
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

// --- v47.0 DOM 元素獲取 (完整版) ---
const logoutBtn = document.getElementById('logout-btn');
const currentUserEmailEl = document.getElementById('current-user-email');
const userManagementLink = document.getElementById('user-management-link');
const tabs = document.querySelectorAll('.tab-link');
const orderListContainer = document.getElementById('order-list-container');
const searchFormContainer = document.getElementById('search-form-container');
const advancedOrderSearchForm = document.getElementById('advanced-order-search-form');
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
const cancellationDetailsSection = document.getElementById('cancellation-details-section');
const cancellationDetailsEl = document.getElementById('cancellation-details');
const customerProfileContentEl = document.getElementById('customer-profile-content');
const orderHistoryContentEl = document.getElementById('order-history-content');
const searchSummaryContainerEl = document.getElementById('search-summary-container');

/* ------------------------- 格式化輔助函式 ------------------------- */
function formatCurrency(amount) {
  if (amount === null || amount === undefined) return 'N/A';
  return `NT$ ${parseInt(amount, 10).toLocaleString('zh-TW')}`;
}

/* ------------------------- 核心資料讀取與渲染 ------------------------- */
async function fetchOrdersByStatus(status) {
  orderListContainer.innerHTML = '<div class="loading-spinner">載入中...</div>';
  try {
    const client = await supabase;
    const { data, error } = await client.functions.invoke(FUNCTION_NAMES.GET_PAID_ORDERS, { body: { status } });
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
    let msg = '目前沒有此狀態的訂單。';
    switch (currentStatusTab) {
      case 'paid':
        msg = '所有訂單皆已出貨，或尚在「待備貨」區。';
        break;
      case 'pending_payment':
        msg = '目前沒有待備貨的訂單。';
        break;
      case 'cancelled':
        msg = '目前沒有已取消的訂單。';
        break;
    }
    orderListContainer.innerHTML = `<p style="padding:1rem;text-align:center;opacity:.7">${msg}</p>`;
    return;
  }
  orderListContainer.innerHTML = ordersCache
    .map((o) => {
      const dateToShow = currentStatusTab === 'cancelled' ? o.cancelled_at : o.created_at;
      return `
        <div class="order-list-item ${o.id === selectedOrderId ? 'active' : ''}" data-order-id="${o.id}">
          <strong class="order-number">${o.order_number}</strong>
          <span class="recipient-name">${o.shipping_address_snapshot?.recipient_name || 'N/A'}</span>
          <span class="order-date">${new Date(dateToShow).toLocaleDateString()}</span>
        </div>
      `;
    })
    .join('');
}

function renderPickingList(items) {
  if (!items || items.length === 0) {
    pickingListEl.innerHTML = '<p class="error-message">無法載入此訂單的商品項目。</p>';
    return;
  }
  const rows = items
    .map(
      (it) => `
    <tr>
      <td>${it.product_variants.products.name}<small>（${it.product_variants.name}）</small></td>
      <td class="sku">${it.product_variants.sku}</td>
      <td class="quantity">${it.quantity}</td>
    </tr>`
    )
    .join('');
  pickingListEl.innerHTML = `<table class="picking-table"><thead><tr><th>品名(規格)</th><th class="sku">SKU</th><th class="quantity">數量</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderCustomerProfile(summary) {
  if (!summary) {
    customerProfileContentEl.innerHTML = '<p class="error-message">無法載入顧客資訊。</p>';
    return;
  }
  const isHighRisk = summary.cancellationCount > 2;
  customerProfileContentEl.innerHTML = `
    <div class="profile-metric">
        <span>首次下單日</span>
        <strong>${summary.firstOrderDate ? new Date(summary.firstOrderDate).toLocaleDateString() : 'N/A'}</strong>
    </div>
    <div class="profile-metric">
        <span>歷史總訂單</span>
        <strong>${summary.totalOrders} 筆</strong>
    </div>
    <div class="profile-metric">
        <span>歷史總消費</span>
        <strong>${formatCurrency(summary.totalSpent)}</strong>
    </div>
    <div class="profile-metric ${isHighRisk ? 'high-risk' : ''}">
        <span>歷史取消數</span>
        <strong>${summary.cancellationCount} 次</strong>
    </div>
  `;
}

function renderOrderHistory(logs) {
  if (!logs || logs.length === 0) {
    orderHistoryContentEl.innerHTML = '<p>尚無操作歷史記錄。</p>';
    return;
  }
  orderHistoryContentEl.innerHTML = logs.map(log => {
      const detailsHtml = log.details ? `<div class="details">${JSON.stringify(log.details, null, 2)}</div>` : '';
      return `
          <div class="history-item">
              <span class="timestamp">${new Date(log.changed_at).toLocaleString('zh-TW')}</span>
              <strong>${log.event_type}</strong> by ${log.changed_by_user_id ? 'Operator' : 'System'}
              ${detailsHtml}
          </div>
      `;
  }).join('');
}

async function fetchOrderHistory(orderId) {
    const client = await supabase;
    const { data, error } = await client
        .from('order_history_logs')
        .select('*')
        .eq('order_id', orderId)
        .order('changed_at', { ascending: false });
    
    if (error) {
        console.error('讀取訂單歷史失敗:', error);
        orderHistoryContentEl.innerHTML = '<p class="error-message">讀取訂單歷史失敗。</p>';
    } else {
        renderOrderHistory(data);
    }
}

async function handleOrderSelection(orderId) {
  selectedOrderId = orderId;
  const isFromSearch = currentStatusTab === 'search';
  const sourceCache = isFromSearch ? window.searchResultsCache || [] : ordersCache;

  if (!isFromSearch) {
    renderOrderList();
  } else {
    document.querySelectorAll('#search-results-list .search-result-item').forEach((item) => {
      item.classList.toggle('active', item.dataset.orderId === orderId);
    });
  }

  const order = sourceCache.find((o) => o.id === orderId);
  if (!order) {
    console.warn(`在快取中找不到 orderId: ${orderId}`);
    return;
  }

  emptyView.classList.add('hidden');
  if (!isFromSearch) searchResultsContainer.classList.add('hidden');
  orderDetailView.classList.remove('hidden');

  [
    paymentConfirmationSection,
    shippingActionSection,
    cancellationActionSection,
    cancellationDetailsSection,
  ].forEach((el) => el.classList.add('hidden'));

  trackingCodeInput.value = '';
  paymentReferenceInput.value = '';
  orderNumberTitle.textContent = `訂單 #${order.order_number}`;

  const adr = order.shipping_address_snapshot;
  shippingAddressEl.innerHTML =
    adr && typeof adr === 'object'
      ? `<p><strong>收件人:</strong> ${adr.recipient_name || 'N/A'}</p>
         <p><strong>手機:</strong> ${adr.phone_number || 'N/A'}</p>
         ${adr.tel_number ? `<p><strong>市話:</strong> ${adr.tel_number}</p>` : ''}
         <p><strong>地址:</strong> ${adr.postal_code || ''} ${adr.city || ''}${adr.district || ''}${
           adr.street_address || ''
         }</p>`
      : `<p class="error-message">無有效的收件資訊。</p>`;

  const methodName = order.shipping_rates?.method_name || '未指定';
  shippingMethodDetailsEl.innerHTML = `<p><strong>配送方式:</strong> ${methodName}</p>`;

  const paymentStatusText = order.payment_status === 'paid' ? '已付款' : '待付款';
  paymentDetailsEl.innerHTML = `<p><strong>付款狀態:</strong> <span class="status-${order.payment_status}">${paymentStatusText}</span></p>
                                <p><strong>付款參考:</strong> ${order.payment_reference || '無'}</p>`;

  switch (order.status) {
    case 'pending_payment':
      paymentConfirmationSection.classList.remove('hidden');
      cancellationActionSection.classList.remove('hidden');
      break;
    case 'paid':
      shippingActionSection.classList.remove('hidden');
      cancellationActionSection.classList.remove('hidden');
      break;
    case 'cancelled':
      cancellationDetailsSection.classList.remove('hidden');
      cancellationDetailsEl.innerHTML = `
        <p><strong>取消時間:</strong> ${new Date(order.cancelled_at).toLocaleString('zh-TW')}</p>
        <p><strong>取消原因:</strong> ${order.cancellation_reason || '未提供原因'}</p>
      `;
      break;
  }

  pickingListEl.innerHTML = '<div class="loading-spinner">載入商品項目中...</div>';
  customerProfileContentEl.innerHTML = '<p class="loading-text">載入顧客輪廓...</p>';
  orderHistoryContentEl.innerHTML = '<p class="loading-text">載入操作歷史...</p>';

  const client = await supabase;
  const [itemsResult, profileResult] = await Promise.all([
    client.functions.invoke(FUNCTION_NAMES.GET_ORDER_DETAILS, { body: { orderId } }),
    order.user_id ? client.functions.invoke(FUNCTION_NAMES.GET_CUSTOMER_SUMMARY, { body: { userId: order.user_id } }) : Promise.resolve({ data: null, error: null }),
  ]);

  if (itemsResult.error) {
    console.error('讀取商品項目失敗:', itemsResult.error);
    pickingListEl.innerHTML = '<p class="error-message">讀取商品項目失敗。</p>';
  } else {
    renderPickingList(itemsResult.data);
  }
  
  if (!order.user_id) {
    customerProfileContentEl.innerHTML = '<p>匿名顧客無歷史資料。</p>';
  } else if (profileResult.error) {
    console.error('讀取顧客輪廓失敗:', profileResult.error);
    customerProfileContentEl.innerHTML = '<p class="error-message">讀取顧客輪廓失敗。</p>';
  } else {
    renderCustomerProfile(profileResult.data);
  }

  fetchOrderHistory(orderId);

  if (order.status === 'paid') {
    await populateCarrierSelector(methodName);
  }
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
  carrierSelector.innerHTML = shippingRatesCache
    .map((r) => `<option value="${r.method_name}" ${r.method_name === defaultCarrier ? 'selected' : ''}>${r.method_name}</option>`)
    .join('');
}

async function handlePaymentConfirmation(e) {
  e.preventDefault();
  setFormSubmitting(paymentConfirmationForm, true, '確認中...');
  try {
    const client = await supabase;
    const { data, error } = await client.functions.invoke(FUNCTION_NAMES.MARK_ORDER_AS_PAID, {
      body: {
        orderId: selectedOrderId,
        paymentMethod: paymentMethodSelector.value,
        paymentReference: paymentReferenceInput.value.trim(),
      },
    });
    if (error) throw new Error(error.message);
    if (data.error) throw new Error(data.error);
    showNotification('收款確認成功！訂單已移至「待出貨」。', 'success');
    ordersCache = ordersCache.filter((o) => o.id !== selectedOrderId);
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
      body: {
        orderId: selectedOrderId,
        shippingTrackingCode: trackingCodeInput.value.trim(),
        selectedCarrierMethodName: carrierSelector.value,
      },
    });
    if (error) throw new Error(error.message);
    if (data.error) throw new Error(data.error);
    showNotification('出貨成功！訂單已更新並已通知顧客。', 'success');
    ordersCache = ordersCache.filter((o) => o.id !== selectedOrderId);
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
    cancellationReasonsCache = data.map((x) => x.reason);
  } catch (e) {
    console.error('讀取取消原因失敗:', e);
    cancellationReasonsCache = ['顧客要求取消', '其他 (請於備註詳述)'];
  }
}

function buildCancelModal(orderNumber) {
  document.getElementById('cancel-order-modal')?.remove();
  const wrapper = document.createElement('div');
  wrapper.id = 'cancel-order-modal';
  wrapper.className = 'modal-overlay';
  wrapper.innerHTML = `
    <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-header">
        <h3 id="modal-title" class="modal-title">取消訂單 #${orderNumber}</h3>
        <p class="modal-subtitle">此動作將回補庫存且不可復原</p>
      </div>
      <div class="modal-body">
        <div class="form-group">
            <label for="cancel-reason-select">取消原因</label>
            <select id="cancel-reason-select"></select>
        </div>
        <div class="form-group">
            <label for="cancel-reason-note">補充說明（選填）</label>
            <textarea id="cancel-reason-note" rows="3"></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button id="cancel-modal-close" class="btn-secondary">返回</button>
        <button id="cancel-modal-confirm" class="btn-danger">確認取消</button>
      </div>
    </div>
  `;
  document.body.appendChild(wrapper);

  const onKey = (e) => {
    if (e.key === 'Escape') closeModal();
    if (e.key === 'Enter') document.getElementById('cancel-modal-confirm')?.click();
  };

  const closeModal = () => {
    wrapper.remove();
    document.removeEventListener('keydown', onKey);
  };

  setTimeout(() => document.addEventListener('keydown', onKey), 0);
  wrapper.addEventListener('click', (e) => { if (e.target === wrapper) closeModal(); });
  document.getElementById('cancel-modal-close')?.addEventListener('click', closeModal);

  return {
    wrapper,
    reasonSelect: wrapper.querySelector('#cancel-reason-select'),
    noteInput: wrapper.querySelector('#cancel-reason-note'),
    confirmBtn: wrapper.querySelector('#cancel-modal-confirm'),
    close: closeModal,
  };
}

async function handleCancelOrder() {
  const order = ordersCache.find((o) => o.id === selectedOrderId);
  if (!order) return;

  await fetchCancellationReasons();
  const modal = buildCancelModal(order.order_number);

  modal.reasonSelect.innerHTML = cancellationReasonsCache.map((r) => `<option value="${r}">${r}</option>`).join('');

  modal.confirmBtn.addEventListener('click', async () => {
    const base = modal.reasonSelect.value || '';
    const note = (modal.noteInput.value || '').trim();
    const finalReason = note ? `${base}｜${note}` : base;

    if (!finalReason) {
      showNotification('請選擇或輸入取消原因。', 'error');
      return;
    }

    setFormSubmitting(btnCancelOrder, true, '取消中...');
    modal.confirmBtn.disabled = true;

    try {
      const client = await supabase;
      const { data, error } = await client.functions.invoke(FUNCTION_NAMES.CANCEL_ORDER, {
        body: { orderId: selectedOrderId, reason: finalReason },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      showNotification(data?.message || '訂單已成功取消！', 'success');
      ordersCache = ordersCache.filter((o) => o.id !== selectedOrderId);
      selectedOrderId = null;
      renderOrderList();
      orderDetailView.classList.add('hidden');
      emptyView.classList.remove('hidden');
      modal.close();
    } catch (e) {
      showNotification(`取消訂單失敗：${e.message}`, 'error');
      console.error('[Cancel Order] Error:', e);
    } finally {
      setFormSubmitting(btnCancelOrder, false, '取消此訂單');
      if(modal.confirmBtn) modal.confirmBtn.disabled = false;
    }
  });
}

function renderSearchSummary(summary) {
    if (!summary) {
        searchSummaryContainerEl.innerHTML = '';
        return;
    }
    searchSummaryContainerEl.innerHTML = `
        <div class="summary-item">
            <span class="value">${summary.new_customers_count}</span>
            <span class="label">區間新客數</span>
        </div>
        <div class="summary-item">
            <span class="value">${summary.total_orders_from_new_customers}</span>
            <span class="label">新客總訂單</span>
        </div>
        <div class="summary-item">
            <span class="value">${formatCurrency(summary.total_spent_from_new_customers)}</span>
            <span class="label">新客總金額</span>
        </div>
    `;
}

async function handleAdvancedOrderSearch(e) {
  e.preventDefault();
  setFormSubmitting(advancedOrderSearchForm, true, '查詢中...');
  searchResultsList.innerHTML = '<div class="loading-spinner">查詢中...</div>';
  searchSummaryContainerEl.innerHTML = '';

  const params = {
    status: document.getElementById('search-status-selector').value,
    orderNumber: document.getElementById('search-order-number').value.trim(),
    customerKeyword: document.getElementById('search-customer-keyword').value.trim(),
    startDate: document.getElementById('search-start-date').value,
    endDate: document.getElementById('search-end-date').value,
  };
  const filteredParams = Object.fromEntries(Object.entries(params).filter(([_, v]) => v));

  try {
    const client = await supabase;
    const { data: results, error } = await client.functions.invoke(FUNCTION_NAMES.SEARCH_ORDERS, { body: filteredParams });
    if (error) throw error;
    if (results.error) throw new Error(results.error);

    window.searchResultsCache = results;
    renderSearchResults(results);

    if (params.startDate && params.endDate) {
        client.functions.invoke(FUNCTION_NAMES.GET_ORDERS_SUMMARY, { 
            body: { startDate: params.startDate, endDate: params.endDate }
        }).then(({ data, error }) => {
            if (error) console.error('讀取訂單彙總失敗:', error);
            else renderSearchSummary(data);
        });
    }

  } catch (e) {
    console.error('進階查詢訂單失敗:', e);
    searchResultsList.innerHTML = `<p class="error-message">查詢失敗：${e.message}</p>`;
  } finally {
    setFormSubmitting(advancedOrderSearchForm, false, '查詢');
  }
}

function renderSearchResults(results) {
  if (!results || results.length === 0) {
    searchResultsList.innerHTML = '<p>找不到符合條件的訂單。</p>';
    return;
  }

  const statusMap = {
    pending_payment: { text: '待備貨', class: 'pending' },
    paid: { text: '待出貨', class: 'paid' },
    shipped: { text: '已出貨', class: 'shipped' },
    cancelled: { text: '已取消', class: 'cancelled' },
  };

  searchResultsList.innerHTML = results
    .map((order) => {
      const statusInfo = statusMap[order.status] || { text: order.status, class: 'default' };
      const adr = order.shipping_address_snapshot;

      return `
        <div class="search-result-item" data-order-id="${order.id}" role="button" tabindex="0">
          <div class="result-header">
            <h3>訂單 #${order.order_number}</h3>
            <div class="result-sub-header">
              <span class="status-badge status-${statusInfo.class}">${statusInfo.text}</span>
              <span><strong>訂單日期:</strong> ${new Date(order.created_at).toLocaleDateString()}</span>
            </div>
          </div>
          <div class="result-body">
            <p><strong>顧客:</strong> ${adr?.recipient_name || 'N/A'} (${order.customer_email || '無Email'})</p>
            ${ order.status === 'shipped' ? `<p><strong>出貨資訊:</strong> ${new Date(order.shipped_at).toLocaleDateString()} / ${ order.carrier } - ${order.shipping_tracking_code}</p>` : '' }
            ${ order.status === 'cancelled' ? `<p><strong>取消原因:</strong> ${order.cancellation_reason || '未提供'}</p>` : '' }
          </div>
          <div class="result-footer">
            ${ order.status === 'shipped' ? `<button class="btn-secondary btn-resend" data-order-id="${order.id}" data-order-number="${order.order_number}">重寄通知</button>` : '' }
          </div>
        </div>
      `;
    })
    .join('');
}

async function handleResendNotification(orderId, orderNumber) {
  if (!confirm(`您確定要重新發送訂單 #${orderNumber} 的出貨通知嗎？`)) return;
  const btn = document.querySelector(`.btn-resend[data-order-id="${orderId}"]`);
  if (btn) {
    btn.disabled = true;
    btn.textContent = '處理中...';
  }
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
    if (btn) {
      btn.disabled = false;
      btn.textContent = '重寄通知';
    }
  }
}

function bindEvents() {
  logoutBtn.addEventListener('click', handleWarehouseLogout);

  orderListContainer.addEventListener('click', (e) => {
    const t = e.target.closest('.order-list-item');
    if (t) handleOrderSelection(t.dataset.orderId);
  });

  searchResultsList.addEventListener('click', (e) => {
    const resendBtn = e.target.closest('.btn-resend');
    if (resendBtn) {
      e.stopPropagation();
      handleResendNotification(resendBtn.dataset.orderId, resendBtn.dataset.orderNumber);
      return;
    }
    const resultItem = e.target.closest('.search-result-item');
    if (resultItem) {
      handleOrderSelection(resultItem.dataset.orderId);
    }
  });

  paymentConfirmationForm.addEventListener('submit', handlePaymentConfirmation);
  shippingForm.addEventListener('submit', handleShippingFormSubmit);
  printBtn.addEventListener('click', () => window.print());
  tabs.forEach((tab) => tab.addEventListener('click', handleTabClick));

  advancedOrderSearchForm.addEventListener('submit', handleAdvancedOrderSearch);
  advancedOrderSearchForm.addEventListener('reset', () => {
    searchResultsList.innerHTML = '<p>請輸入條件以開始查詢。</p>';
    searchSummaryContainerEl.innerHTML = '';
    orderDetailView.classList.add('hidden');
    emptyView.classList.remove('hidden');
  });

  btnCancelOrder.addEventListener('click', handleCancelOrder);
}

function handleTabClick(e) {
  const tab = e.target;
  if (currentStatusTab === tab.dataset.statusTab) return;
  currentStatusTab = tab.dataset.statusTab;
  tabs.forEach((t) => t.classList.remove('active'));
  tab.classList.add('active');
  orderDetailView.classList.add('hidden');
  searchResultsContainer.classList.add('hidden');
  emptyView.classList.remove('hidden');

  if (currentStatusTab === 'search') {
    orderListContainer.classList.add('hidden');
    searchFormContainer.classList.remove('hidden');
    searchResultsContainer.classList.remove('hidden');
    searchResultsList.innerHTML = '<p>請輸入條件以開始查詢。</p>';
    searchSummaryContainerEl.innerHTML = '';
  } else {
    orderListContainer.classList.remove('hidden');
    searchFormContainer.classList.add('hidden');
    if (advancedOrderSearchForm) advancedOrderSearchForm.reset();
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