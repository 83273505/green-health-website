// ==============================================================================
// 檔案路徑: storefront-module/js/modules/checkout/checkout.js
// 版本: v33.0 - 統一流程與體驗終局
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Unified Checkout Module (統一結帳模組)
 * @description 處理所有使用者的結帳流程，並實現「結帳即註冊」功能。
 */

import { supabase } from '../../core/supabaseClient.js';
import { CartService } from '../../services/CartService.js';
import { TABLE_NAMES, ROUTES } from '../../core/constants.js';
import { formatPrice, showNotification } from '../../core/utils.js';
import { taiwanZipcodes } from '../../core/taiwan_zipcodes.js';

// --- 狀態管理 ---
let paymentMethods = [];
let selectedPaymentMethodId = null;
let customerInfo = {};
let shippingDetails = {};
let invoiceOptions = {
    type: 'cloud',
    carrier_type: '',
    carrier_number: null,
    donation_code: '',
    vat_number: '',
    company_name: ''
};

// --- DOM 元素獲取 ---
const loadingOverlay = document.getElementById('loading-overlay');
const checkoutContainer = document.querySelector('.checkout-container');
const checkoutForm = document.getElementById('checkout-form');
const shippingListContainer = document.getElementById('shipping-list-container');
const paymentListContainer = document.getElementById('payment-list-container');
const summarySubtotalEl = document.getElementById('summary-subtotal');
const summaryCouponEl = document.getElementById('summary-coupon-discount');
const summaryShippingEl = document.getElementById('summary-shipping-fee');
const summaryTotalEl = document.getElementById('summary-total-price');
const placeOrderBtn = document.getElementById('place-order-btn');
const invoiceTypeRadios = document.querySelectorAll('input[name="invoiceType"]');
const invoiceDetailsForms = document.getElementById('invoice-details-forms');
const carrierTypeSelector = document.getElementById('carrier-type');
const carrierNumberGroup = document.getElementById('carrier-number-group');
const carrierNumberInput = document.getElementById('carrier-number');
const donationCodeInput = document.getElementById('donation-code');
const vatNumberInput = document.getElementById('vat-number');
const companyNameInput = document.getElementById('company-name');
const termsCheckbox = document.getElementById('terms-consent-checkout');
const citySelector = document.getElementById('city-selector');
const districtSelector = document.getElementById('district-selector');
const postalCodeDisplay = document.getElementById('postal-code-display');
const postalCodeInput = document.getElementById('postal-code-input');

function initCitySelector() {
    if (!citySelector) return;
    const cities = Object.keys(taiwanZipcodes);
    cities.forEach(city => {
        const option = new Option(city, city);
        citySelector.add(option);
    });
}
function updateDistrictSelector() {
    const selectedCity = citySelector.value;
    districtSelector.innerHTML = '<option value="">請選擇鄉鎮市區</option>';
    postalCodeDisplay.textContent = '---';
    postalCodeInput.value = '';
    handleFormChange({ target: { name: 'city', value: selectedCity } });
    if (selectedCity && taiwanZipcodes[selectedCity]) {
        const districts = Object.keys(taiwanZipcodes[selectedCity]);
        districts.forEach(district => {
            const option = new Option(district, district);
            districtSelector.add(option);
        });
    }
}
function updatePostalCode() {
    const selectedCity = citySelector.value;
    const selectedDistrict = districtSelector.value;
    if (selectedCity && selectedDistrict && taiwanZipcodes[selectedCity]?.[selectedDistrict]) {
        const zipcode = taiwanZipcodes[selectedCity][selectedDistrict];
        postalCodeDisplay.textContent = zipcode;
        postalCodeInput.value = zipcode;
        handleFormChange({ target: { name: 'district', value: selectedDistrict } });
        handleFormChange({ target: { name: 'postal_code', value: zipcode } });
    } else {
        postalCodeDisplay.textContent = '---';
        postalCodeInput.value = '';
    }
}

async function fetchCommonData() {
    try {
        const client = await supabase;
        const { data, error } = await client.from(TABLE_NAMES.PAYMENT_METHODS).select('*').eq('is_active', true).order('sort_order', { ascending: true });
        if (error) throw error;
        paymentMethods = data || [];
    } catch (error) {
        console.error('獲取付款方式失敗:', error);
        showNotification('載入付款方式失敗，請重新整理。', 'error');
    }
}

