// 檔案路徑: js/modules/checkout/checkout.js (Final Full Version)

import { supabase } from '../../core/supabaseClient.js';
import { requireLogin } from '../../core/session.js';
import { CartService } from '../../services/CartService.js';
import { TABLE_NAMES, ROUTES } from '../../core/constants.js';
import { formatPrice, showNotification } from '../../core/utils.js';

// --- 狀態管理 ---
let currentUser = null;
let userAddresses = [];
let shippingMethods = [];
let paymentMethods = [];
let selectedAddressId = null;
let selectedShippingMethodId = null;
let selectedPaymentMethodId = null;

// --- DOM 元素獲取 ---
const loadingOverlay = document.getElementById('loading-overlay');
const checkoutContainer = document.querySelector('.checkout-container');
const addressListContainer = document.getElementById('address-list-container');
const shippingListContainer = document.getElementById('shipping-list-container');
const paymentListContainer = document.getElementById('payment-list-container');
const summarySubtotalEl = document.getElementById('summary-subtotal');
const summaryCouponEl = document.getElementById('summary-coupon-discount');
const summaryShippingEl = document.getElementById('summary-shipping-fee');
const summaryTotalEl = document.getElementById('summary-total-price');
const placeOrderBtn = document.getElementById('place-order-btn');
const addNewAddressBtn = document.getElementById('add-new-address-btn');

/**
 * 從後端獲取所有結帳所需的必要資料
 */
async function fetchData() {
    const [addressRes, shippingRes, paymentRes] = await Promise.all([
        supabase.from(TABLE_NAMES.ADDRESSES).select('*').eq('user_id', currentUser.id).order('is_default', { ascending: false }),
        supabase.from('shipping_rates').select('*').eq('is_active', true).order('rate', { ascending: true }),
        supabase.from('payment_methods').select('*').eq('is_active', true).order('sort_order', { ascending: true })
    ]);

    if (addressRes.error) console.error('獲取地址失敗:', addressRes.error);
    if (shippingRes.error) console.error('獲取運送方式失敗:', shippingRes.error);
    if (paymentRes.error) console.error('獲取付款方式失敗:', paymentRes.error);

    userAddresses = addressRes.data || [];
    shippingMethods = shippingRes.data || [];
    paymentMethods = paymentRes.data || [];

    // 自動選中預設地址，或第一個地址
    const defaultAddress = userAddresses.find(addr => addr.is_default) || userAddresses[0];
    if (defaultAddress) {
        selectedAddressId = defaultAddress.id;
    }

    // 從 CartService 的“記憶”中，讀取已選擇的運送方式
    const cartState = CartService.getState();
    if (cartState.selectedShippingMethodId && shippingMethods.some(m => m.id === cartState.selectedShippingMethodId)) {
        selectedShippingMethodId = cartState.selectedShippingMethodId;
    }
}

/**
 * 將獲取到的所有資料渲染到頁面上
 */
function render() {
    if (addressListContainer) {
        if (userAddresses && userAddresses.length > 0) {
            addressListContainer.innerHTML = userAddresses.map(addr => {
                const isSelected = addr.id === selectedAddressId;
                return `<div class="option-item ${isSelected ? 'selected' : ''}"><label><input type="radio" name="address" value="${addr.id}" ${isSelected ? 'checked' : ''}><div class="address-details"><p class="name">${addr.recipient_name} ${addr.is_default ? '(預設)' : ''}</p><p>${addr.phone_number}</p><p>${addr.postal_code} ${addr.city}${addr.district}${addr.street_address}</p></div></label></div>`;
            }).join('');
        } else {
            addressListContainer.innerHTML = '<p>您尚未建立任何收貨地址。</p>';
        }
    }
    if (shippingListContainer && shippingMethods) {
        shippingListContainer.innerHTML = shippingMethods.map(method => {
            const isSelected = method.id === selectedShippingMethodId;
            return `<div class="option-item ${isSelected ? 'selected' : ''}"><label><input type="radio" name="shipping" value="${method.id}" ${isSelected ? 'checked' : ''}><span>${method.method_name}</span></label></div>`;
        }).join('');
    }
    if (paymentListContainer && paymentMethods) {
        if (paymentMethods.length > 0) {
            paymentListContainer.innerHTML = paymentMethods.map(method => {
                const isSelected = method.id === selectedPaymentMethodId;
                return `<div class="option-item ${isSelected ? 'selected' : ''}"><label><input type="radio" name="payment" value="${method.id}" ${isSelected ? 'checked' : ''}><div class="payment-details"><span class="name">${method.method_name}</span>${method.description ? `<p class="description">${method.description}</p>` : ''}</div></label></div>`;
            }).join('');
        } else {
            paymentListContainer.innerHTML = '<p>目前無可用付款方式。</p>';
        }
    }
    const { summary } = CartService.getState();
    if (summarySubtotalEl) summarySubtotalEl.textContent = formatPrice(summary.subtotal);
    if (summaryCouponEl) {
        summaryCouponEl.textContent = `- ${formatPrice(summary.couponDiscount)}`;
        summaryCouponEl.parentElement.style.display = summary.couponDiscount > 0 ? 'flex' : 'none';
    }
    if (summaryShippingEl) summaryShippingEl.textContent = formatPrice(summary.shippingFee);
    if (summaryTotalEl) summaryTotalEl.textContent = formatPrice(summary.total);
}

