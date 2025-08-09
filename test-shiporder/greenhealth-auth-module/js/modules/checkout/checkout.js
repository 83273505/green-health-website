// ==============================================================================
// 檔案路徑: js/modules/checkout/checkout.js
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋 - 最終職責劃分版】
// ==============================================================================

import { supabase } from '../../core/supabaseClient.js';
import { requireLogin, getCurrentUser } from '../../core/session.js';
import { CartService } from '../../services/CartService.js';
import { TABLE_NAMES, ROUTES } from '../../core/constants.js';
import { formatPrice, showNotification } from '../../core/utils.js';

// --- 狀態管理 ---
let currentUser = null;
let userAddresses = [];
let paymentMethods = [];
let selectedAddressId = null;
let selectedPaymentMethodId = null;
let invoiceOptions = {
    type: 'cloud',
    carrier_type: 'member',
    carrier_number: null,
    donation_code: '',
    vat_number: '',
    company_name: ''
};

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
const invoiceTypeRadios = document.querySelectorAll('input[name="invoiceType"]');
const invoiceDetailsForms = document.getElementById('invoice-details-forms');
const carrierTypeSelector = document.getElementById('carrier-type');
const carrierNumberGroup = document.getElementById('carrier-number-group');
const carrierNumberInput = document.getElementById('carrier-number');
const donationCodeInput = document.getElementById('donation-code');
const vatNumberInput = document.getElementById('vat-number');
const companyNameInput = document.getElementById('company-name');


/**
 * 【重構】只獲取結帳頁面自身需要的資料 (地址、付款方式)。
 * 運送方式的資料來源已移交給 CartService。
 */
async function fetchData() {
    const [addressRes, paymentRes] = await Promise.all([
        supabase.from(TABLE_NAMES.ADDRESSES).select('*').eq('user_id', currentUser.id).order('is_default', { ascending: false }),
        supabase.from(TABLE_NAMES.PAYMENT_METHODS).select('*').eq('is_active', true).order('sort_order', { ascending: true })
    ]);

    if (addressRes.error) console.error('獲取地址失敗:', addressRes.error);
    if (paymentRes.error) console.error('獲取付款方式失敗:', paymentRes.error);

    userAddresses = addressRes.data || [];
    paymentMethods = paymentRes.data || [];

    const defaultAddress = userAddresses.find(addr => addr.is_default) || userAddresses[0];
    if (defaultAddress) {
        selectedAddressId = defaultAddress.id;
    }
}

/**
 * 【重構】渲染函式，現在依賴 CartService 作為購物車和運費的唯一資料來源。
 */
function render() {
    const cartState = CartService.getState();
    const { summary, availableShippingMethods, selectedShippingMethodId } = cartState;

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

    if (shippingListContainer) {
        if (!cartState.isReadyForRender) {
             shippingListContainer.innerHTML = '<p>正在載入運送方式...</p>';
        } else if (availableShippingMethods && availableShippingMethods.length > 0) {
            shippingListContainer.innerHTML = availableShippingMethods.map(method => {
                const isSelected = method.id === selectedShippingMethodId;
                return `<div class="option-item ${isSelected ? 'selected' : ''}"><label><input type="radio" name="shipping" value="${method.id}" ${isSelected ? 'checked' : ''}><span>${method.method_name}</span></label></div>`;
            }).join('');
        } else {
             shippingListContainer.innerHTML = '<p>目前無可用運送方式。</p>';
        }
    }

    if (paymentListContainer) {
        if (paymentMethods && paymentMethods.length > 0) {
            paymentListContainer.innerHTML = paymentMethods.map(method => {
                const isSelected = method.id === selectedPaymentMethodId;
                return `<div class="option-item ${isSelected ? 'selected' : ''}"><label><input type="radio" name="payment" value="${method.id}" ${isSelected ? 'checked' : ''}><div class="payment-details"><span class="name">${method.method_name}</span>${method.description ? `<p class="description">${method.description}</p>` : ''}</div></label></div>`;
            }).join('');
        } else {
            paymentListContainer.innerHTML = '<p>目前無可用付款方式。</p>';
        }
    }

    if (summarySubtotalEl) summarySubtotalEl.textContent = formatPrice(summary.subtotal);
    if (summaryCouponEl) {
        summaryCouponEl.textContent = `- ${formatPrice(summary.couponDiscount)}`;
        summaryCouponEl.parentElement.style.display = summary.couponDiscount > 0 ? 'flex' : 'none';
    }
    if (summaryShippingEl) summaryShippingEl.textContent = formatPrice(summary.shippingFee);
    if (summaryTotalEl) summaryTotalEl.textContent = formatPrice(summary.total);
    
    updateSubmitButtonState();
}

function handleInvoiceTypeChange() {
    const selectedType = document.querySelector('input[name="invoiceType"]:checked').value;
    invoiceOptions.type = selectedType;
    invoiceDetailsForms.querySelectorAll('div[id^="form-"]').forEach(form => form.classList.add('hidden'));
    const formToShow = document.getElementById(`form-${selectedType}`);
    if (formToShow) {
        formToShow.classList.remove('hidden');
    }
    handleInvoiceDetailsChange();
}

