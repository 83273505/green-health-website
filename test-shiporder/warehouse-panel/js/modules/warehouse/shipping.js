// ==============================================================================
// 檔案路徑: warehouse-panel/js/modules/warehouse/shipping.js
// 版本: v49.1 - 整合式物流流程最終版
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Warehouse Panel - Shipping Module (出貨管理儀表板 - 核心業務模組)
 * @description 處理待備貨、待出貨及訂單查詢的所有前端業務邏輯，並整合全新物流作業流程。
 * @version v49.1
 *
 * @update v49.1 - [BUGFIX: CONSTANTS_PATH]
 * 1. [錯誤修正] 修正了 `constants.js` 的 import 路徑，確保 `FUNCTION_NAMES` 
 *          等常數能夠被正確載入，解決了呼叫後端函式時因名稱為 `undefined` 
 *          而導致的 CORS 與 net::ERR_FAILED 錯誤。
 *
 * @update v49.0 - [REFACTOR: INTEGRATED LOGISTICS WORKFLOW]
 * 1. [核心重構] 完整整合「API 自動化」與「手動備援」的混合物流模式。
 * 2. [功能整合] 實現一鍵建立黑貓託運單與即時貨態查詢功能。
 * 3. [UI/UX] 重構訂單詳情渲染邏輯。
 * 4. [本地化] 全面正體化。
 */

import { supabase } from '/_shared/js/supabaseClient.js';
import { showNotification, setFormSubmitting } from '/_shared/js/utils.js';
import { requireWarehouseLogin, handleWarehouseLogout } from '/warehouse-panel/js/core/warehouseAuth.js';
// [v49.1] 核心修正：使用正確的相對路徑引入擴充後的 constants.js
import { TABLE_NAMES, FUNCTION_NAMES } from '../../core/constants.js';

let 目前使用者 = null;
let 訂單快取 = [];
let 運費費率快取 = [];
let 取消原因快取 = [];
let 已選訂單ID = null;
let 目前狀態分頁 = 'pending_payment';

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
const 付款方式選擇器 = document.getElementById('payment-method-selector');
const 付款參考輸入框 = document.getElementById('payment-reference-input');
const 列印按鈕 = document.getElementById('print-btn');
const 取消操作區塊 = document.getElementById('cancellation-action-section');
const 取消訂單按鈕 = document.getElementById('btn-cancel-order');
const 取消詳情區塊 = document.getElementById('cancellation-details-section');
const 取消詳情標籤 = document.getElementById('cancellation-details');
const 顧客輪廓內容標籤 = document.getElementById('customer-profile-content');
const 訂單歷史內容標籤 = document.getElementById('order-history-content');
const 查詢摘要容器標籤 = document.getElementById('search-summary-container');
const 物流操作區塊 = document.getElementById('logistics-action-section');
const 物流選項 = document.getElementById('logistics-options');
const 建立黑貓託運單按鈕 = document.getElementById('btn-create-tcat-shipment');
const 手動輸入按鈕 = document.getElementById('btn-manual-entry');
const 手動出貨表單 = document.getElementById('manual-shipping-form');
const 物流商選擇器 = document.getElementById('carrier-selector');
const 追蹤單號輸入框 = document.getElementById('tracking-code-input');
const 確認出貨按鈕 = document.getElementById('mark-as-shipped-btn');
const 物流結果區塊 = document.getElementById('logistics-result-section');
const 結果物流商 = document.getElementById('result-carrier');
const 結果追蹤單號 = document.getElementById('result-tracking-code');
const 查詢貨態按鈕 = document.getElementById('btn-query-status');
const 貨態彈出視窗 = document.getElementById('status-modal');
const 貨態視窗標題 = document.getElementById('modal-title');
const 貨態視窗內容 = document.getElementById('modal-body');
const 貨態視窗關閉按鈕 = document.getElementById('modal-close-btn');

