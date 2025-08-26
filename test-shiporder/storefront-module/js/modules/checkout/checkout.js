// ==============================================================================
// 檔案路徑: storefront-module/js/modules/checkout/checkout.js
// 版本: v44.0 - 「滴水不漏」參數修正
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Unified Context-Aware Checkout Module (統一情境感知結帳模組)
 * @description 最終版結帳流程。為匿名訪客提供極致簡化的交易體驗，
 *              為已登入會員提供地址選擇的便利，並為所有訪客提供社交登入選項。
 * @version v44.0
 * 
 * @update v44.0 - [PARAMETER PASSING FIX & LOCALIZATION]
 * 1. [核心修正] 徹底解決了因優惠券代碼 (couponCode) 未在呼叫鏈中完整傳遞
 *          而導致的 409 Conflict 錯誤。
 * 2. [原理] handlePlaceOrder 函式現在會將 couponCode 作為一個頂層屬性明確地
 *          加入到發送給 create-order-from-cart 的 payload 中，確保後端在進行
 *          最終權威比對時，能使用與前端完全一致的參數進行計算。
 * 3. [本地化] 檔案內所有註解及 UI 字串（如「請選擇鄉鎮市區」）均已修正為正體中文。
 * 4. [保留] 完整保留了 v42.3 的「三態感知」UI 修正，能正確區分會員與匿名使用者。
 */

import { supabase } from '../../core/supabaseClient.js';
import { CartService } from '../../services/CartService.js';
import { TABLE_NAMES, ROUTES } from '../../core/constants.js';
import { formatPrice, showNotification } from '../../core/utils.js';
import { taiwanZipcodes } from '../../core/taiwan_zipcodes.js';

// --- 狀態管理 ---
let currentSession = null;
let paymentMethods = [];
let selectedPaymentMethodId = null;
let shippingDetails = {};
let invoiceOptions = {
    type: 'cloud', carrier_type: '', carrier_number: null,
    donation_code: '', vat_number: '', company_name: ''
};
let userAddresses = [];

// --- DOM 元素獲取 ---
const loadingOverlay = document.getElementById('loading-overlay');
const checkoutContainer = document.querySelector('.checkout-container');
const checkoutForm = document.getElementById('checkout-form');
const userWelcomeMessageEl = document.getElementById('user-welcome-message');
const emailInput = document.getElementById('email');
const shippingListContainer = document.getElementById('shipping-list-container');
const paymentListContainer = document.getElementById('payment-list-container');
const summaryItemListEl = document.getElementById('summary-item-list');
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
const recipientNameInput = document.getElementById('recipient_name');
const phoneNumberInput = document.getElementById('phone_number');
const streetAddressInput = document.getElementById('street_address');
const addressSelectorContainer = document.getElementById('address-selector-container');
const socialLoginSection = document.getElementById('social-login-section');
const btnLoginGoogle = document.getElementById('btn-login-google');
const btnLoginLine = document.getElementById('btn-login-line');


// --- 地址預填與選擇邏輯 ---
function populateAddressForm(address) {
    if (!address) return;
    if (recipientNameInput) recipientNameInput.value = address.recipient_name || '';
    if (phoneNumberInput) phoneNumberInput.value = address.phone_number || '';
    if (streetAddressInput) streetAddressInput.value = address.street_address || '';
    shippingDetails.recipient_name = address.recipient_name || '';
    shippingDetails.phone_number = address.phone_number || '';
    shippingDetails.street_address = address.street_address || '';
    shippingDetails.city = address.city || '';
    shippingDetails.district = address.district || '';
    shippingDetails.postal_code = address.postal_code || '';
    shippingDetails.email = emailInput.value;
    if (citySelector && address.city) {
        citySelector.value = address.city;
        citySelector.dispatchEvent(new Event('change'));
    }
    setTimeout(() => {
        if (districtSelector && address.district) {
            districtSelector.value = address.district;
            districtSelector.dispatchEvent(new Event('change'));
        }
        updateSubmitButtonState();
    }, 150);
}

