// ==============================================================================
// 檔案路徑: warehouse-panel/js/modules/warehouse/shipping.js
// 版本: v50.1 - 共享函式庫引用修正版
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Warehouse Panel - Shipping Module (出貨管理儀表板 - 核心業務模組)
 * @description 作為主控制器，管理整體UI流程，並根據情境載入並執行對應的物流策略。
 * @version v50.1
 *
 * @update v50.1 - [BUGFIX: MISSING_IMPORT]
 * 1. [錯誤修正] 在檔案頂部重新加入了對 `/_shared/js/utils.js` 的 `import` 語句。
 * 2. [問題解決] 此修改解決了在 `handle進階訂單查詢` 等函式中，因找不到
 *          `setFormSubmitting` 而導致的 `ReferenceError`，恢復了系統的正常功能。
 *
 * @update v50.0 - [REFACTOR: STRATEGY_PATTERN]
 * 1. [核心架構] 引入「策略模式」，將具體物流操作邏輯剝離至獨立模組。
 */

import { supabase } from '/_shared/js/supabaseClient.js';
// [v50.1] 核心修正：重新加入對共享輔助函式庫的引用
import { showNotification, setFormSubmitting } from '/_shared/js/utils.js';
import { requireWarehouseLogin, handleWarehouseLogout } from '/warehouse-panel/js/core/warehouseAuth.js';
import { TABLE_NAMES, FUNCTION_NAMES } from '../../core/constants.js';

// --- 全域變數與狀態管理 ---
let 目前使用者 = null;
let 訂單快取 = [];
let 取消原因快取 = [];
let 已選訂單ID = null;
let 目前狀態分頁 = 'pending_payment';
let 目前啟用的策略 = null;
let 物流策略模組 = {};

// --- DOM 元素獲取 ---
const 登出按鈕 = document.getElementById('logout-btn');
const 目前使用者Email標籤 = document.getElementById('current-user-email');
const 使用者管理連結 = document.getElementById('user-management-link');
const 分頁標籤群組 = document.querySelectorAll('.tab-link');
const 訂單列表容器 = document.getElementById('order-list-container');
const 查詢表單容器 = document.getElementById('search-form-container');
const 進階訂單查詢表單 = document.getElementById('advanced-order-search-form');
const 訂單詳情視圖 = document.getElementById('order-detail-view');
const 查詢結果容器 = document.getElementById('search-results-container');
const 查詢結果列表 = document.getElementById('search-results-list');
const 空白視圖 = document.getElementById('empty-view');
const 訂單編號標題 = document.getElementById('order-number-title');
const 備貨清單標籤 = document.getElementById('picking-list');
const 收件地址標籤 = document.getElementById('shipping-address');
const 配送方式詳情標籤 = document.getElementById('shipping-method-details');
const 付款詳情標籤 = document.getElementById('payment-details');
const 付款確認區塊 = document.getElementById('payment-confirmation-section');
const 付款確認表單 = document.getElementById('payment-confirmation-form');
const 列印按鈕 = document.getElementById('print-btn');
const 取消操作區塊 = document.getElementById('cancellation-action-section');
const 取消訂單按鈕 = document.getElementById('btn-cancel-order');
const 取消詳情區塊 = document.getElementById('cancellation-details-section');
const 取消詳情標籤 = document.getElementById('cancellation-details');
const 顧客輪廓內容標籤 = document.getElementById('customer-profile-content');
const 訂單歷史內容標籤 = document.getElementById('order-history-content');
const 查詢摘要容器標籤 = document.getElementById('search-summary-container');
const 物流操作區塊 = document.getElementById('logistics-action-section');
const 物流策略按鈕容器 = document.getElementById('logistics-strategy-buttons');
const 物流結果區塊 = document.getElementById('logistics-result-section');
const 結果物流商 = document.getElementById('result-carrier');
const 結果追蹤單號 = document.getElementById('result-tracking-code');
const 查詢貨態按鈕 = document.getElementById('btn-query-status');
const 貨態彈出視窗 = document.getElementById('status-modal');
const 貨態視窗關閉按鈕 = document.getElementById('modal-close-btn');

/* ------------------------- 策略載入與管理 ------------------------- */

