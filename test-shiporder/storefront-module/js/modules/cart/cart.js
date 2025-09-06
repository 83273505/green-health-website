// 檔案路徑: storefront-module/js/modules/cart/cart.js
/**
 * 檔案名稱：cart.js
 * 檔案職責：處理獨立的、跨裝置的購物車頁面邏輯，並根據庫存狀態渲染 UI。
 * 版本：34.0
 * SOP 條款對應：
 * - [1.1] 操作同理心
 * AI 註記：
 * - 此版本為 `TASK-INV-004` 的一部分，旨在將庫存狀態可視化，提升使用者體驗。
 * 更新日誌 (Changelog)：
 * - v34.0 (2025-09-07)：[TASK-INV-004] 庫存狀態渲染
 *   - `render` 函式已增強，能夠讀取每個購物車項目的 `stockStatus` 屬性。
 *   - 當 `stockStatus` 為 `INSUFFICIENT` 時，會顯示「庫存不足」標籤，禁用數量控制器，並在視覺上灰化該項目。
 *   - 結帳按鈕的可用性現在也會考慮所有商品是否均有足夠庫存。
 * - v33.0 (2025-08-22)：初版建立，作為統一的購物車模組。
 */

import { supabase } from '../../core/supabaseClient.js';
import { CartService } from '../../services/CartService.js';
import { formatPrice, showNotification } from '../../core/utils.js';

const itemListElement = document.getElementById('cart-item-list');
const summarySubtotalEl = document.getElementById('summary-subtotal');
const summaryCouponEl = document.getElementById('summary-coupon-discount');
const summaryShippingEl = document.getElementById('summary-shipping-fee');
const summaryTotalEl = document.getElementById('summary-total-price');
const checkoutButton = document.getElementById('checkout-btn');
const couponInputElement = document.getElementById('coupon-code-input');
const applyCouponButton = document.getElementById('apply-coupon-btn');
const shippingSelectorContainer = document.getElementById('shipping-selector-container');
const shippingPromoBanner = document.getElementById('shipping-promo-banner');

