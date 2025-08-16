// ==============================================================================
// 檔案路徑: storefront-module/js/modules/cart/cart.js
// 版本: v33.0 - 統一流程與體驗終局
// ------------------------------------------------------------------------------
// 【此為新檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Unified Cart Module (統一購物車模組)
 * @description 處理獨立的、跨裝置的購物車頁面邏輯。
 */

import { supabase } from '../../core/supabaseClient.js';
import { CartService } from '../../services/CartService.js';
import { formatPrice, showNotification } from '../../core/utils.js';

// --- DOM 元素獲取 ---
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
            let unitPriceHtml = '';
            const originalPrice = variant?.price;
            const displayPrice = variant?.sale_price ?? variant?.price;
            if (variant?.sale_price && variant.sale_price < originalPrice) {
                unitPriceHtml = `<p class="item-unit-price">${formatPrice(displayPrice)} / 件 (<s>${formatPrice(originalPrice)}</s>)</p>`;
            } else {
                unitPriceHtml = `<p class="item-unit-price">${formatPrice(displayPrice)} / 件</p>`;
            }
            const isMinusDisabled = item.quantity <= 1;
            return `
                <div class="cart-item" data-item-id="${item.id}">
                    <img src="${imageUrl}" alt="${variantName}" class="item-image">
                    <div class="item-details">
                        <p class="item-name">${variantName}</p>
                        ${unitPriceHtml}
                        <div class="item-quantity-controls">
                            <button class="quantity-btn minus" data-item-id="${item.id}" data-quantity="${item.quantity - 1}" ${isMinusDisabled ? 'disabled' : ''}>-</button>
                            <span class="quantity-display">${item.quantity}</span>
                            <button class="quantity-btn plus" data-item-id="${item.id}" data-quantity="${item.quantity + 1}">+</button>
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

    const { summary, appliedCoupon, shippingInfo, availableShippingMethods, selectedShippingMethodId } = state;
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
        const isReadyForCheckout = state.items.length > 0 && selectedShippingMethodId;
        checkoutButton.classList.toggle('disabled', !isReadyForCheckout);
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