async function loadLogisticsStrategies() {
    const strategiesToLoad = [
        { id: 'tcatStrategy', path: './strategies/tcatStrategy.js' },
        { id: 'manualStrategy', path: './strategies/manualStrategy.js' },
    ];
    try {
        const loadedModules = await Promise.all(
            strategiesToLoad.map(s => import(s.path))
        );
        loadedModules.forEach((module, index) => {
            const strategyId = strategiesToLoad[index].id;
            物流策略模組[strategyId] = module[strategyId];
        });
        console.log('[Strategy Loader] 所有物流策略已成功載入:', 物流策略模組);
    } catch (e) {
        console.error('[Strategy Loader] 載入物流策略失敗:', e);
        showNotification('載入物流模組時發生錯誤，部分功能可能無法使用。', 'error');
    }
}

function render可用的物流策略(order) {
    物流策略按鈕容器.innerHTML = '';
    const availableStrategies = [物流策略模組.tcatStrategy, 物流策略模組.manualStrategy];
    availableStrategies.forEach(strategy => {
        if (!strategy) return;
        const button = document.createElement('button');
        button.id = `btn-strategy-${strategy.id}`;
        button.className = strategy.buttonClass || 'btn-secondary';
        button.textContent = strategy.buttonLabel;
        button.dataset.strategyId = strategy.id;
        物流策略按鈕容器.appendChild(button);
    });
}

function handle策略選擇(e) {
    const strategyId = e.target.dataset.strategyId;
    if (!strategyId) return;

    if (目前啟用的策略 && typeof 目前啟用的策略.hide === 'function') {
        目前啟用的策略.hide();
    }
    
    const selectedStrategy = 物流策略模組[strategyId];
    const order = (目前狀態分頁 === 'search' ? window.searchResultsCache : 訂單快取).find(o => o.id === 已選訂單ID);

    if (selectedStrategy && order) {
        目前啟用的策略 = selectedStrategy;
        console.log(`[Controller] 將操作委派給策略: ${selectedStrategy.name}`);
        selectedStrategy.initiateShipment(order, 目前使用者, onShipmentSuccess);
    }
}

function onShipmentSuccess() {
    showNotification('出貨成功！訂單已更新。', 'success');
    const currentTabElement = document.querySelector(`.tab-link[data-status-tab="${目前狀態分頁}"]`);
    if (currentTabElement) {
        handleTabClick({ target: currentTabElement });
    }
    訂單詳情視圖.classList.add('hidden');
    空白視圖.classList.remove('hidden');
}

/* ------------------------- 核心 UI 渲染與互動 ------------------------- */

function formatCurrency(amount) {
    if (amount === null || amount === undefined) return 'N/A';
    return `NT$ ${parseInt(amount, 10).toLocaleString('zh-TW')}`;
}

async function fetch訂單依狀態(status) {
  訂單列表容器.innerHTML = '<div class="loading-spinner">載入中...</div>';
  try {
    const client = await supabase;
    const { data, error } = await client.functions.invoke(FUNCTION_NAMES.GET_PAID_ORDERS, { body: { status } });
    if (error) throw error;
    訂單快取 = data;
    render訂單列表();
  } catch (e) {
    console.error(`讀取 status=${status} 的訂單失敗:`, e);
    訂單列表容器.innerHTML = '<p class="error-message">讀取訂單失敗，請稍後再試。</p>';
  }
}

function render訂單列表() {
  if (訂單快取.length === 0) {
    let msg = '目前沒有此狀態的待辦訂單。';
    if (目前狀態分頁 === 'paid') {
        msg = '所有訂單皆已出貨，或尚在「待備貨」區。';
    } else if (目前狀態分頁 === 'pending_payment') {
        msg = '目前沒有待備貨的訂單。';
    }
    訂單列表容器.innerHTML = `<p style="padding:1rem;text-align:center;opacity:.7">${msg}</p>`;
    return;
  }
  訂單列表容器.innerHTML = 訂單快取.map((o) => `
        <div class="order-list-item ${o.id === 已選訂單ID ? 'active' : ''}" data-order-id="${o.id}">
          <strong class="order-number">${o.order_number}</strong>
          <span class="recipient-name">${o.shipping_address_snapshot?.recipient_name || 'N/A'}</span>
          <span class="order-date">${new Date(o.created_at).toLocaleDateString()}</span>
        </div>
      `).join('');
}

