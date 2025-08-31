// ==============================================================================
// 檔案路徑: tcatshipment-panel/js/app.js
// 版本: v1.1 - 品質提升收官版
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file T-cat Shipment Panel App (黑貓託運單儀表板應用程式)
 * @description 處理黑貓託運單儀表板的所有前端業務 logique，包含訂單獲取、
 *              詳情展示、批次勾選與託運單建立。
 * @version v1.1
 * 
 * @update v1.1 - [CODE QUALITY & BUG FIX]
 * 1. [品質提升] 引入 `constants.js` 模組，使用 `FUNCTION_NAMES` 常數取代了
 *          呼叫後端函式時的魔法字串，提升了程式碼的可維護性。
 * 2. [錯誤修正] 移除了 `render` 函式中錯誤使用的、僅存在於後端的 `Deno.env.get`
 *          語法，解決了在瀏覽器中會導致的 `ReferenceError`。
 */

import { supabase } from '/_shared/js/supabaseClient.js';
import { showNotification, setFormSubmitting } from '/_shared/js/utils.js';
import { requireWarehouseLogin, handleWarehouseLogout } from '/warehouse-panel/js/core/warehouseAuth.js';
import { FUNCTION_NAMES } from './constants.js'; // [v1.1] 核心新增

// --- 狀態管理 ---
let currentUser = null;
let state = {
  orders: [],
  selectedOrderIds: new Set(),
  currentOrder: null,
  isLoading: false,
  currentTab: 'pending',
};

// --- DOM 元素獲取 ---
const logoutBtn = document.getElementById('logout-btn');
const currentUserEmailEl = document.getElementById('current-user-email');
const tabs = document.querySelectorAll('.tab-link');
const orderListContainer = document.getElementById('order-list-container');
const detailView = document.getElementById('detail-view');
const emptyView = document.getElementById('empty-view');
const orderNumberTitle = document.getElementById('order-number-title');
const btnBatchCreate = document.getElementById('btn-batch-create-shipment');
// 詳情區塊
const senderNameEl = document.getElementById('sender-name');
const senderPhoneEl = document.getElementById('sender-phone');
const senderAddressEl = document.getElementById('sender-address');
const recipientNameEl = document.getElementById('recipient-name');
const recipientPhoneEl = document.getElementById('recipient-phone');
const recipientAddressEl = document.getElementById('recipient-address');
const thermosphereEl = document.getElementById('thermosphere');
const specEl = document.getElementById('spec');
const productNameEl = document.getElementById('product-name');
const collectionStatusEl = document.getElementById('collection-status');
const shipmentDateEl = document.getElementById('shipment-date');
const deliveryDateEl = document.getElementById('delivery-date');
const deliveryTimeEl = document.getElementById('delivery-time');
// 操作區塊
const createShipmentSection = document.getElementById('create-shipment-section');
const resultSection = document.getElementById('result-section');
const btnCreateSingle = document.getElementById('btn-create-single-shipment');
const obtNumberEl = document.getElementById('obt-number');
const fileNoEl = document.getElementById('file-no');
const btnDownloadShipment = document.getElementById('btn-download-shipment');
const notificationMessageEl = document.getElementById('notification-message');

/**
 * 根據當前狀態更新 UI
 */
function render() {
  console.log('[Render] 正在根據新狀態更新 UI:', state);
  
  if (state.isLoading) {
    orderListContainer.innerHTML = '<div class="loading-spinner">載入中...</div>';
  } else if (state.orders.length === 0) {
    orderListContainer.innerHTML = '<p class="empty-message">沒有待處理的訂單。</p>';
  } else {
    orderListContainer.innerHTML = state.orders.map(order => `
      <div class="order-list-item ${state.currentOrder?.id === order.id ? 'active' : ''}" data-order-id="${order.id}">
        <input type="checkbox" class="order-checkbox" data-order-id="${order.id}" ${state.selectedOrderIds.has(order.id) ? 'checked' : ''}>
        <div class="order-info">
          <strong class="order-number">${order.order_number}</strong>
          <span class="recipient-name">${order.shipping_address_snapshot?.recipient_name || 'N/A'}</span>
        </div>
        <span class="order-date">${new Date(order.created_at).toLocaleDateString()}</span>
      </div>
    `).join('');
  }

  if (state.currentOrder) {
    emptyView.classList.add('hidden');
    detailView.classList.remove('hidden');
    
    const order = state.currentOrder;
    const address = order.shipping_address_snapshot || {};
    
    orderNumberTitle.textContent = `訂單 #${order.order_number}`;
    // [v1.1] 核心修正: 移除後端專用語法，改為靜態文字
    senderNameEl.textContent = '綠健有限公司'; 
    senderPhoneEl.textContent = '02-12345678';
    senderAddressEl.textContent = '台北市中山區某某路一段一號';
    
    recipientNameEl.textContent = address.recipient_name || 'N/A';
    recipientPhoneEl.textContent = address.phone_number || 'N/A';
    recipientAddressEl.textContent = `${address.city || ''}${address.district || ''}${address.street_address || ''}`;
    
    productNameEl.textContent = (order.order_items || [])
      .map(item => `${item.product_variants.products.name}(${item.product_variants.name}) x${item.quantity}`)
      .join(', ')
      .substring(0, 20);

    const now = new Date();
    shipmentDateEl.textContent = `${now.getFullYear()}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getDate().toString().padStart(2, '0')}`;
    const deliveryDate = new Date(new Date().setDate(now.getDate() + 1));
    deliveryDateEl.textContent = `${deliveryDate.getFullYear()}/${(deliveryDate.getMonth() + 1).toString().padStart(2, '0')}/${deliveryDate.getDate().toString().padStart(2, '0')}`;

    if (order.shipping_tracking_code && order.carrier === '黑貓宅急便') {
        createShipmentSection.classList.add('hidden');
        resultSection.classList.remove('hidden');
        obtNumberEl.textContent = order.shipping_tracking_code;
    } else {
        createShipmentSection.classList.remove('hidden');
        resultSection.classList.add('hidden');
    }
  } else {
    emptyView.classList.remove('hidden');
    detailView.classList.add('hidden');
  }

  btnBatchCreate.disabled = state.selectedOrderIds.size === 0;
}