/* ------------------------- 格式化輔助函式 ------------------------- */
function formatCurrency(amount) {
  if (amount === null || amount === undefined) return 'N/A';
  return `NT$ ${parseInt(amount, 10).toLocaleString('zh-TW')}`;
}

/* ------------------------- 核心資料讀取與渲染 ------------------------- */
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
  訂單列表容器.innerHTML = 訂單快取
    .map((o) => {
      return `
        <div class="order-list-item ${o.id === 已選訂單ID ? 'active' : ''}" data-order-id="${o.id}">
          <strong class="order-number">${o.order_number}</strong>
          <span class="recipient-name">${o.shipping_address_snapshot?.recipient_name || 'N/A'}</span>
          <span class="order-date">${new Date(o.created_at).toLocaleDateString()}</span>
        </div>
      `;
    })
    .join('');
}

function render備貨清單(items) {
  if (!備貨清單標籤) return;
  if (!items || items.length === 0) {
    備貨清單標籤.innerHTML = '<p class="error-message">無法載入此訂單的商品項目。</p>';
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

function render訂單歷史(logs) {
  if (!訂單歷史內容標籤) return;
  if (!logs || logs.length === 0) {
    訂單歷史內容標籤.innerHTML = '<p>尚無操作歷史記錄。</p>';
    return;
  }
  訂單歷史內容標籤.innerHTML = logs.map(log => {
      const detailsHtml = log.details ? `<div class="details">${JSON.stringify(log.details, null, 2)}</div>` : '';
      return `
          <div class="history-item">
              <span class="timestamp">${new Date(log.changed_at).toLocaleString('zh-TW')}</span>
              <strong>${log.event_type}</strong> by ${log.operator_email || 'System'}
              ${detailsHtml}
          </div>
      `;
  }).join('');
}

async function fetch訂單歷史(orderId) {
    if (!訂單歷史內容標籤) return;
    const client = await supabase;
    
    const { data: logs, error: logsError } = await client
        .from(TABLE_NAMES.ORDER_HISTORY_LOGS)
        .select('changed_at, changed_by_user_id, event_type, details')
        .eq('order_id', orderId)
        .order('changed_at', { ascending: false });

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
        const { data: profiles, error: profilesError } = await client
            .from(TABLE_NAMES.PROFILES)
            .select('id, email')
            .in('id', operatorIds);

        if (profilesError) {
            console.warn('獲取操作員Email失敗:', profilesError.message);
        } else {
            operatorsMap = profiles.reduce((acc, profile) => {
                acc[profile.id] = profile.email;
                return acc;
            }, {});
        }
    }

    const formattedLogs = logs.map(log => ({
        ...log,
        operator_email: operatorsMap[log.changed_by_user_id] || log.changed_by_user_id || 'System'
    }));

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

  [
    付款確認區塊,
    物流操作區塊,
    物流結果區塊,
    取消操作區塊,
    取消詳情區塊,
    手動出貨表單,
  ].forEach((el) => {
    if (el) el.classList.add('hidden');
  });

  追蹤單號輸入框.value = '';
  付款參考輸入框.value = '';
  訂單編號標題.textContent = `訂單 #${order.order_number}`;

  const adr = order.shipping_address_snapshot;
  if (收件地址標籤) {
    收件地址標籤.innerHTML =
      adr && typeof adr === 'object'
        ? `<p><strong>收件人:</strong> ${adr.recipient_name || 'N/A'}</p>
           <p><strong>手機:</strong> ${adr.phone_number || 'N/A'}</p>
           ${adr.tel_number ? `<p><strong>市話:</strong> ${adr.tel_number}</p>` : ''}
           <p><strong>地址:</strong> ${adr.postal_code || ''} ${adr.city || ''}${adr.district || ''}${
             adr.street_address || ''
           }</p>`
        : `<p class="error-message">無有效的收件資訊。</p>`;
  }

  const methodName = order.shipping_rates?.method_name || '未指定';
  if (配送方式詳情標籤) 配送方式詳情標籤.innerHTML = `<p><strong>配送方式:</strong> ${methodName}</p>`;

  const paymentStatusText = order.payment_status === 'paid' ? '已付款' : '待付款';
  if (付款詳情標籤) 付款詳情標籤.innerHTML = `<p><strong>付款狀態:</strong> <span class="status-${order.payment_status}">${paymentStatusText}</span></p>
                                <p><strong>付款參考:</strong> ${order.payment_reference || '無'}</p>`;

  switch (order.status) {
    case 'pending_payment':
      付款確認區塊?.classList.remove('hidden');
      取消操作區塊?.classList.remove('hidden');
      break;
    case 'paid':
      物流操作區塊?.classList.remove('hidden');
      物流選項?.classList.remove('hidden');
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
        取消詳情標籤.innerHTML = `
            <p><strong>取消時間:</strong> ${new Date(order.cancelled_at).toLocaleString('zh-TW')}</p>
            <p><strong>取消原因:</strong> ${order.cancellation_reason || '未提供原因'}</p>
        `;
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

async function populate物流商選擇器(defaultCarrier) {
  if (運費費率快取.length === 0) {
    try {
      const client = await supabase;
      const { data, error } = await client.from(TABLE_NAMES.SHIPPING_RATES).select('*').eq('is_active', true);
      if (error) throw error;
      運費費率快取 = data;
    } catch (e) {
      console.error('讀取運送方式失敗', e);
      return;
    }
  }
  if (物流商選擇器) {
    物流商選擇器.innerHTML = 運費費率快取
        .map((r) => `<option value="${r.method_name}" ${r.method_name === defaultCarrier ? 'selected' : ''}>${r.method_name}</option>`)
        .join('');
  }
}

async function handle確認收款(e) {
  e.preventDefault();
  if (!付款確認表單) return;
  setFormSubmitting(付款確認表單, true, '確認中...');
  try {
    const client = await supabase;
    const { data, error } = await client.functions.invoke(FUNCTION_NAMES.MARK_ORDER_AS_PAID, {
      body: {
        orderId: 已選訂單ID,
        paymentMethod: 付款方式選擇器.value,
        paymentReference: 付款參考輸入框.value.trim(),
      },
    });
    if (error) throw new Error(error.message);
    if (data.error) throw new Error(data.error);
    showNotification('收款確認成功！訂單已移至「待出貨」。', 'success');
    訂單快取 = 訂單快取.filter((o) => o.id !== 已選訂單ID);
    已選訂單ID = null;
    render訂單列表();
    訂單詳情視圖.classList.add('hidden');
    空白視圖.classList.remove('hidden');
  } catch (e) {
    showNotification(`確認收款失敗：${e.message}`, 'error');
  } finally {
    setFormSubmitting(付款確認表單, false, '確認收款');
  }
}

async function handle手動出貨表單提交(e) {
  e.preventDefault();
  if (!手動出貨表單) return;
  setFormSubmitting(手動出貨表單, true, '處理中...');
  try {
    const client = await supabase;
    const { data, error } = await client.functions.invoke(FUNCTION_NAMES.MARK_ORDER_AS_SHIPPED, {
      body: {
        orderId: 已選訂單ID,
        shippingTrackingCode: 追蹤單號輸入框.value.trim(),
        selectedCarrierMethodName: 物流商選擇器.value,
      },
    });
    if (error) throw new Error(error.message);
    if (data.error) throw new Error(data.error);
    showNotification('出貨成功！訂單已更新並已通知顧客。', 'success');
    訂單快取 = 訂單快取.filter((o) => o.id !== 已選訂單ID);
    已選訂單ID = null;
    render訂單列表();
    訂單詳情視圖.classList.add('hidden');
    空白視圖.classList.remove('hidden');
  } catch (e) {
    showNotification(`出貨失敗：${e.message}`, 'error');
  } finally {
    setFormSubmitting(手動出貨表單, false, '確認出貨');
  }
}

async function handle建立黑貓託運單() {
    if (!已選訂單ID) return;
    const order = 訂單快取.find(o => o.id === 已選訂單ID);
    if (!confirm(`您確定要為訂單 ${order.order_number} 建立黑貓託運單嗎？`)) return;

    setFormSubmitting(建立黑貓託運單按鈕, true, '建立中...');
    console.log(`[T-cat Create] 操作員 ${目前使用者.email} 正在為訂單 ${order.order_number} (ID: ${已選訂單ID}) 建立託運單...`);

    try {
        const client = await supabase;
        const { data, error } = await client.functions.invoke(FUNCTION_NAMES.CREATE_TCAT_SHIPMENT, { body: { orderId: 已選訂單ID } });

        if (error) throw error;
        if (data.error) throw new Error(data.error);
        if (!data.success) throw new Error(data.apiResponse?.Message || 'API 未回報成功');

        const tcatOrderData = data.apiResponse.Data.Orders[0];
        console.log('[T-cat Create] API 成功回應:', tcatOrderData);
        
        const { error: shippedError } = await client.functions.invoke(FUNCTION_NAMES.MARK_ORDER_AS_SHIPPED, {
            body: {
                orderId: 已選訂單ID,
                shippingTrackingCode: tcatOrderData.OBTNumber,
                selectedCarrierMethodName: '黑貓宅急便',
                shippingTrackingFileNo: tcatOrderData.FileNo,
            }
        });
        if (shippedError) throw shippedError;

        showNotification('黑貓託運單已成功建立並回寫，訂單已出貨！', 'success');
        await fetch訂單依狀態(目前狀態分頁);
        訂單詳情視圖.classList.add('hidden');
        空白視圖.classList.remove('hidden');

    } catch (e) {
        console.error('[T-cat Create] 建立黑貓託運單失敗:', e);
        showNotification(`建立託運單失敗: ${e.message}`, 'error');
    } finally {
        setFormSubmitting(建立黑貓託運單按鈕, false, '建立黑貓託運單 (API)');
    }
}

async function handle查詢貨態() {
    const order = (window.searchResultsCache || 訂單快取).find(o => o.id === 已選訂單ID);
    if (!order || !order.shipping_tracking_code) return;

    const trackingNumber = order.shipping_tracking_code;
    setFormSubmitting(查詢貨態按鈕, true, '查詢中...');
    console.log(`[T-cat Status] 操作員 ${目前使用者.email} 正在查詢貨態`, { trackingNumber });

    try {
        const client = await supabase;
        const { data, error } = await client.functions.invoke(FUNCTION_NAMES.GET_TCAT_SHIPMENT_STATUS, {
            body: { trackingNumbers: [trackingNumber] }
        });

        if (error) throw error;
        if (data.error) throw new Error(data.error);
        if (data.IsOK === 'N') throw new Error(`黑貓 API 回報: ${data.Message}`);
        
        console.log('[T-cat Status] 成功獲取貨態資料:', data);
        render貨態彈出視窗(data.Data.OBTs[0]);

    } catch (e) {
        console.error('[T-cat Status] 查詢貨態失敗:', e);
        showNotification(`查詢貨態失敗: ${e.message}`, 'error');
    } finally {
        setFormSubmitting(查詢貨態按鈕, false, '查詢貨態');
    }
}

function render貨態彈出視窗(shipmentStatus) {
    if (!shipmentStatus || !shipmentStatus.StatusList || shipmentStatus.StatusList.length === 0) {
        貨態視窗內容.innerHTML = '<p class="empty-message">查無此託運單的貨態詳細資訊。</p>';
        const order = (window.searchResultsCache || 訂單快取).find(o => o.id === 已選訂單ID);
        貨態視窗標題.textContent = `貨態歷程 - ${order.shipping_tracking_code}`;
    } else {
        貨態視窗標題.textContent = `貨態歷程 - ${shipmentStatus.OBTNumber}`;
        const timelineHtml = `
            <div class="status-timeline">
                ${shipmentStatus.StatusList.map(status => `
                    <div class="timeline-item">
                        <div class="timeline-dot"></div>
                        <div class="timeline-content">
                            <p class="status-name">${status.StatusName} (${status.StatusId})</p>
                            <span class="station-name">${status.StationName}</span>
                            <span class="status-time">${new Date(status.CreateDateTime.replace(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/, '$1-$2-$3T$4:$5:$6')).toLocaleString('zh-TW')}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        貨態視窗內容.innerHTML = timelineHtml;
    }
    貨態彈出視窗.classList.remove('hidden');
}

async function fetch取消原因() {
  if (取消原因快取.length > 0) return;
  try {
    const client = await supabase;
    const { data, error } = await client
      .from(TABLE_NAMES.ORDER_CANCELLATION_REASONS)
      .select('reason')
      .eq('is_active', true)
      .order('sort_order');
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

async function handle取消訂單() {
  const order = 訂單快取.find((o) => o.id === 已選訂單ID);
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

    setFormSubmitting(取消訂單按鈕, true, '取消中...');
    modal.confirmBtn.disabled = true;

    try {
      const client = await supabase;
      const { data, error } = await client.functions.invoke(FUNCTION_NAMES.CANCEL_ORDER, {
        body: { orderId: 已選訂單ID, reason: finalReason },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      showNotification(data?.message || '訂單已成功取消！', 'success');
      訂單快取 = 訂單快取.filter((o) => o.id !== 已選訂單ID);
      已選訂單ID = null;
      render訂單列表();
      訂單詳情視圖.classList.add('hidden');
      空白視圖.classList.remove('hidden');
      modal.close();
    } catch (e) {
      showNotification(`取消訂單失敗：${e.message}`, 'error');
      console.error('[Cancel Order] Error:', e);
    } finally {
      setFormSubmitting(取消訂單按鈕, false, '取消此訂單');
      if(modal.confirmBtn) modal.confirmBtn.disabled = false;
    }
  });
}

function render查詢摘要(summary) {
    if (!查詢摘要容器標籤) return;
    if (!summary) {
        查詢摘要容器標籤.innerHTML = '';
        return;
    }
    查詢摘要容器標籤.innerHTML = `
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

async function handle進階訂單查詢(e) {
  e.preventDefault();
  if (!進階訂單查詢表單) return;
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
        client.functions.invoke(FUNCTION_NAMES.GET_ORDERS_SUMMARY, { 
            body: filteredParams 
        }).then(({ data, error }) => {
            if (error) console.error('讀取訂單彙總失敗:', error);
            else render查詢摘要(data);
        });
    }

  } catch (e) {
    console.error('進階查詢訂單失敗:', e);
    查詢結果列表.innerHTML = `<p class="error-message">查詢失敗：${e.message}</p>`;
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

  查詢結果列表.innerHTML = results
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
    if (element) {
      element.addEventListener(event, handler);
    } else {
      console.warn(`[bindEvents] 警告：試圖綁定事件的元素不存在。`);
    }
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
    if (resultItem) {
      handle訂單選取(resultItem.dataset.orderId);
    }
  });
  safeAddEventListener(付款確認表單, 'submit', handle確認收款);
  safeAddEventListener(手動出貨表單, 'submit', handle手動出貨表單提交);
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
  
  // [v49.0] 新物流流程事件綁定
  safeAddEventListener(建立黑貓託運單按鈕, 'click', handle建立黑貓託運單);
  safeAddEventListener(手動輸入按鈕, 'click', async () => {
      物流選項.classList.add('hidden');
      手動出貨表單.classList.remove('hidden');
      const order = 訂單快取.find(o => o.id === 已選訂單ID);
      await populate物流商選擇器(order.shipping_rates?.method_name || '未指定');
  });
  safeAddEventListener(查詢貨態按鈕, 'click', handle查詢貨態);
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
  bindEvents();
  await fetch訂單依狀態(目前狀態分頁);
}