function render備貨清單(items) {
  if (!備貨清單標籤) return;
  if (!items || items.length === 0) {
    備貨清單標籤.innerHTML = '<p class="error-message">無法載入此訂單的商品項目。</p>';
    return;
  }
  const rows = items.map((it) => `
    <tr>
      <td>${it.product_variants.products.name}<small>（${it.product_variants.name}）</small></td>
      <td class="sku">${it.product_variants.sku}</td>
      <td class="quantity">${it.quantity}</td>
    </tr>`).join('');
  備貨清單標籤.innerHTML = `<table class="picking-table"><thead><tr><th>品名(規格)</th><th class="sku">SKU</th><th class="quantity">數量</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function render顧客輪廓(summary) {
  if (!顧客輪廓內容標籤) return;
  if (!summary) {
    顧客輪廓內容標籤.innerHTML = '<p class="error-message">無法載入顧客資訊。</p>';
    return;
  }
  const isHighRisk = summary.cancellationCount > 2;
  顧客輪廓內容標籤.innerHTML = `
    <div class="profile-metric"><span>首次下單日</span><strong>${summary.firstOrderDate ? new Date(summary.firstOrderDate).toLocaleDateString() : 'N/A'}</strong></div>
    <div class="profile-metric"><span>歷史總訂單</span><strong>${summary.totalOrders} 筆</strong></div>
    <div class="profile-metric"><span>歷史總消費</span><strong>${formatCurrency(summary.totalSpent)}</strong></div>
    <div class="profile-metric ${isHighRisk ? 'high-risk' : ''}"><span>歷史取消數</span><strong>${summary.cancellationCount} 次</strong></div>`;
}

function render訂單歷史(logs) {
  if (!訂單歷史內容標籤) return;
  if (!logs || logs.length === 0) {
    訂單歷史內容標籤.innerHTML = '<p>尚無操作歷史記錄。</p>';
    return;
  }
  訂單歷史內容標籤.innerHTML = logs.map(log => {
      const detailsHtml = log.details ? `<div class="details">${JSON.stringify(log.details, null, 2)}</div>` : '';
      return `<div class="history-item"><span class="timestamp">${new Date(log.changed_at).toLocaleString('zh-TW')}</span><strong>${log.event_type}</strong> by ${log.operator_email || 'System'}${detailsHtml}</div>`;
  }).join('');
}

async function fetch訂單歷史(orderId) {
    if (!訂單歷史內容標籤) return;
    const client = await supabase;
    const { data: logs, error: logsError } = await client.from(TABLE_NAMES.ORDER_HISTORY_LOGS).select('changed_at, changed_by_user_id, event_type, details').eq('order_id', orderId).order('changed_at', { ascending: false });
    if (logsError) {
        console.error('讀取訂單歷史失敗:', logsError);
        訂單歷史內容標籤.innerHTML = '<p class="error-message">讀取訂單歷史失敗。</p>';
        return;
    }
    if (logs.length === 0) {
        render訂單歷史([]);
        return;
    }
    const operatorIds = [...new Set(logs.map(log => log.changed_by_user_id).filter(Boolean))];
    let operatorsMap = {};
    if (operatorIds.length > 0) {
        const { data: profiles, error: profilesError } = await client.from(TABLE_NAMES.PROFILES).select('id, email').in('id', operatorIds);
        if (profilesError) {
            console.warn('獲取操作員Email失敗:', profilesError.message);
        } else {
            operatorsMap = profiles.reduce((acc, profile) => {
                acc[profile.id] = profile.email;
                return acc;
            }, {});
        }
    }
    const formattedLogs = logs.map(log => ({...log, operator_email: operatorsMap[log.changed_by_user_id] || log.changed_by_user_id || 'System'}));
    render訂單歷史(formattedLogs);
}

async function handle訂單選取(orderId) {
  已選訂單ID = orderId;
  const isFromSearch = 目前狀態分頁 === 'search';
  const sourceCache = isFromSearch ? window.searchResultsCache || [] : 訂單快取;
  if (!isFromSearch) {
    render訂單列表();
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
  空白視圖.classList.add('hidden');
  if (!isFromSearch) 查詢結果容器.classList.add('hidden');
  訂單詳情視圖.classList.remove('hidden');
  [付款確認區塊, 物流操作區塊, 物流結果區塊, 取消操作區塊, 取消詳情區塊].forEach((el) => {
    if (el) el.classList.add('hidden');
  });
  if (目前啟用的策略 && typeof 目前啟用的策略.hide === 'function') {
      目前啟用的策略.hide();
  }
  訂單編號標題.textContent = `訂單 #${order.order_number}`;
  const adr = order.shipping_address_snapshot;
  if (收件地址標籤) {
    收件地址標籤.innerHTML = adr && typeof adr === 'object' ? `<p><strong>收件人:</strong> ${adr.recipient_name || 'N/A'}</p><p><strong>手機:</strong> ${adr.phone_number || 'N/A'}</p>${adr.tel_number ? `<p><strong>市話:</strong> ${adr.tel_number}</p>` : ''}<p><strong>地址:</strong> ${adr.postal_code || ''} ${adr.city || ''}${adr.district || ''}${adr.street_address || ''}</p>` : `<p class="error-message">無有效的收件資訊。</p>`;
  }
  const methodName = order.shipping_rates?.method_name || '未指定';
  if (配送方式詳情標籤) 配送方式詳情標籤.innerHTML = `<p><strong>配送方式:</strong> ${methodName}</p>`;
  const paymentStatusText = order.payment_status === 'paid' ? '已付款' : '待付款';
  if (付款詳情標籤) 付款詳情標籤.innerHTML = `<p><strong>付款狀態:</strong> <span class="status-${order.payment_status}">${paymentStatusText}</span></p><p><strong>付款參考:</strong> ${order.payment_reference || '無'}</p>`;
  
  switch (order.status) {
    case 'pending_payment':
      付款確認區塊?.classList.remove('hidden');
      取消操作區塊?.classList.remove('hidden');
      break;
    case 'paid':
      物流操作區塊?.classList.remove('hidden');
      render可用的物流策略(order);
      取消操作區塊?.classList.remove('hidden');
      break;
    case 'shipped':
      物流結果區塊?.classList.remove('hidden');
      結果物流商.textContent = order.carrier || 'N/A';
      結果追蹤單號.textContent = order.shipping_tracking_code || 'N/A';
      break;
    case 'cancelled':
      取消詳情區塊?.classList.remove('hidden');
      if (取消詳情標籤) {
        取消詳情標籤.innerHTML = `<p><strong>取消時間:</strong> ${new Date(order.cancelled_at).toLocaleString('zh-TW')}</p><p><strong>取消原因:</strong> ${order.cancellation_reason || '未提供原因'}</p>`;
      }
      break;
  }
  
  備貨清單標籤.innerHTML = '<div class="loading-spinner">載入商品項目中...</div>';
  顧客輪廓內容標籤.innerHTML = '<p class="loading-text">載入顧客輪廓...</p>';
  訂單歷史內容標籤.innerHTML = '<p class="loading-text">載入操作歷史...</p>';
  
  const client = await supabase;
  const [itemsResult, profileResult] = await Promise.all([
    client.functions.invoke(FUNCTION_NAMES.GET_ORDER_DETAILS, { body: { orderId } }),
    order.user_id ? client.functions.invoke(FUNCTION_NAMES.GET_CUSTOMER_SUMMARY, { body: { userId: order.user_id } }) : Promise.resolve({ data: null, error: null }),
  ]);

  if (itemsResult.error) {
    console.error('讀取商品項目失敗:', itemsResult.error);
    備貨清單標籤.innerHTML = '<p class="error-message">讀取商品項目失敗。</p>';
  } else {
    render備貨清單(itemsResult.data);
  }
  if (!order.user_id) {
    顧客輪廓內容標籤.innerHTML = '<p>匿名顧客無歷史資料。</p>';
  } else if (profileResult.error) {
    console.error('讀取顧客輪廓失敗:', profileResult.error);
    顧客輪廓內容標籤.innerHTML = '<p class="error-message">讀取顧客輪廓失敗。</p>';
  } else {
    render顧客輪廓(profileResult.data);
  }
  fetch訂單歷史(orderId);
}