async function fetchPendingOrders() {
  state.isLoading = true;
  render();
  try {
    const client = await supabase;
    const { data, error } = await client
      .from('orders')
      .select('*, order_items(*, product_variants(*, products(*))), shipping_rates(*)')
      .eq('status', 'paid')
      .is('shipping_tracking_code', null); 

    if (error) throw error;
    state.orders = data || [];
  } catch (error) {
    console.error('獲取待處理訂單失敗:', error);
    showNotification('讀取訂單列表失敗，請稍後再試。', 'notification-message');
    state.orders = [];
  } finally {
    state.isLoading = false;
    render();
  }
}

function handleOrderSelect(orderId) {
  state.currentOrder = state.orders.find(o => o.id === orderId) || null;
  render();
}

function handleCheckboxChange(event) {
  const orderId = event.target.dataset.orderId;
  if (event.target.checked) {
    state.selectedOrderIds.add(orderId);
  } else {
    state.selectedOrderIds.delete(orderId);
  }
  render();
}

async function handleCreateShipment(orderIds) {
  if (orderIds.length === 0) return;
  
  const isBatch = orderIds.length > 1;
  const btn = isBatch ? btnBatchCreate : btnCreateSingle;
  const orderNumbers = orderIds.map(id => state.orders.find(o => o.id === id)?.order_number).join(', ');

  if (!confirm(`您確定要為訂單 ${orderNumbers} 建立託運單嗎？`)) return;

  setFormSubmitting(btn, true, '建立中...');
  console.log(`[T-cat] 操作員 ${currentUser.email} 正在為 ${orderIds.length} 筆訂單建立託運單...`, orderIds);
  
  try {
    const client = await supabase;
    const promises = orderIds.map(id => 
      // [v1.1] 核心修正: 使用常數取代魔法字串
      client.functions.invoke(FUNCTION_NAMES.CREATE_TCAT_SHIPMENT, { body: { orderId: id } })
    );
    const results = await Promise.all(promises);

    const successes = results.filter(r => !r.error && r.data?.success);
    const failures = results.filter(r => r.error || !r.data?.success);

    if (failures.length > 0) {
      const failedOrderIds = failures.map((f, i) => orderIds.find((id, idx) => idx === i));
      console.error('[T-cat] 部分託運單建立失敗:', failures);
      showNotification(`部分訂單建立失敗: ${failedOrderIds.join(', ')}。請檢查日誌。`, 'error', 'notification-message');
    }
    
    if (successes.length > 0) {
      showNotification(`${successes.length} 筆訂單的託運單已成功建立！`, 'success', 'notification-message');
      await fetchPendingOrders();
      if (state.currentOrder && orderIds.includes(state.currentOrder.id)) {
        // 在新資料中重新尋找並選取
        state.currentOrder = state.orders.find(o => o.id === state.currentOrder.id) || null;
        render();
      }
    }
  } catch (error) {
    console.error('[T-cat] 批次建立託運單時發生嚴重錯誤:', error);
    showNotification('建立託運單時發生未知錯誤，請重試。', 'error', 'notification-message');
  } finally {
    setFormSubmitting(btn, false, isBatch ? '批次建立所選託運單' : '建立此筆託運單');
  }
}

function bindEvents() {
  logoutBtn.addEventListener('click', handleWarehouseLogout);

  orderListContainer.addEventListener('click', (event) => {
    const item = event.target.closest('.order-list-item');
    if (item && item.dataset.orderId) {
      handleOrderSelect(item.dataset.orderId);
    }
    if (event.target.matches('.order-checkbox')) {
      handleCheckboxChange(event);
    }
  });

  btnCreateSingle.addEventListener('click', () => {
    if (state.currentOrder) {
      handleCreateShipment([state.currentOrder.id]);
    }
  });

  btnBatchCreate.addEventListener('click', () => {
    handleCreateShipment(Array.from(state.selectedOrderIds));
  });
}

export async function init() {
  currentUser = await requireWarehouseLogin();
  if (!currentUser) return;
  if (currentUserEmailEl) {
    currentUserEmailEl.textContent = currentUser.email;
  }

  bindEvents();
  await fetchPendingOrders();
}