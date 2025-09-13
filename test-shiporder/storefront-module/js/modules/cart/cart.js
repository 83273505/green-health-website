// 檔案路徑: storefront-module/js/modules/cart/cart.js
// ==============================================================================

/**
 * 檔案名稱：cart.js
 * 檔案職責：處理購物車頁面的 UI 渲染與使用者互動，並整合「樂觀更新」與中央狀態管理。
 * 版本：36.1 (命名同步修正版)
 * AI 註記：
 * - [核心修正]: 根據主席提供的錯誤日誌，此版本修正了對購物車服務的導入
 *   語句。原始碼中錯誤地使用了 `import { cartService }` (小寫 c)，
 *   但 `CartService.js` 檔案實際匯出的是 `CartService` (大寫 C)。
 *   現已將所有相關引用統一為正確的大寫 `CartService`，以解決 SyntaxError。
 * 更新日誌 (Changelog)：
 * - v36.1 (2025-09-13)：修正 `import` 語句的大小寫，以匹配全專案的命名慣例。
 */
import { cartStore } from '../../stores/cartStore.js';
// 【核心修正】將 `cartService` 修正為 `CartService`
import { CartService } from '../../services/CartService.js';
import { formatPrice } from '../../core/utils.js';

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
const checkoutHintEl = document.getElementById('checkout-hint');

function render(state) {
    if (!itemListElement) return;
    if (state.items.length === 0) {
        itemListElement.innerHTML = `<div class="empty-cart-container"><p class="empty-cart-message">您的購物車是空的。</p><a href="/storefront-module/products.html" class="continue-shopping-btn">繼續購物</a></div>`;
    } else {
        itemListElement.innerHTML = state.items.map(item => {
            const variant = item.product_variants;
            const product = variant?.products;
            const imageUrl = product?.image_url || 'https://placehold.co/80x80/eeeeee/cccccc?text=無圖片';
            const variantName = variant?.name || '未知規格';
            const itemTotal = item.quantity * (variant?.sale_price ?? variant?.price ?? 0);
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
            return `<div class="${itemClasses}" data-item-id="${item.id}"><img src="${imageUrl}" alt="${variantName}" class="item-image"><div class="item-details"><p class="item-name">${variantName} ${stockStatusLabel}</p>${unitPriceHtml}<div class="item-quantity-controls"><button class="quantity-btn minus" data-item-id="${item.id}" data-quantity="${item.quantity - 1}" ${isMinusDisabled || controlsDisabled ? 'disabled' : ''}>-</button><span class="quantity-display">${item.quantity}</span><button class="quantity-btn plus" data-item-id="${item.id}" data-quantity="${item.quantity + 1}" ${controlsDisabled}>+</button></div></div><div class="item-price-section"><p class="item-price">${formatPrice(itemTotal)}</p><button class="remove-item-btn" data-item-id="${item.id}">移除</button></div></div>`;
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
        const hasInsufficientItems = items.some(item => item.stockStatus === 'INSUFFICIENT');
        const isReadyForCheckout = state.items.length > 0 && !!selectedShippingMethodId && !hasInsufficientItems;
        checkoutButton.classList.toggle('disabled', !isReadyForCheckout);
        if (checkoutHintEl) {
            if (!isReadyForCheckout && state.items.length > 0) {
                checkoutHintEl.textContent = hasInsufficientItems ? "請先調整庫存不足的商品。" : "請先選擇運送方式。";
                checkoutHintEl.classList.remove('hidden');
            } else {
                checkoutHintEl.classList.add('hidden');
            }
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

async function handleCartInteractions(event) {
    const target = event.target;
    if (target.matches('.quantity-btn')) {
        const itemId = target.dataset.itemId;
        const newQuantity = parseInt(target.dataset.quantity, 10);
        if (!itemId) return;
        const itemElement = target.closest('.cart-item');
        if(itemElement) itemElement.style.opacity = '0.7';
        try {
            // 【核心修正】將 `cartService` 修正為 `CartService`
            await CartService.updateItemQuantity(itemId, newQuantity);
        } catch (error) {
            console.warn(`[cart.js] 捕獲到庫存操作失敗信號:`, error);
            if(itemElement) {
                itemElement.classList.add('item-error-flash');
                setTimeout(() => itemElement.classList.remove('item-error-flash'), 600);
            }
        } finally {
            if(itemElement) itemElement.style.opacity = '1';
        }
    } else if (target.matches('.remove-item-btn')) {
        const itemId = target.dataset.itemId;
        if (itemId && confirm('您確定要從購物車中移除這個商品嗎？')) {
            // 【核心修正】將 `cartService` 修正為 `CartService`
            CartService.removeItem(itemId);
        }
    } else if (target.id === 'apply-coupon-btn') {
        if (couponInputElement) {
            const couponCode = couponInputElement.value.trim().toUpperCase();
            // 【核心修正】將 `cartService` 修正為 `CartService`
            CartService.applyCoupon(couponCode || null);
        }
    }
}

function handleShippingChange(event) {
    if (event.target.id === 'shipping-method-select') {
        const selectedId = event.target.value;
        // 【核心修正】將 `cartService` 修正為 `CartService`
        CartService.selectShippingMethod(selectedId);
    }
}

export async function init() {
    const style = document.createElement('style');
    style.textContent = `.item-error-flash { transition: box-shadow 0.3s ease-in-out; box-shadow: 0 0 0 2px rgba(217, 83, 79, 0.7); }`;
    document.head.appendChild(style);
    cartStore.subscribe(render);
    document.querySelector('.cart-items-section')?.addEventListener('click', handleCartInteractions);
    document.querySelector('.cart-summary')?.addEventListener('click', handleCartInteractions);
    document.querySelector('.cart-summary')?.addEventListener('change', handleShippingChange);
}