async function fetchAndHandleAddresses(userId) {
    try {
        const client = await supabase;
        const { data: addresses, error } = await client
            .from(TABLE_NAMES.ADDRESSES)
            .select('*')
            .eq('user_id', userId)
            .order('is_default', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false });
        if (error) throw error;
        userAddresses = addresses || [];
        if (addressSelectorContainer) {
            addressSelectorContainer.innerHTML = '';
            if (userAddresses.length > 0) {
                const selectorLabel = document.createElement('label');
                selectorLabel.htmlFor = 'address-selector';
                selectorLabel.textContent = '選擇已儲存的收件地址';
                const selector = document.createElement('select');
                selector.id = 'address-selector';
                selector.innerHTML = '<option value="-1">--- 或填寫新地址 ---</option>' + userAddresses.map((addr, index) =>
                    `<option value="${index}">${addr.alias || `${addr.city}${addr.district}${addr.street_address.substring(0, 10)}...`}</option>`
                ).join('');
                selector.addEventListener('change', (e) => {
                    const selectedIndex = e.target.value;
                    if (selectedIndex >= 0) {
                        const selectedAddress = userAddresses[selectedIndex];
                        populateAddressForm(selectedAddress);
                    } else {
                        if (checkoutForm) checkoutForm.reset();
                        populateAddressForm({ email: emailInput.value });
                    }
                });
                addressSelectorContainer.appendChild(selectorLabel);
                addressSelectorContainer.appendChild(selector);
                addressSelectorContainer.classList.remove('hidden');
            } else {
                addressSelectorContainer.classList.add('hidden');
            }
        }
        if (userAddresses.length > 0) {
            populateAddressForm(userAddresses[0]);
        }
    } catch (error) {
        console.error('獲取並處理使用者地址失敗:', error);
        showNotification('載入您的地址時發生錯誤，請手動填寫。', 'error');
    }
}

async function updateUIMode(session) {
    const isRealMember = session && session.user && !session.user.is_anonymous;

    if (isRealMember) {
        const userEmail = session.user.email;
        if (userWelcomeMessageEl) {
            userWelcomeMessageEl.textContent = `歡迎回來！您將以 ${userEmail} 的身份完成訂單。`;
            userWelcomeMessageEl.classList.remove('hidden');
        }
        if (emailInput) {
            emailInput.value = userEmail;
            emailInput.readOnly = true;
            shippingDetails.email = userEmail;
        }
        if (socialLoginSection) {
            socialLoginSection.classList.add('hidden');
        }
        await fetchAndHandleAddresses(session.user.id);
    } else {
        if (userWelcomeMessageEl) userWelcomeMessageEl.classList.add('hidden');
        if (emailInput) {
            emailInput.value = '';
            emailInput.readOnly = false;
        }
        if (addressSelectorContainer) addressSelectorContainer.classList.add('hidden');
        if (socialLoginSection) {
            socialLoginSection.classList.remove('hidden');
        }
    }
}


async function socialSignIn(provider) {
    try {
        const client = await supabase;
        const { error } = await client.auth.signInWithOAuth({
            provider: provider,
            options: {
                redirectTo: window.location.href
            }
        });
        if (error) {
            showNotification(`透過 ${provider} 登入時發生錯誤: ${error.message}`, 'error', 'notification-message');
        }
    } catch (err) {
        console.error('社交登入時發生未知錯誤:', err);
        showNotification('登入程序啟動失敗，請稍後再試。', 'error', 'notification-message');
    }
}

function initCitySelector() {
    if (!citySelector) return;
    const cities = Object.keys(taiwanZipcodes);
    cities.forEach((city) => citySelector.add(new Option(city, city)));
}

function updateDistrictSelector() {
    const selectedCity = citySelector.value;
    // [v44.0 本地化] 修正簡體中文
    districtSelector.innerHTML = '<option value="">請選擇鄉鎮市區</option>';
    postalCodeDisplay.textContent = '---';
    postalCodeInput.value = '';
    handleFormChange({ target: { name: 'city', value: selectedCity } });
    if (selectedCity && taiwanZipcodes[selectedCity]) {
        const districts = Object.keys(taiwanZipcodes[selectedCity]);
        districts.forEach((district) => districtSelector.add(new Option(district, district)));
    }
}

function updatePostalCode() {
    const selectedCity = citySelector.value;
    const selectedDistrict = districtSelector.value;
    if (selectedCity && selectedDistrict && taiwanZipcodes[selectedCity]?.[selectedDistrict]) {
        const zipcode = taiwanZipcodes[selectedCity][selectedDistrict];
        postalCodeDisplay.textContent = zipcode;
        postalCodeInput.value = zipcode;
        handleFormChange({ target: { name: 'postal_code', value: zipcode } });
    } else {
        postalCodeDisplay.textContent = '---';
        postalCodeInput.value = '';
    }
}