async function handle確認收款(e) {
  e.preventDefault();
  const form = document.getElementById('payment-confirmation-form');
  const methodSelector = document.getElementById('payment-method-selector');
  const referenceInput = document.getElementById('payment-reference-input');
  if (!form) return;
  setFormSubmitting(form, true, '確認中...');
  try {
    const client = await supabase;
    const { data, error } = await client.functions.invoke(FUNCTION_NAMES.MARK_ORDER_AS_PAID, {
      body: { orderId: 已選訂單ID, paymentMethod: methodSelector.value, paymentReference: referenceInput.value.trim() },
    });
    if (error) throw new Error(error.message);
    if (data.error) throw new Error(data.error);
    showNotification('收款確認成功！訂單已移至「待出貨」。', 'success');
    訂單快取 = 訂單快取.filter((o) => o.id !== 已選訂單ID);
    已選訂單ID = null;
    render訂單列表();
    訂單詳情視圖.classList.add('hidden');
    空白視圖.classList.remove('hidden');
  } catch (err) {
    showNotification(`確認收款失敗：${err.message}`, 'error');
  } finally {
    setFormSubmitting(form, false, '確認收款');
  }
}

async function fetch取消原因() {
  if (取消原因快取.length > 0) return;
  try {
    const client = await supabase;
    const { data, error } = await client.from(TABLE_NAMES.ORDER_CANCELLATION_REASONS).select('reason').eq('is_active', true).order('sort_order');
    if (error) throw error;
    取消原因快取 = data.map((x) => x.reason);
  } catch (e) {
    console.error('讀取取消原因失敗:', e);
    取消原因快取 = ['顧客要求取消', '其他 (請於備註詳述)'];
  }
}