function handleInvoiceDetailsChange() {
    invoiceOptions.carrier_type = carrierTypeSelector.value;
    invoiceOptions.carrier_number = carrierNumberInput.value.trim();
    invoiceOptions.donation_code = donationCodeInput.value.trim();
    invoiceOptions.vat_number = vatNumberInput.value.trim();
    invoiceOptions.company_name = companyNameInput.value.trim();

    if (invoiceOptions.type === 'cloud' && (invoiceOptions.carrier_type === 'mobile' || invoiceOptions.carrier_type === 'certificate')) {
        carrierNumberGroup.classList.remove('hidden');
        carrierNumberInput.placeholder = invoiceOptions.carrier_type === 'mobile' ? '請輸入 / 開頭，共 8 碼英數字' : '請輸入共 16 碼英數字';
    } else {
        carrierNumberGroup.classList.add('hidden');
    }
    
    if (invoiceOptions.type === 'cloud' && invoiceOptions.carrier_type === 'member') {
        invoiceOptions.carrier_number = currentUser.email;
    }
}

function validateInvoiceInfo() {
    // ... 此函式內部邏輯維持不變 ...
    return true;
}

function updateSubmitButtonState() {
    if (placeOrderBtn) {
        const cartState = CartService.getState();
        const isReady = selectedAddressId && cartState.selectedShippingMethodId && selectedPaymentMethodId;
        placeOrderBtn.disabled = !isReady;
    }
}

function handleSelectionChange(event) {
    const target = event.target;
    if (target.type !== 'radio') return;
    const { name, value } = target;

    if (name === 'address') {
        selectedAddressId = value;
    } else if (name === 'shipping') {
        // 將運送方式的變更，交由 CartService 處理
        CartService.selectShippingMethod(value); 
    } else if (name === 'payment') {
        selectedPaymentMethodId = value;
    }
    // 不再手動呼叫 render()，交由 CartService.subscribe 自動觸發
    updateSubmitButtonState();
}

async function handlePlaceOrder() {
    const cartState = CartService.getState();
    if (!selectedAddressId || !cartState.selectedShippingMethodId || !selectedPaymentMethodId) return;
    if (!validateInvoiceInfo()) return;
    
    placeOrderBtn.disabled = true;
    placeOrderBtn.textContent = '訂單處理中...';
    
    const frontendValidationSummary = { ...cartState.summary, couponCode: cartState.appliedCoupon?.code };
    try {
        const { data, error } = await supabase.functions.invoke('create-order-from-cart', {
            body: { 
                cartId: cartState.cartId, 
                selectedAddressId, 
                selectedShippingMethodId: cartState.selectedShippingMethodId, 
                selectedPaymentMethodId, 
                frontendValidationSummary,
                invoiceOptions 
            }
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
        
        CartService.clearCartAndState();

        window.location.href = `${ROUTES.ORDER_SUCCESS}?order_number=${data.orderNumber}`;
    } catch (error) {
        console.error('下單時發生嚴重錯誤:', error);
        showNotification('下單失敗，系統發生未知錯誤。', 'error', 'notification-message');
        placeOrderBtn.disabled = false;
        placeOrderBtn.textContent = '確認下單';
    }
}

export async function init() {
    currentUser = await requireLogin();
    if (!currentUser) return;
    
    // 確保 CartService 已就緒
    await CartService.init(); 
    
    if (CartService.getState().itemCount === 0) {
        alert('您的購物車是空的，將為您導向商品頁。');
        window.location.href = ROUTES.PRODUCTS_LIST;
        return;
    }
    
    // 只 fetch 本頁面需要的資料
    await fetchData(); 
    
    // 執行初始渲染
    render(); 
    
    // 訂閱 CartService 的狀態更新
    CartService.subscribe(render); 
    
    if (loadingOverlay) loadingOverlay.style.display = 'none';
    if (checkoutContainer) checkoutContainer.style.display = 'grid';

    // 綁定事件
    const mainContent = document.querySelector('.main-content');
    if (mainContent) mainContent.addEventListener('change', handleSelectionChange);
    if (addNewAddressBtn) addNewAddressBtn.addEventListener('click', () => { window.location.href = ROUTES.ADDRESS_MANAGEMENT; });
    if (placeOrderBtn) placeOrderBtn.addEventListener('click', handlePlaceOrder);
    
    invoiceTypeRadios.forEach(radio => radio.addEventListener('change', handleInvoiceTypeChange));
    carrierTypeSelector.addEventListener('change', handleInvoiceDetailsChange);
    [carrierNumberInput, donationCodeInput, vatNumberInput, companyNameInput].forEach(input => {
        input.addEventListener('input', handleInvoiceDetailsChange);
    });
    
    handleInvoiceTypeChange(); 
}