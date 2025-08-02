// 檔案路徑: warehouse-panel/js/modules/warehouse/shipping.js
// 【此版本包含獲取並渲染備貨清單的完整邏輯】

import { supabase } from '../../core/warehouseSupabaseClient.js';
import { requireWarehouseLogin, getCurrentWarehouseUser, handleWarehouseLogout } from '../../core/warehouseAuth.js';
import { showNotification, setFormSubmitting } from '../../core/utils.js';
import { TABLE_NAMES, FUNCTION_NAMES } from '../../core/constants.js';

// --- 狀態管理 ---
let currentUser = null;
let ordersCache = []; 
let shippingRatesCache = []; 
let selectedOrderId = null; 

// --- DOM 元素獲取 ---
const logoutBtn = document.getElementById('logout-btn');
const currentUserEmailEl = document.getElementById('current-user-email');
const orderListContainer = document.getElementById('order-list-container');
const orderDetailView = document.getElementById('order-detail-view');
const emptyView = document.getElementById('empty-view');
const orderNumberTitle = document.getElementById('order-number-title');
const pickingListEl = document.getElementById('picking-list');
const shippingAddressEl = document.getElementById('shipping-address');
const paymentDetailsEl = document.getElementById('payment-details');
const shippingForm = document.getElementById('shipping-form');
const carrierSelector = document.getElementById('carrier-selector');
const trackingCodeInput = document.getElementById('tracking-code-input');
// 【新增】獲取列印按鈕
const printBtn = document.getElementById('print-btn');


// --- 核心函式 ---

async function fetchPendingOrders() {
    orderListContainer.innerHTML = '<div class="loading-spinner">載入中...</div>';
    
    // 【修改部分】在呼叫 Edge Function 時，明確指定函式名稱
    const { data, error } = await supabase.functions.invoke(FUNCTION_NAMES.GET_PAID_ORDERS);

    if (error) {
        console.error('獲取待出貨訂單失敗:', error);
        orderListContainer.innerHTML = '<p class="error-message">讀取訂單失敗，請稍後再試。</p>';
        return;
    }

    ordersCache = data;
    renderOrderList();
}

function renderOrderList() {
    if (ordersCache.length === 0) {
        orderListContainer.innerHTML = '<p>目前沒有待出貨的訂單。</p>';
        return;
    }

    orderListContainer.innerHTML = ordersCache.map(order => `
        <div class="order-list-item ${order.id === selectedOrderId ? 'active' : ''}" data-order-id="${order.id}">
            <strong class="order-number">${order.order_number}</strong>
            <span class="recipient-name">${order.recipient_name}</span>
            <span class="order-date">${new Date(order.order_date).toLocaleDateString()}</span>
        </div>
    `).join('');
}

/**
 * 【新增函式】渲染備貨清單
 * @param {Array} items - 從 get-order-details 獲取的商品項目陣列
 */
function renderPickingList(items) {
    if (!items || items.length === 0) {
        pickingListEl.innerHTML = '<p class="error-message">無法載入此訂單的商品項目。</p>';
        return;
    }
    
    // 使用表格來呈現結構化資料
    const tableHtml = `
        <table class="picking-table">
            <thead>
                <tr>
                    <th>品名 (規格)</th>
                    <th class="sku">SKU</th>
                    <th class="quantity">數量</th>
                </tr>
            </thead>
            <tbody>
                ${items.map(item => `
                    <tr>
                        <td>
                            ${item.product_variants.products.name}
                            <small>(${item.product_variants.name})</small>
                        </td>
                        <td class="sku">${item.product_variants.sku}</td>
                        <td class="quantity">${item.quantity}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    pickingListEl.innerHTML = tableHtml;
}


