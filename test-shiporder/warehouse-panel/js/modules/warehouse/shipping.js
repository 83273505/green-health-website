// ==============================================================================
// 檔案路徑: warehouse-panel/js/modules/warehouse/shipping.js
// 版本: v45.4 - 訂單取消勝利收官版
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Shipping Module (出貨管理模組)
 * @description 負責處理出貨儀表板的所有業務邏輯，包含備貨、出貨與訂單取消。
 * @version v45.4
 * 
 * @update v45.4 - [ORDER CANCELLATION WORKFLOW]
 * 1. [功能新增] 完整實現「取消訂單」功能，包含詳細的操作日誌。
 * 2. [介面連動] 現在點選「待備貨」或「待出貨」狀態的訂單時，會顯示
 *          「取消此訂單」的操作區塊。
 * 3. [後端整合] `handleCancelOrder` 函式會彈出原因選擇框，並呼叫新建的
 *          `cancel-order` 後端函式，實現庫存回補與狀態更新。
 * 4. [專案完成] 至此，訂單管理的核心流程（備貨、出貨、取消、查詢）均已完成。
 */

import { supabase } from '/_shared/js/supabaseClient.js';
import { showNotification, setFormSubmitting, formatPrice } from '/_shared/js/utils.js';
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


async function fetchOrdersByStatus(status) {
    orderListContainer.innerHTML = '<div class="loading-spinner">載入中...</div>';
    try {
        const client = await supabase;
        const { data, error } = await client.functions.invoke(FUNCTION_NAMES.GET_PAID_ORDERS, { 
            body: { status: status } 
        });
        if (error) throw error;
        ordersCache = data;
        renderOrderList();
    } catch (error) {
        console.error(`獲取 status=${status} 的訂單失敗:`, error);
        orderListContainer.innerHTML = '<p class="error-message">讀取訂單失敗，請稍後再試。</p>';
    }
}

function renderOrderList() {
    if (ordersCache.length === 0) {
        let message = currentStatusTab === 'paid' 
            ? '所有訂單皆已出貨，或尚有訂單在「待備貨」區等待確認付款。' 
            : '目前沒有待備貨的訂單。';
        orderListContainer.innerHTML = `<p style="padding: 1rem; text-align: center; color: var(--text-light);">${message}</p>`;
        return;
    }
    orderListContainer.innerHTML = ordersCache.map(order => `
        <div class="order-list-item ${order.id === selectedOrderId ? 'active' : ''}" data-order-id="${order.id}">
            <strong class="order-number">${order.order_number}</strong>
            <span class="recipient-name">${order.shipping_address_snapshot?.recipient_name || 'N/A'}</span>
            <span class="order-date">${new Date(order.created_at).toLocaleDateString()}</span>
        </div>
    `).join('');
}

function renderPickingList(items) {
    if (!items || items.length === 0) {
        pickingListEl.innerHTML = '<p class="error-message">無法載入此訂單的商品項目。</p>';
        return;
    }
    const tableHtml = `<table class="picking-table"><thead><tr><th>品名 (規格)</th><th class="sku">SKU</th><th class="quantity">數量</th></tr></thead><tbody>${items.map(item => `<tr><td>${item.product_variants.products.name}<small>(${item.product_variants.name})</small></td><td class="sku">${item.product_variants.sku}</td><td class="quantity">${item.quantity}</td></tr>`).join('')}</tbody></table>`;
    pickingListEl.innerHTML = tableHtml;
}