async function fetchCommonData() {
    try {
        const client = await supabase;
        const { data, error } = await client
            .from(TABLE_NAMES.PAYMENT_METHODS)
            .select('*')
            .eq('is_active', true)
            .order('sort_order', { ascending: true });
        if (error) throw error;
        paymentMethods = data || [];
    } catch (error) {
        console.error('獲取付款方式失敗:', error);
        showNotification('載入付款方式失敗，請重新整理。', 'error');
    }
}

function render() {
    const cartState = CartService.getState();
    const { summary, items, availableShippingMethods, selectedShippingMethodId } = cartState;
    if (summaryItemListEl) {
        if (items && items.length > 0) {
            summaryItemListEl.innerHTML = items.map((item) => {
                const productName = item.product_variants?.products?.name;
                const variantName = item.product_variants?.name || '';
                const displayName = productName && productName !== variantName ? `${productName} - ${variantName}` : variantName;
                return `<div class="summary-item"><span class="item-name">${displayName}</span><span class="item-qty">數量: ${item.quantity}</span><span class="item-total">${formatPrice(item.price_snapshot * item.quantity)}</span></div>`;
            }).join('');
        } else {
            summaryItemListEl.innerHTML = '<p>購物車無商品</p>';
        }
    }
    if (shippingListContainer) {
        if (!cartState.isReadyForRender) {
            shippingListContainer.innerHTML = '<p>正在載入運送方式...</p>';
        } else if (availableShippingMethods && availableShippingMethods.length > 0) {
            shippingListContainer.innerHTML = availableShippingMethods.map((method) => {
                const isSelected = method.id === selectedShippingMethodId;
                return `<div class="option-item ${isSelected ? 'selected' : ''}"><label><input type="radio" name="shipping" value="${method.id}" ${isSelected ? 'checked' : ''}><span>${method.method_name} - ${formatPrice(method.rate)}</span></label></div>`;
            }).join('');
        } else {
            shippingListContainer.innerHTML = '<p>目前無可用運送方式。</p>';
        }
    }
    if (paymentListContainer) {
        if (paymentMethods && paymentMethods.length > 0) {
            paymentListContainer.innerHTML = paymentMethods.map((method) => {
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
    if (['recipient_name', 'phone_number', 'email', 'city', 'district', 'postal_code', 'street_address'].includes(name)) {
        if (name === 'email' && emailInput?.readOnly) return;
        shippingDetails[name] = value;
    }
    if (name === 'shipping') {
        selectedPaymentMethodId = null;
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
        invoiceDetailsForms.querySelectorAll('div[id^="form-"]').forEach((form) => form.classList.add('hidden'));
        const formToShow = document.getElementById(`form-${selectedType}`);
        if (formToShow) formToShow.classList.remove('hidden');
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
            // [v44.0 本地化] 修正簡體中文
            carrierNumberInput.placeholder = invoiceOptions.carrier_type === 'mobile' ? '請輸入 / 開頭，共 8 碼英數字' : '請輸入共 16 碼英數字';
        }
    } else {
        carrierNumberGroup?.classList.add('hidden');
    }
}

function validateInvoiceInfo() {
    switch (invoiceOptions.type) {
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

function validateCustomerInfo() {
    if (!shippingDetails.phone_number || !/^09\d{8}$/.test(shippingDetails.phone_number)) {
        showNotification('手機號碼格式不正確，應為 09 開頭的 10 位數字。', 'error', 'notification-message');
        return false;
    }
    return true;
}

function updateSubmitButtonState() {
    if (!placeOrderBtn) return;
    const cartState = CartService.getState();
    const addressReady = !!(recipientNameInput?.value && phoneNumberInput?.value && emailInput?.value && streetAddressInput?.value && citySelector?.value && districtSelector?.value && postalCodeInput?.value);
    const termsChecked = termsCheckbox ? !!termsCheckbox.checked : true;
    const isReady = addressReady && !!cartState.selectedShippingMethodId && !!selectedPaymentMethodId && termsChecked;
    placeOrderBtn.disabled = !isReady;
}

function _handleOrderError(err) {
    console.error('下單時發生嚴重錯誤:', err);
    
    let userMessage = '下單失敗，系統發生未知錯誤。';
    const errString = err.message || '';

    if (errString.includes('Failed to fetch') || errString.includes('network')) {
        userMessage = '網路連線不穩定，請檢查您的網路後重試。';
    } else if (errString.includes('409') || errString.includes('PRICE_MISMATCH')) {
        userMessage = '商品價格或優惠已變更，購物車將自動更新，請您重新確認訂單。';
        setTimeout(() => CartService.recalculateCart(), 500);
    } else if (errString.includes('401') || errString.includes('token')) {
        userMessage = '您的登入狀態已過期，請重新登入後再試。';
    } else if (errString.includes('recalculate-cart')) {
        userMessage = '無法取得最新的金額資訊，請稍後再試或重新整理頁面。';
    } else if (err.error?.message) {
        userMessage = err.error.message;
    } else if (errString) {
        userMessage = errString;
    }

    showNotification(userMessage, 'error', 'notification-message');
    
    if (placeOrderBtn) {
        placeOrderBtn.disabled = false;
        placeOrderBtn.textContent = '確認下單';
    }
}

async function handlePlaceOrder() {
    if (!validateCustomerInfo() || !validateInvoiceInfo()) return;
    placeOrderBtn.disabled = true;
    placeOrderBtn.textContent = '訂單驗證中...';

    const cartState = CartService.getState();

    try {
        console.log('[Checkout] Performing final recalculation before placing order...');
        const client = await supabase;
        const { data: finalSnapshot, error: recalcError } = await client.functions.invoke('recalculate-cart', {
            body: { 
                cartId: cartState.cartId, 
                couponCode: cartState.appliedCoupon?.code, 
                shippingMethodId: cartState.selectedShippingMethodId 
            },
        });

        if (recalcError) throw recalcError;
        if (finalSnapshot.error) throw new Error(finalSnapshot.error);
        
        placeOrderBtn.textContent = '訂單處理中...';

        const frontendValidationSummary = finalSnapshot.summary;

        // [v44.0 核心修正] 確保 couponCode 被明確地、獨立地傳遞
        const payloadBody = {
            cartId: cartState.cartId,
            shippingDetails,
            selectedShippingMethodId: cartState.selectedShippingMethodId,
            selectedPaymentMethodId,
            frontendValidationSummary,
            invoiceOptions,
            // 將優惠券代碼作為頂層屬性傳遞
            couponCode: cartState.appliedCoupon?.code || null
        };

        const invokeOptions = {};
        if (currentSession) {
            invokeOptions.headers = { Authorization: `Bearer ${currentSession.access_token}` };
        }

        const { data, error } = await client.functions.invoke('create-order-from-cart', {
            body: payloadBody,
            ...invokeOptions
        });
        
        if (error) throw error;
        if (data?.error) throw data;

        if (data?.success && data.orderDetails) {
            sessionStorage.setItem('latestOrderDetails', JSON.stringify(data.orderDetails));
        }

        CartService.clearCartAndState();
        window.location.href = `${ROUTES.ORDER_SUCCESS}?order_number=${data.orderNumber}`;

    } catch (err) {
        _handleOrderError(err);
    }
}

export async function init() {
    const client = await supabase;
    const { data: { session } } = await client.auth.getSession();
    currentSession = session;
    await CartService.init(); 
    if (CartService.getState().itemCount === 0) {
        alert('您的購物車是空的，將為您導向商品頁。');
        window.location.href = ROUTES.PRODUCTS_LIST;
        return;
    }
    initCitySelector();
    await updateUIMode(currentSession);
    await fetchCommonData();
    CartService.subscribe(render);
    render();
    if (loadingOverlay) loadingOverlay.style.display = 'none';
    if (checkoutContainer) checkoutContainer.style.display = 'grid';
    if (checkoutForm) checkoutForm.addEventListener('input', handleFormChange);
    if (placeOrderBtn) placeOrderBtn.addEventListener('click', handlePlaceOrder);
    if (citySelector) citySelector.addEventListener('change', updateDistrictSelector);
    if (districtSelector) districtSelector.addEventListener('change', updatePostalCode);
    if (btnLoginGoogle) btnLoginGoogle.addEventListener('click', () => socialSignIn('google'));
    if (btnLoginLine) btnLoginLine.addEventListener('click', () => socialSignIn('line'));
    invoiceTypeRadios.forEach((radio) => radio.addEventListener('change', handleInvoiceTypeChange));
    if (carrierTypeSelector) carrierTypeSelector.addEventListener('change', handleInvoiceDetailsChange);
    [carrierNumberInput, donationCodeInput, vatNumberInput, companyNameInput].forEach((input) => {
        if (input) input.addEventListener('input', handleInvoiceDetailsChange);
    });
    handleInvoiceTypeChange();
}