async function handleOrderSelection(orderId) {
    selectedOrderId = orderId;
    renderOrderList();
    
    const selectedOrder = ordersCache.find(o => o.id === orderId);
    if (!selectedOrder) return;
    
    emptyView.classList.add('hidden');
    orderDetailView.classList.remove('hidden');

    orderNumberTitle.textContent = `訂單 #${selectedOrder.order_number}`;
    
    // 填充收件資訊 (維持不變)
    const address = selectedOrder.shipping_address_snapshot;
    if (shippingAddressEl && address) {
        shippingAddressEl.innerHTML = `
            <p><strong>收件人:</strong> ${address.recipient_name}</p>
            <p><strong>電話:</strong> ${address.phone_number}</p>
            <p><strong>地址:</strong> ${address.postal_code} ${address.city}${address.district}${address.street_address}</p>
        `;
    }

    // 填充付款狀態 (維持不變)
    if (paymentDetailsEl) {
        const paymentStatusText = selectedOrder.payment_status === 'paid' ? '已付款' : '待付款';
        paymentDetailsEl.innerHTML = `
            <p><strong>付款狀態:</strong> <span class="status-${selectedOrder.payment_status}">${paymentStatusText}</span></p>
            <p><strong>付款參考:</strong> ${selectedOrder.payment_reference || '無'}</p>
        `;
    }

    // 【修改部分】填充備貨清單
    pickingListEl.innerHTML = '<div class="loading-spinner">載入商品項目中...</div>';
    try {
        const { data: items, error } = await supabase.functions.invoke('get-order-details', {
            body: { orderId: selectedOrderId }
        });
        if (error) throw error;
        renderPickingList(items); // 呼叫新的渲染函式
    } catch (err) {
        console.error('獲取訂單詳細項目失敗:', err);
        pickingListEl.innerHTML = '<p class="error-message">讀取商品項目失敗。</p>';
    }
    
    // 填充配送服務下拉選單 (維持不變)
    populateCarrierSelector(selectedOrder.shipping_method_name);
}

async function populateCarrierSelector(defaultCarrier) {
    if (shippingRatesCache.length === 0) {
        const { data, error } = await supabase.from(TABLE_NAMES.SHIPPING_RATES).select('*').eq('is_active', true);
        if (error) {
            console.error("讀取運送方式失敗", error);
            return;
        }
        shippingRatesCache = data;
    }

    carrierSelector.innerHTML = shippingRatesCache.map(rate => 
        `<option value="${rate.method_name}" ${rate.method_name === defaultCarrier ? 'selected' : ''}>${rate.method_name}</option>`
    ).join('');
}


async function handleShippingFormSubmit(event) {
    event.preventDefault();
    setFormSubmitting(shippingForm, true, "處理中...");
    
    const selectedCarrierMethodName = carrierSelector.value;
    const shippingTrackingCode = trackingCodeInput.value.trim();

    try {
        // 【修改部分】明確指定函式名稱
        const { data, error } = await supabase.functions.invoke(FUNCTION_NAMES.MARK_ORDER_AS_SHIPPED, {
            body: { orderId: selectedOrderId, shippingTrackingCode, selectedCarrierMethodName }
        });

        if (error) throw new Error(error.message);
        if (data.error) throw new Error(data.error);

        showNotification('出貨成功！訂單已更新並已通知顧客。', 'success');
        
        ordersCache = ordersCache.filter(o => o.id !== selectedOrderId);
        selectedOrderId = null;
        renderOrderList();
        orderDetailView.classList.add('hidden');
        emptyView.classList.remove('hidden');

    } catch (err) {
        showNotification(`出貨失敗：${err.message}`, 'error');
    } finally {
        setFormSubmitting(shippingForm, false, "確認出貨並通知顧客");
    }
}

/**
 * 【新增函式】處理列印功能
 */
function handlePrint() {
    // 暫時隱藏不需列印的元素
    const elementsToHide = document.querySelectorAll('.main-header, .order-queue-panel, .action-section, #print-btn');
    elementsToHide.forEach(el => el.style.visibility = 'hidden');

    // 執行瀏覽器的列印功能
    window.print();

    // 列印結束後恢復顯示
    elementsToHide.forEach(el => el.style.visibility = 'visible');
}


function bindEvents() {
    logoutBtn.addEventListener('click', handleWarehouseLogout);
    
    orderListContainer.addEventListener('click', (event) => {
        const target = event.target.closest('.order-list-item');
        if (target) {
            handleOrderSelection(target.dataset.orderId);
        }
    });

    shippingForm.addEventListener('submit', handleShippingFormSubmit);
    
    // 【新增】為列印按鈕綁定事件
    printBtn.addEventListener('click', handlePrint);
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