async function handleOrderSelection(orderId) {
    selectedOrderId = orderId;
    renderOrderList();
    
    const selectedOrder = ordersCache.find(o => o.id === orderId);
    if (!selectedOrder) return;
    
    emptyView.classList.add('hidden');
    searchResultsContainer.classList.add('hidden');
    orderDetailView.classList.remove('hidden');
    
    [paymentConfirmationSection, shippingActionSection, cancellationActionSection].forEach(el => el.classList.add('hidden'));
    
    trackingCodeInput.value = '';
    paymentReferenceInput.value = '';

    orderNumberTitle.textContent = `訂單 #${selectedOrder.order_number}`;
    
    const address = selectedOrder.shipping_address_snapshot;
    shippingAddressEl.innerHTML = (address && typeof address === 'object') ? `<p><strong>收件人:</strong> ${address.recipient_name || 'N/A'}</p><p><strong>手機:</strong> ${address.phone_number || 'N/A'}</p>${address.tel_number ? `<p><strong>市話:</strong> ${address.tel_number}</p>` : ''}<p><strong>地址:</strong> ${address.postal_code || ''} ${address.city || ''}${address.district || ''}${address.street_address || ''}</p>` : `<p class="error-message">無有效的收件資訊。</p>`;
    
    const methodName = selectedOrder.shipping_rates?.method_name || '未指定';
    shippingMethodDetailsEl.innerHTML = `<p><strong>配送方式:</strong> ${methodName}</p>`;
    
    const paymentStatusText = selectedOrder.payment_status === 'paid' ? '已付款' : '待付款';
    paymentDetailsEl.innerHTML = `<p><strong>付款狀態:</strong> <span class="status-${selectedOrder.payment_status}">${paymentStatusText}</span></p><p><strong>付款參考:</strong> ${selectedOrder.payment_reference || '無'}</p>`;

    if (selectedOrder.status === 'pending_payment') {
        paymentConfirmationSection.classList.remove('hidden');
        cancellationActionSection.classList.remove('hidden');
    } else if (selectedOrder.status === 'paid') {
        shippingActionSection.classList.remove('hidden');
        cancellationActionSection.classList.remove('hidden');
    }

    pickingListEl.innerHTML = '<div class="loading-spinner">載入商品項目中...</div>';
    try {
        const client = await supabase;
        const { data: items, error } = await client.functions.invoke(FUNCTION_NAMES.GET_ORDER_DETAILS, { body: { orderId: selectedOrderId } });
        if (error) throw error;
        renderPickingList(items);
    } catch (err) {
        console.error('獲取訂單詳細項目失敗:', err);
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
        } catch (error) { console.error("讀取運送方式失敗", error); return; }
    }
    carrierSelector.innerHTML = shippingRatesCache.map(rate => `<option value="${rate.method_name}" ${rate.method_name === defaultCarrier ? 'selected' : ''}>${rate.method_name}</option>`).join('');
}

async function handlePaymentConfirmation(event) {
    event.preventDefault();
    setFormSubmitting(paymentConfirmationForm, true, "確認中...");
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
    } catch (err) {
        showNotification(`確認收款失敗：${err.message}`, 'error');
    } finally {
        setFormSubmitting(paymentConfirmationForm, false, "確認收款");
    }
}

async function handleShippingFormSubmit(event) {
    event.preventDefault();
    setFormSubmitting(shippingForm, true, "處理中...");
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
    } catch (err) {
        showNotification(`出貨失敗：${err.message}`, 'error');
    } finally {
        setFormSubmitting(shippingForm, false, "確認出貨並通知顧客");
    }
}

async function fetchCancellationReasons() {
    if (cancellationReasonsCache.length > 0) return;
    console.log('[Cancel Order] 正在從資料庫獲取標準取消原因...');
    try {
        const client = await supabase;
        const { data, error } = await client
            .from('order_cancellation_reasons')
            .select('reason')
            .eq('is_active', true)
            .order('sort_order');
        if (error) throw error;
        cancellationReasonsCache = data.map(item => item.reason);
        console.log('[Cancel Order] 標準取消原因獲取成功:', cancellationReasonsCache);
    } catch (error) {
        console.error("讀取訂單取消原因失敗:", error);
        cancellationReasonsCache = ['顧客要求取消', '其他'];
    }
}