function render(state) {
    if (!itemListElement) return;

    if (state.items.length === 0) {
        itemListElement.innerHTML = `
            <div class="empty-cart-container">
                <p class="empty-cart-message">您的購物車是空的。</p>
                <a href="/storefront-module/products.html" class="continue-shopping-btn">繼續購物</a>
            </div>
        `;
    } else {
        itemListElement.innerHTML = state.items.map(item => {
            const variant = item.product_variants;
            const product = variant?.products;
            const imageUrl = product?.image_url || 'https://placehold.co/80x80/eeeeee/cccccc?text=無圖片';
            const variantName = variant?.name || '未知規格';
            const itemTotal = item.quantity * (variant?.sale_price ?? variant?.price ?? 0);
            
            // [TASK-INV-004] 根據 stockStatus 決定 UI 狀態
            const isInsufficient = item.stockStatus === 'INSUFFICIENT';
            const itemClasses = `cart-item ${isInsufficient ? 'insufficient-stock' : ''}`;
            const controlsDisabled = isInsufficient ? 'disabled' : '';
            
            let unitPriceHtml = '';
            const originalPrice = variant?.price;
            const displayPrice = variant?.sale_price ?? variant?.price;
            if (variant?.sale_price && variant.sale_price < originalPrice) {
                unitPriceHtml = `<p class="item-unit-price">${formatPrice(displayPrice)} / 件 (<s>${formatPrice(originalPrice)}</s>)</p>`;
            } else {
                unitPriceHtml = `<p class="item-unit-price">${formatPrice(displayPrice)} / 件</p>`;
            }
            
            const stockStatusLabel = isInsufficient ? '<span class="stock-status-label">庫存不足</span>' : '';
            const isMinusDisabled = item.quantity <= 1;

            return `
                <div class="${itemClasses}" data-item-id="${item.id}">
                    <img src="${imageUrl}" alt="${variantName}" class="item-image">
                    <div class="item-details">
                        <p class="item-name">${variantName} ${stockStatusLabel}</p>
                        ${unitPriceHtml}
                        <div class="item-quantity-controls">
                            <button class="quantity-btn minus" data-item-id="${item.id}" data-quantity="${item.quantity - 1}" ${isMinusDisabled || controlsDisabled ? 'disabled' : ''}>-</button>
                            <span class="quantity-display">${item.quantity}</span>
                            <button class="quantity-btn plus" data-item-id="${item.id}" data-quantity="${item.quantity + 1}" ${controlsDisabled}>+</button>
                        </div>
                    </div>
                    <div class="item-price-section">
                        <p class="item-price">${formatPrice(itemTotal)}</p>
                        <button class="remove-item-btn" data-item-id="${item.id}">移除</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    const { summary, appliedCoupon, shippingInfo, availableShippingMethods, selectedShippingMethodId, items } = state;
    if (summarySubtotalEl) summarySubtotalEl.textContent = formatPrice(summary.subtotal);
    if (summaryCouponEl) {
        summaryCouponEl.textContent = `- ${formatPrice(summary.couponDiscount)}`;
        summaryCouponEl.parentElement.style.display = summary.couponDiscount > 0 ? 'flex' : 'none';
    }
    if (summaryShippingEl) summaryShippingEl.textContent = formatPrice(summary.shippingFee);
    if (summaryTotalEl) summaryTotalEl.textContent = formatPrice(summary.total);
    
    if (appliedCoupon) {
        if (couponInputElement) { couponInputElement.value = appliedCoupon.code; couponInputElement.disabled = true; }
        if (applyCouponButton) { applyCouponButton.textContent = '已套用'; applyCouponButton.disabled = true; }
    } else {
        if (couponInputElement) { couponInputElement.value = ''; couponInputElement.disabled = false; }
        if (applyCouponButton) { applyCouponButton.textContent = '套用'; applyCouponButton.disabled = false; }
    }
    
    if (shippingSelectorContainer) {
        if (!state.isReadyForRender) {
            shippingSelectorContainer.innerHTML = `<select disabled><option>正在載入...</option></select>`;
        } else if (availableShippingMethods && availableShippingMethods.length > 0) {
            let optionsHtml = availableShippingMethods.map(method => `<option value="${method.id}">${method.method_name} - ${formatPrice(method.rate)}</option>`).join('');
            shippingSelectorContainer.innerHTML = `<select id="shipping-method-select"><option value="">請選擇...</option>${optionsHtml}</select>`;
            const selectElement = document.getElementById('shipping-method-select');
            if (selectElement) selectElement.value = selectedShippingMethodId || "";
        } else {
            shippingSelectorContainer.innerHTML = `<select disabled><option>無可用運送方式</option></select>`;
        }
    }

    if (checkoutButton) {
        // [TASK-INV-004] 結帳按鈕的可用性現在也檢查庫存狀態
        const hasInsufficientItems = items.some(item => item.stockStatus === 'INSUFFICIENT');
        const isReadyForCheckout = state.items.length > 0 && selectedShippingMethodId && !hasInsufficientItems;
        checkoutButton.classList.toggle('disabled', !isReadyForCheckout);
        if (hasInsufficientItems) {
            checkoutButton.title = "您的購物車中部分商品庫存不足，請先調整後再結帳。";
        } else {
            checkoutButton.title = "";
        }
    }

    if (shippingPromoBanner) {
        if (shippingInfo && shippingInfo.amountNeededForFreeShipping > 0) {
            shippingPromoBanner.innerHTML = `<p>還差 <strong>${formatPrice(shippingInfo.amountNeededForFreeShipping)}</strong> 即可享有免運優惠！</p>`;
            shippingPromoBanner.style.display = 'block';
        } else {
            shippingPromoBanner.innerHTML = '';
            shippingPromoBanner.style.display = 'none';
        }
    }
}

function handleCartInteractions(event) {
    const target = event.target;
    if (target.matches('.quantity-btn')) {
        const itemId = target.dataset.itemId;
        const newQuantity = parseInt(target.dataset.quantity, 10);
        if (itemId) CartService.updateItemQuantity(itemId, newQuantity);
    } else if (target.matches('.remove-item-btn')) {
        const itemId = target.dataset.itemId;
        if (itemId && confirm('您確定要從購物車中移除這個商品嗎？')) {
            CartService.removeItem(itemId);
        }
    } else if (target.id === 'apply-coupon-btn') {
        if (couponInputElement) {
            const couponCode = couponInputElement.value.trim().toUpperCase();
            CartService.applyCoupon(couponCode || null);
        }
    }
}

function handleShippingChange(event) {
    if (event.target.id === 'shipping-method-select') {
        const selectedId = event.target.value;
        CartService.selectShippingMethod(selectedId);
    }
}

export async function init() {
    const client = await supabase;
    await CartService.init(client); 
    
    CartService.subscribe(render);
    render(CartService.getState());

    document.querySelector('.cart-items-section')?.addEventListener('click', handleCartInteractions);
    document.querySelector('.cart-summary')?.addEventListener('click', handleCartInteractions);
    document.querySelector('.cart-summary')?.addEventListener('change', handleShippingChange);
}