function render() {
    const cartState = CartService.getState();
    const { summary, availableShippingMethods, selectedShippingMethodId } = cartState;

    if (shippingListContainer) {
        if (!cartState.isReadyForRender) {
             shippingListContainer.innerHTML = '<p>正在載入運送方式...</p>';
        } else if (availableShippingMethods && availableShippingMethods.length > 0) {
            shippingListContainer.innerHTML = availableShippingMethods.map(method => {
                const isSelected = method.id === selectedShippingMethodId;
                return `<div class="option-item ${isSelected ? 'selected' : ''}"><label><input type="radio" name="shipping" value="${method.id}" ${isSelected ? 'checked' : ''}><span>${method.method_name} - ${formatPrice(method.rate)}</span></label></div>`;
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

function handleFormChange(event) {
    const { name, value } = event.target;
    if (['email', 'password', 'recipient_name'].includes(name)) {
        customerInfo[name] = value;
    }
    if (['recipient_name', 'phone_number', 'email', 'city', 'district', 'postal_code', 'street_address'].includes(name)) {
        shippingDetails[name] = value;
    }
    if (name === 'shipping') {
        selectedShippingMethodId = value;
        CartService.selectShippingMethod(value);
    }
    if (name === 'payment') {
        selectedPaymentMethodId = value;
    }
    updateSubmitButtonState();
}

function handleInvoiceTypeChange() {
    const selectedRadio = document.querySelector('input[name="invoiceType"]:checked');
    if (!selectedRadio) return;
    const selectedType = selectedRadio.value;
    
    invoiceOptions.type = selectedType;
    if (invoiceDetailsForms) {
        invoiceDetailsForms.querySelectorAll('div[id^="form-"]').forEach(form => form.classList.add('hidden'));
        const formToShow = document.getElementById(`form-${selectedType}`);
        if (formToShow) {
            formToShow.classList.remove('hidden');
        }
    }
    handleInvoiceDetailsChange();
}

function handleInvoiceDetailsChange() {
    invoiceOptions.carrier_type = carrierTypeSelector?.value || '';
    invoiceOptions.carrier_number = carrierNumberInput?.value.trim() || null;
    invoiceOptions.donation_code = donationCodeInput?.value.trim() || '';
    invoiceOptions.vat_number = vatNumberInput?.value.trim() || '';
    invoiceOptions.company_name = companyNameInput?.value.trim() || '';

    if (invoiceOptions.type === 'cloud' && (invoiceOptions.carrier_type === 'mobile' || invoiceOptions.carrier_type === 'certificate')) {
        carrierNumberGroup?.classList.remove('hidden');
        if (carrierNumberInput) {
            carrierNumberInput.placeholder = invoiceOptions.carrier_type === 'mobile' ? '請輸入 / 開頭，共 8 碼英數字' : '請輸入共 16 碼英數字';
        }
    } else {
        carrierNumberGroup?.classList.add('hidden');
    }
}

function validateInvoiceInfo() {
    switch(invoiceOptions.type) {
        case 'business':
            if (!/^\d{8}$/.test(invoiceOptions.vat_number)) {
                showNotification('統一編號格式不正確，應為 8 位數字。', 'error', 'notification-message');
                return false;
            }
            if (!invoiceOptions.company_name) {
                showNotification('請輸入公司抬頭。', 'error', 'notification-message');
                return false;
            }
            break;
        case 'donation':
            if (!/^\d{3,7}$/.test(invoiceOptions.donation_code)) {
                showNotification('愛心碼格式不正確，應為 3-7 位數字。', 'error', 'notification-message');
                return false;
            }
            break;
        case 'cloud':
            if (invoiceOptions.carrier_type === 'mobile' && !/^\/[A-Z0-9+\-.]{7}$/.test(invoiceOptions.carrier_number)) {
                showNotification('手機條碼格式不正確，應為 / 開頭共 8 碼。', 'error', 'notification-message');
                return false;
            }
            if (invoiceOptions.carrier_type === 'certificate' && !/^[A-Z]{2}\d{14}$/.test(invoiceOptions.carrier_number)) {
                showNotification('自然人憑證格式不正確，應為 2 位英文開頭共 16 碼。', 'error', 'notification-message');
                return false;
            }
            break;
    }
    return true;
}

function updateSubmitButtonState() {
    if (placeOrderBtn) {
        const cartState = CartService.getState();
        const addressReady = !!(shippingDetails.recipient_name && shippingDetails.phone_number && shippingDetails.email && shippingDetails.street_address && shippingDetails.city && shippingDetails.district && shippingDetails.postal_code);
        const passwordReady = !!(customerInfo.password && customerInfo.password.length >= 6);
        const termsChecked = termsCheckbox?.checked;
        const isReady = addressReady && passwordReady && cartState.selectedShippingMethodId && selectedPaymentMethodId && termsChecked;
        placeOrderBtn.disabled = !isReady;
    }
}

async function handlePlaceOrder() {
    if (!validateInvoiceInfo()) return;
    
    placeOrderBtn.disabled = true;
    placeOrderBtn.textContent = '訂單處理中...';
    
    const cartState = CartService.getState();
    const frontendValidationSummary = { ...cartState.summary, couponCode: cartState.appliedCoupon?.code };
    
    try {
        const client = await supabase;
        const { data, error } = await client.functions.invoke('create-order-from-cart', {
            body: { 
                cartId: cartState.cartId, 
                customerInfo,
                shippingDetails,
                selectedShippingMethodId, 
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
    const client = await supabase;
    await CartService.init(client); 
    
    if (CartService.getState().itemCount === 0) {
        alert('您的購物車是空的，將為您導向商品頁。');
        window.location.href = ROUTES.PRODUCTS_LIST;
        return;
    }
    
    await fetchCommonData(); 
    
    CartService.subscribe(render); 
    render(); 
    
    if (loadingOverlay) loadingOverlay.style.display = 'none';
    if (checkoutContainer) checkoutContainer.style.display = 'grid';

    if (checkoutForm) checkoutForm.addEventListener('input', handleFormChange);
    if (placeOrderBtn) placeOrderBtn.addEventListener('click', handlePlaceOrder);
    if (citySelector) citySelector.addEventListener('change', updateDistrictSelector);
    if (districtSelector) districtSelector.addEventListener('change', updatePostalCode);
    
    invoiceTypeRadios.forEach(radio => radio.addEventListener('change', handleInvoiceTypeChange));
    if (carrierTypeSelector) carrierTypeSelector.addEventListener('change', handleInvoiceDetailsChange);
    [carrierNumberInput, donationCodeInput, vatNumberInput, companyNameInput].forEach(input => {
        if (input) {
            input.addEventListener('input', handleInvoiceDetailsChange);
        }
    });
    
    handleInvoiceTypeChange(); 
    initCitySelector();
}