function build取消彈出視窗(orderNumber) {
  document.getElementById('cancel-order-modal')?.remove();
  const wrapper = document.createElement('div');
  wrapper.id = 'cancel-order-modal';
  wrapper.className = 'modal-overlay';
  wrapper.innerHTML = `<div class="modal-content" role="dialog"><div class="modal-header"><h3 class="modal-title">取消訂單 #${orderNumber}</h3><p class="modal-subtitle">此動作將回補庫存且不可復原</p></div><div class="modal-body"><div class="form-group"><label for="cancel-reason-select">取消原因</label><select id="cancel-reason-select"></select></div><div class="form-group"><label for="cancel-reason-note">補充說明（選填）</label><textarea id="cancel-reason-note" rows="3"></textarea></div></div><div class="modal-footer"><button id="cancel-modal-close" class="btn-secondary">返回</button><button id="cancel-modal-confirm" class="btn-danger">確認取消</button></div></div>`;
  document.body.appendChild(wrapper);
  const onKey = (e) => {
    if (e.key === 'Escape') closeModal();
  };
  const closeModal = () => {
    wrapper.remove();
    document.removeEventListener('keydown', onKey);
  };
  setTimeout(() => document.addEventListener('keydown', onKey), 0);
  wrapper.addEventListener('click', (e) => { if (e.target === wrapper) closeModal(); });
  document.getElementById('cancel-modal-close')?.addEventListener('click', closeModal);
  return {
    reasonSelect: wrapper.querySelector('#cancel-reason-select'),
    noteInput: wrapper.querySelector('#cancel-reason-note'),
    confirmBtn: wrapper.querySelector('#cancel-modal-confirm'),
    close: closeModal,
  };
}

