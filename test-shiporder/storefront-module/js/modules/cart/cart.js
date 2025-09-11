// 檔案路徑: storefront-module/js/modules/cart/cart.js
/**
 * 檔案名稱：cart.js
 * 檔案職責：處理購物車頁面的 UI 渲染與使用者互動，並整合「樂觀更新」與中央狀態管理。
 * 版本：36.0 (架構重構與樂觀更新版)
 * SOP 條款對應：
 * - [附加價值提案] 購物車的「樂觀更新」體驗
 * - [附加價值提案] 購物車 CTA 優化
 * AI 註記：
 * - [核心架構重構]:
 *   - 此版本已完全與新的「星型架構」對齊。它不再直接依賴 `cartService`，
 *     而是從唯一的、權威的 `cartStore` 導入並訂閱狀態。
 *   - 所有觸發後端 API 的操作，都被委派給了新的 `cartService`。
 * - [UX 昇華 - 樂觀更新]:
 *   - `handleCartInteractions` 函式現在採用了「樂觀更新」模式。當使用者點擊 +/- 按鈕時，
 *     UI 會立即更新，然後才在背景發送 API 請求。如果請求失敗，UI 會被自動回滾。
 * - [UX 昇華 - CTA 優化]:
 *   - `render` 函式新增了對 `#checkout-hint` 元素的處理，當結帳按鈕被禁用時，
 *     會清晰地告知使用者原因。
 * - [操作指示]: 請完整覆蓋原檔案。
 */

import { cartStore } from '../../stores/cartStore.js';
import { cartService } from '../../services/cartService.js';
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
// [v36.0] 新增 CTA 提示元素的獲取
const checkoutHintEl = document.getElementById('checkout-hint');

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
        
        // [v36.0 核心昇華] 樂觀更新 UI
        const originalState = cartStore.get();
        const optimisticState = JSON.parse(JSON.stringify(originalState)); // 深拷貝
        const itemToUpdate = optimisticState.items.find(i => i.id === itemId);
        if (itemToUpdate) {
            itemToUpdate.quantity = newQuantity;
            // 重新計算摘要 (簡易版，正式版應更精確)
            optimisticState.summary.subtotal += (newQuantity - originalState.items.find(i=>i.id===itemId).quantity) * (itemToUpdate.product_variants.sale_price || itemToUpdate.product_variants.price);
            optimisticState.summary.total = optimisticState.summary.subtotal - optimisticState.summary.couponDiscount + optimisticState.summary.shippingFee;
            render(optimisticState); // 立即用樂觀狀態渲染 UI
        }

        try {
            await cartService.updateItemQuantity(itemId, newQuantity);
        } catch (error) {
            console.warn(`[cart.js] 樂觀更新失敗，回滾 UI:`, error);
            // [v36.0] 如果後端驗證失敗，則用原始狀態重新渲染，實現 UI 回滾
            render(originalState); 
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
            cartService.removeItem(itemId);
        }
    } else if (target.id === 'apply-coupon-btn') {
        if (couponInputElement) {
            const couponCode = couponInputElement.value.trim().toUpperCase();
            cartService.applyCoupon(couponCode || null);
        }
    }
}

function handleShippingChange(event) {
    if (event.target.id === 'shipping-method-select') {
        const selectedId = event.target.value;
        cartService.selectShippingMethod(selectedId);
    }
}

export async function init() {
    const style = document.createElement('style');
    style.textContent = `
        .item-error-flash {
            transition: box-shadow 0.3s ease-in-out;
            box-shadow: 0 0 0 2px rgba(217, 83, 79, 0.7);
        }
        .continue-shopping-btn, .empty-cart-message { margin-top: 1rem; }
    `;
    document.head.appendChild(style);
    
    // [v36.0 核心架構] 不再呼叫 CartService.init()，改為訂閱 cartStore
    cartStore.subscribe(render);
    
    document.querySelector('.cart-items-section')?.addEventListener('click', handleCartInteractions);
    document.querySelector('.cart-summary')?.addEventListener('click', handleCartInteractions);
    document.querySelector('.cart-summary')?.addEventListener('change', handleShippingChange);
}