async function handleCancelOrder() {
    const selectedOrder = ordersCache.find(o => o.id === selectedOrderId);
    if (!selectedOrder) return;

    console.log(`[Cancel Order] 操作員 ${currentUser.email} 已啟動取消訂單 #${selectedOrder.order_number} 的流程。`);
    await fetchCancellationReasons();
    const reasonPrompt = `請選擇或輸入取消訂單 #${selectedOrder.order_number} 的原因：\n\n預設選項：\n${cancellationReasonsCache.map((r, i) => `${i + 1}. ${r}`).join('\n')}\n\n您可以直接輸入數字選擇，或自行填寫原因。`;
    const userInput = prompt(reasonPrompt);

    if (!userInput || userInput.trim() === '') {
        showNotification('您已取消操作。', 'info');
        console.log('[Cancel Order] 操作員已取消操作。');
        return;
    }

    let reason = userInput.trim();
    const choice = parseInt(reason, 10);
    if (!isNaN(choice) && choice > 0 && choice <= cancellationReasonsCache.length) {
        reason = cancellationReasonsCache[choice - 1];
    }
    
    console.log(`[Cancel Order] 最終取消原因為: "${reason}"，準備呼叫後端函式。`);
    setFormSubmitting(btnCancelOrder, true, "取消中...");
    try {
        const client = await supabase;
        const { data, error } = await client.functions.invoke(FUNCTION_NAMES.CANCEL_ORDER, {
            body: { orderId: selectedOrderId, reason: reason }
        });

        if (error) throw new Error(error.message);
        if (data.error) throw new Error(data.error);

        showNotification(data.message || '訂單已成功取消！', 'success');
        console.log(`[Cancel Order] 訂單 #${selectedOrder.order_number} 已成功取消。後端回傳:`, data);
        
        ordersCache = ordersCache.filter(o => o.id !== selectedOrderId);
        selectedOrderId = null;
        renderOrderList();
        orderDetailView.classList.add('hidden');
        emptyView.classList.remove('hidden');

    } catch (err) {
        showNotification(`取消訂單失敗：${err.message}`, 'error');
        console.error(`[Cancel Order] 取消訂單 #${selectedOrder.order_number} 時發生嚴重錯誤:`, err);
    } finally {
        setFormSubmitting(btnCancelOrder, false, "取消此訂單");
    }
}

async function handleSearchShippedOrders(event) {
    event.preventDefault();
    setFormSubmitting(shippedOrderSearchForm, true, "查詢中...");
    searchResultsList.innerHTML = '<div class="loading-spinner">查詢中...</div>';
    const searchParams = {
        orderNumber: document.getElementById('search-order-number').value.trim(),
        recipientName: document.getElementById('search-recipient-name').value.trim(),
        email: document.getElementById('search-email').value.trim(),
        phone: document.getElementById('search-phone').value.trim(),
        startDate: document.getElementById('search-start-date').value,
        endDate: document.getElementById('search-end-date').value,
    };
    const filteredParams = Object.fromEntries(Object.entries(searchParams).filter(([_, v]) => v));
    try {
        const client = await supabase;
        const { data: results, error } = await client.functions.invoke(FUNCTION_NAMES.SEARCH_SHIPPED_ORDERS, { body: filteredParams });
        if (error) throw error;
        renderSearchResults(results);
    } catch(err) {
        console.error("查詢已出貨訂單失敗:", err);
        searchResultsList.innerHTML = '<p class="error-message">查詢失敗，請稍後再試。</p>';
    } finally {
        setFormSubmitting(shippedOrderSearchForm, false, "查詢");
    }
}