/**
 * 檢查並更新提交按鈕的狀態
 */
function updateSubmitButtonState() {
    if (placeOrderBtn) {
        const isReady = selectedAddressId && selectedShippingMethodId && selectedPaymentMethodId;
        placeOrderBtn.disabled = !isReady;
    }
}

/**
 * 處理選項變更的事件函式
 */
function handleSelectionChange(event) {
    const target = event.target;
    if (target.type !== 'radio') return;
    const { name, value } = target;
    if (name === 'address') selectedAddressId = value;
    else if (name === 'shipping') {
        selectedShippingMethodId = value;
        CartService.selectShippingMethod(selectedShippingMethodId);
    } else if (name === 'payment') selectedPaymentMethodId = value;
    render();
    updateSubmitButtonState();
}

/**
 * 處理下單請求的函式
 */
async function handlePlaceOrder() {
    if (!selectedAddressId || !selectedShippingMethodId || !selectedPaymentMethodId) return;
    placeOrderBtn.disabled = true;
    placeOrderBtn.textContent = '訂單處理中...';
    const cartState = CartService.getState();
    const frontendValidationSummary = { ...cartState.summary, couponCode: cartState.appliedCoupon?.code };
    try {
        const { data, error } = await supabase.functions.invoke('create-order-from-cart', {
            body: { cartId: cartState.cartId, selectedAddressId, selectedShippingMethodId, selectedPaymentMethodId, frontendValidationSummary }
        });
        if (error) throw error;
        if (data.error) {
            showNotification(data.error.message || '下單失敗，請稍後重試。', 'error', 'notification-message');
            placeOrderBtn.disabled = false;
            placeOrderBtn.textContent = '確認下單';
            return;
        }
        if (data.success && data.orderDetails) {
            sessionStorage.setItem('latestOrderDetails', JSON.stringify(data.orderDetails));
        }
        localStorage.removeItem('cartId');
        localStorage.removeItem('appliedCouponCode');
        localStorage.removeItem('selectedShippingMethodId');
        window.location.href = `${ROUTES.ORDER_SUCCESS}?order_number=${data.orderNumber}`;
    } catch (error) {
        console.error('下單時發生嚴重錯誤:', error);
        showNotification('下單失敗，系統發生未知錯誤。', 'error', 'notification-message');
        placeOrderBtn.disabled = false;
        placeOrderBtn.textContent = '確認下單';
    }
}

/**
 * 由 app.js 呼叫的主初始化函式
 */
export async function init() {
    currentUser = await requireLogin();
    if (!currentUser) return;
    await CartService.init();
    if (CartService.getState().itemCount === 0) {
        alert('您的購物車是空的，將為您導向商品頁。');
        window.location.href = ROUTES.PRODUCTS_LIST;
        return;
    }
    await fetchData();
    render();
    updateSubmitButtonState();
    CartService.subscribe(render);
    if (loadingOverlay) loadingOverlay.style.display = 'none';
    if (checkoutContainer) checkoutContainer.style.display = 'grid';
    const mainContent = document.querySelector('.main-content');
    if (mainContent) mainContent.addEventListener('change', handleSelectionChange);
    if (addNewAddressBtn) addNewAddressBtn.addEventListener('click', () => { window.location.href = ROUTES.ADDRESS_MANAGEMENT; });
    if (placeOrderBtn) placeOrderBtn.addEventListener('click', handlePlaceOrder);
}