async function handle取消訂單() {
  const order = (目前狀態分頁 === 'search' ? window.searchResultsCache : 訂單快取).find((o) => o.id === 已選訂單ID);
  if (!order) return;
  await fetch取消原因();
  const modal = build取消彈出視窗(order.order_number);
  modal.reasonSelect.innerHTML = 取消原因快取.map((r) => `<option value="${r}">${r}</option>`).join('');
  modal.confirmBtn.addEventListener('click', async () => {
    const base = modal.reasonSelect.value || '';
    const note = (modal.noteInput.value || '').trim();
    const finalReason = note ? `${base}｜${note}` : base;
    if (!finalReason) {
      showNotification('請選擇或輸入取消原因。', 'error');
      return;
    }
    setFormSubmitting(modal.confirmBtn, true, '取消中...');
    try {
      const client = await supabase;
      const { data, error } = await client.functions.invoke(FUNCTION_NAMES.CANCEL_ORDER, { body: { orderId: 已選訂單ID, reason: finalReason } });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      showNotification(data?.message || '訂單已成功取消！', 'success');
      modal.close();
      await handleTabClick({ target: document.querySelector(`.tab-link[data-status-tab="${目前狀態分頁}"]`) });
      訂單詳情視圖.classList.add('hidden');
      空白視圖.classList.remove('hidden');
    } catch (e) {
      showNotification(`取消訂單失敗：${e.message}`, 'error');
      setFormSubmitting(modal.confirmBtn, false, '確認取消');
    }
  });
}

function render查詢摘要(summary) {
    if (!查詢摘要容器標籤) return;
    if (!summary) {
        查詢摘要容器標籤.innerHTML = '';
        return;
    }
    查詢摘要容器標籤.innerHTML = `<div class="summary-item"><span class="value">${summary.new_customers_count}</span><span class="label">區間新客數</span></div><div class="summary-item"><span class="value">${summary.total_orders_from_new_customers}</span><span class="label">新客總訂單</span></div><div class="summary-item"><span class="value">${formatCurrency(summary.total_spent_from_new_customers)}</span><span class="label">新客總金額</span></div>`;
}

async function handle進階訂單查詢(e) {
  e.preventDefault();
  setFormSubmitting(進階訂單查詢表單, true, '查詢中...');
  查詢結果列表.innerHTML = '<div class="loading-spinner">查詢中...</div>';
  查詢摘要容器標籤.innerHTML = '';
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
    render查詢結果(results);
    if (Object.keys(filteredParams).length > 0) {
        client.functions.invoke(FUNCTION_NAMES.GET_ORDERS_SUMMARY, { body: filteredParams }).then(({ data, error }) => {
            if (error) console.error('讀取訂單彙總失敗:', error);
            else render查詢摘要(data);
        });
    }
  } catch (err) {
    console.error('進階查詢訂單失敗:', err);
    查詢結果列表.innerHTML = `<p class="error-message">查詢失敗：${err.message}</p>`;
  } finally {
    setFormSubmitting(進階訂單查詢表單, false, '查詢');
  }
}

function render查詢結果(results) {
  if (!查詢結果列表) return;
  if (!results || results.length === 0) {
    查詢結果列表.innerHTML = '<p>找不到符合條件的訂單。</p>';
    return;
  }
  const statusMap = {
    pending_payment: { text: '待備貨', class: 'pending' },
    paid: { text: '待出貨', class: 'paid' },
    shipped: { text: '已出貨', class: 'shipped' },
    cancelled: { text: '已取消', class: 'cancelled' },
  };
  查詢結果列表.innerHTML = results.map((order) => {
      const statusInfo = statusMap[order.status] || { text: order.status, class: 'default' };
      const adr = order.shipping_address_snapshot;
      return `<div class="search-result-item" data-order-id="${order.id}" role="button" tabindex="0"><div class="result-header"><h3>訂單 #${order.order_number}</h3><div class="result-sub-header"><span class="status-badge status-${statusInfo.class}">${statusInfo.text}</span><span><strong>訂單日期:</strong> ${new Date(order.created_at).toLocaleDateString()}</span></div></div><div class="result-body"><p><strong>顧客:</strong> ${adr?.recipient_name || 'N/A'} (${order.customer_email || '無Email'})</p>${ order.status === 'shipped' ? `<p><strong>出貨資訊:</strong> ${new Date(order.shipped_at).toLocaleDateString()} / ${ order.carrier } - ${order.shipping_tracking_code}</p>` : '' }${ order.status === 'cancelled' ? `<p><strong>取消原因:</strong> ${order.cancellation_reason || '未提供'}</p>` : '' }</div><div class="result-footer">${ order.status === 'shipped' ? `<button class="btn-secondary btn-resend" data-order-id="${order.id}" data-order-number="${order.order_number}">重寄通知</button>` : '' }</div></div>`;
    }).join('');
}