function renderSearchResults(results) {
    if (!results || results.length === 0) {
        searchResultsList.innerHTML = '<p>找不到符合條件的已出貨訂單。</p>';
        return;
    }
    searchResultsList.innerHTML = results.map(order => {
        const address = order.shipping_address_snapshot;
        const items = order.order_items;
        const addressHtml = (address && typeof address === 'object') ? `<p><strong>收件人:</strong> ${address.recipient_name || 'N/A'}</p><p><strong>手機:</strong> ${address.phone_number || 'N/A'}</p><p><strong>地址:</strong> ${address.postal_code || ''} ${address.city || ''}${address.district || ''}${address.street_address || ''}</p>` : '<p class="error-message">無有效的收件資訊。</p>';
        const itemsHtml = (items && items.length > 0) ? `<table class="picking-table"><tbody>${items.map(item => `<tr><td>${item.product_variants.products.name}<small>(${item.product_variants.name})</small></td><td class="quantity">x ${item.quantity}</td></tr>`).join('')}</tbody></table>` : '<p>無商品項目資訊。</p>';
        return `
        <div class="search-result-item">
            <div class="result-header"><h3>訂單 #${order.order_number}</h3><div class="result-sub-header"><span><strong>出貨日期:</strong> ${new Date(order.shipped_at).toLocaleDateString()}</span><span><strong>物流:</strong> ${order.carrier} - ${order.shipping_tracking_code}</span></div></div>
            <div class="result-body"><div class="result-section"><h4>商品明細</h4>${itemsHtml}</div><div class="result-section"><h4>收件資訊</h4>${addressHtml}</div></div>
            <div class="result-footer"><button class="btn-secondary btn-resend" data-order-id="${order.id}" data-order-number="${order.order_number}">重寄通知</button></div>
        </div>`
    }).join('');
}

async function handleResendNotification(orderId, orderNumber) {
    if (!confirm(`您確定要重新發送訂單 #${orderNumber} 的出貨通知嗎？`)) return;
    const button = document.querySelector(`.btn-resend[data-order-id="${orderId}"]`);
    if (button) { button.disabled = true; button.textContent = '處理中...'; }
    try {
        const client = await supabase;
        const { data, error } = await client.functions.invoke(FUNCTION_NAMES.RESEND_SHIPPED_NOTIFICATION, { body: { orderId } });
        if (error) throw error;
        if (data.error) throw new Error(data.error);
        alert(`訂單 #${orderNumber} 的出貨通知已成功重寄！`);
    } catch(err) {
        console.error(`重寄訂單 #${orderNumber} 通知失敗:`, err);
        alert(`重寄失敗：${err.message}`);
    } finally {
        if (button) { button.disabled = false; button.textContent = '重寄通知'; }
    }
}

function handleTabClick(event) {
    const clickedTab = event.target;
    if (currentStatusTab === clickedTab.dataset.statusTab) return;
    currentStatusTab = clickedTab.dataset.statusTab;
    tabs.forEach(tab => tab.classList.remove('active'));
    clickedTab.classList.add('active');
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

function handlePrint() { window.print(); }

function bindEvents() {
    logoutBtn.addEventListener('click', handleWarehouseLogout);
    orderListContainer.addEventListener('click', (event) => {
        const target = event.target.closest('.order-list-item');
        if (target) { handleOrderSelection(target.dataset.orderId); }
    });
    searchResultsList.addEventListener('click', (event) => {
        const target = event.target.closest('.btn-resend');
        if (target) {
            handleResendNotification(target.dataset.orderId, target.dataset.orderNumber);
        }
    });
    paymentConfirmationForm.addEventListener('submit', handlePaymentConfirmation);
    shippingForm.addEventListener('submit', handleShippingFormSubmit);
    printBtn.addEventListener('click', handlePrint);
    tabs.forEach(tab => tab.addEventListener('click', handleTabClick));
    shippedOrderSearchForm.addEventListener('submit', handleSearchShippedOrders);
    btnCancelOrder.addEventListener('click', handleCancelOrder);
}

export async function init() {
    currentUser = await requireWarehouseLogin();
    if (!currentUser) return;
    if (currentUserEmailEl) { currentUserEmailEl.textContent = currentUser.email; }
    const userRoles = currentUser.app_metadata?.roles || [];
    if (userRoles.includes('super_admin')) {
        if (userManagementLink) userManagementLink.classList.remove('hidden');
    }
    bindEvents();
    await fetchOrdersByStatus(currentStatusTab);
}