async function handle重寄通知(orderId, orderNumber) {
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
  const safeAddEventListener = (element, event, handler) => {
    if (element) element.addEventListener(event, handler);
  };
  safeAddEventListener(登出按鈕, 'click', handleWarehouseLogout);
  safeAddEventListener(訂單列表容器, 'click', (e) => {
    const t = e.target.closest('.order-list-item');
    if (t) handle訂單選取(t.dataset.orderId);
  });
  safeAddEventListener(查詢結果列表, 'click', (e) => {
    const resendBtn = e.target.closest('.btn-resend');
    if (resendBtn) {
      e.stopPropagation();
      handle重寄通知(resendBtn.dataset.orderId, resendBtn.dataset.orderNumber);
      return;
    }
    const resultItem = e.target.closest('.search-result-item');
    if (resultItem) handle訂單選取(resultItem.dataset.orderId);
  });
  safeAddEventListener(付款確認表單, 'submit', handle確認收款);
  safeAddEventListener(列印按鈕, 'click', () => window.print());
  if (分頁標籤群組) {
      分頁標籤群組.forEach((tab) => safeAddEventListener(tab, 'click', handleTabClick));
  }
  safeAddEventListener(進階訂單查詢表單, 'submit', handle進階訂單查詢);
  safeAddEventListener(進階訂單查詢表單, 'reset', () => {
    查詢結果列表.innerHTML = '<p>請輸入條件以開始查詢。</p>';
    查詢摘要容器標籤.innerHTML = '';
    訂單詳情視圖.classList.add('hidden');
    空白視圖.classList.remove('hidden');
  });
  safeAddEventListener(取消訂單按鈕, 'click', handle取消訂單);
  safeAddEventListener(物流策略按鈕容器, 'click', handle策略選擇);
  safeAddEventListener(查詢貨態按鈕, 'click', () => {
    const order = (目前狀態分頁 === 'search' ? window.searchResultsCache : 訂單快取).find(o => o.id === 已選訂單ID);
    if (!order) return;
    if (order.carrier === '黑貓宅急便' && 物流策略模組.tcatStrategy && typeof 物流策略模組.tcatStrategy.queryStatus === 'function') {
      物流策略模組.tcatStrategy.queryStatus(order);
    } else {
      showNotification('此物流商暫不支援線上即時貨態查詢。', 'info');
    }
  });
  safeAddEventListener(貨態視窗關閉按鈕, 'click', () => 貨態彈出視窗.classList.add('hidden'));
  safeAddEventListener(貨態彈出視窗, 'click', (e) => {
      if (e.target === 貨態彈出視窗) 貨態彈出視窗.classList.add('hidden');
  });
}

function handleTabClick(e) {
  const tab = e.target;
  if (目前狀態分頁 === tab.dataset.statusTab) return;
  目前狀態分頁 = tab.dataset.statusTab;
  if (分頁標籤群組) {
    分頁標籤群組.forEach((t) => t.classList.remove('active'));
  }
  tab.classList.add('active');
  訂單詳情視圖.classList.add('hidden');
  查詢結果容器.classList.add('hidden');
  空白視圖.classList.remove('hidden');
  if (目前狀態分頁 === 'search') {
    訂單列表容器.classList.add('hidden');
    查詢表單容器.classList.remove('hidden');
    查詢結果容器.classList.remove('hidden');
    查詢結果列表.innerHTML = '<p>請輸入條件以開始查詢。</p>';
    查詢摘要容器標籤.innerHTML = '';
  } else {
    訂單列表容器.classList.remove('hidden');
    查詢表單容器.classList.add('hidden');
    if (進階訂單查詢表單) 進階訂單查詢表單.reset();
    已選訂單ID = null;
    訂單快取 = [];
    fetch訂單依狀態(目前狀態分頁);
  }
}

export async function init() {
  目前使用者 = await requireWarehouseLogin();
  if (!目前使用者) return;
  if (目前使用者Email標籤) 目前使用者Email標籤.textContent = 目前使用者.email;
  const roles = 目前使用者.app_metadata?.roles || [];
  if (roles.includes('super_admin')) 使用者管理連結?.classList.remove('hidden');
  
  await loadLogisticsStrategies();
  bindEvents();
  await fetch訂單依狀態(目前狀態分頁);
}