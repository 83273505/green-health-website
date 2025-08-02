// 檔案路徑: js/components/CartSidebar.js (Checkout Validation Final Version)

import { CartService } from '../services/CartService.js';
import { formatPrice } from '../core/utils.js';

// --- 模組內部變數 ---
let sidebarElement, overlayElement, itemListElement, subtotalElement, checkoutButton;
let couponInputElement, applyCouponButton, couponDiscountElement, shippingFeeElement, totalElement;
let shippingSelectorContainer;

/**
 * [私有函式] 根據從 CartService 獲取的最新狀態來重新渲染整個側邊欄的 UI
 * @param {object} state - 最新的購物車狀態
 */
function render(state) {
    if (!itemListElement) return;

    // --- 1. 渲染商品列表 ---
    if (state.items.length === 0) {
        itemListElement.innerHTML = `
            <div class="empty-cart-container">
                <svg class="empty-cart-icon" xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle>
                    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                </svg>
                <p class="empty-cart-message">您的購物車是空的。</p>
                <a href="./products.html" class="continue-shopping-btn">繼續購物</a>
            </div>
        `;
    } else {
        itemListElement.innerHTML = state.items.map(item => {
            const variant = item.product_variants;
            const product = variant?.products;
            const imageUrl = product?.image_url || 'https://placehold.co/80x80/eeeeee/cccccc?text=無圖片';
            const variantName = variant?.name || '未知規格';
            const itemTotal = item.quantity * item.price_snapshot;
            let unitPriceHtml = '';
            const originalPrice = variant?.price;
            const unitPriceSnapshot = item.price_snapshot;
            if (unitPriceSnapshot < originalPrice) {
                unitPriceHtml = `<p class="item-unit-price">${formatPrice(unitPriceSnapshot)} / 件 (<s>${formatPrice(originalPrice)}</s>)</p>`;
            } else {
                unitPriceHtml = `<p class="item-unit-price">${formatPrice(unitPriceSnapshot)} / 件</p>`;
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

    // --- 2. 渲染費用明細 ---
    const { summary, appliedCoupon } = state;
    if (subtotalElement) subtotalElement.textContent = formatPrice(summary.subtotal);
    if (couponDiscountElement) couponDiscountElement.textContent = `- ${formatPrice(summary.couponDiscount)}`;
    if (shippingFeeElement) shippingFeeElement.textContent = formatPrice(summary.shippingFee);
    if (totalElement) totalElement.textContent = formatPrice(summary.total);
    if (couponDiscountElement) couponDiscountElement.parentElement.style.display = summary.couponDiscount > 0 ? 'flex' : 'none';
    
    // --- 3. 渲染折扣碼輸入框狀態 ---
    if (appliedCoupon) {
        if (couponInputElement) { couponInputElement.value = appliedCoupon.code; couponInputElement.disabled = true; }
        if (applyCouponButton) { applyCouponButton.textContent = '已套用'; applyCouponButton.disabled = true; }
    } else {
        if (couponInputElement) { couponInputElement.value = ''; couponInputElement.disabled = false; }
        if (applyCouponButton) { applyCouponButton.textContent = '套用'; applyCouponButton.disabled = false; }
    }
    
    // --- 4. 渲染運送方式選擇器 ---
    if (shippingSelectorContainer) {
        if (state.items.length > 0 && state.availableShippingMethods.length > 0) {
            shippingSelectorContainer.style.display = 'block';
            let optionsHtml = state.availableShippingMethods.map(method => `<option value="${method.id}">${method.method_name} - ${formatPrice(method.rate)}</option>`).join('');
            shippingSelectorContainer.innerHTML = `<label for="shipping-method-select">選擇運送方式</label><select id="shipping-method-select"><option value="">請選擇...</option>${optionsHtml}</select><p class="shipping-note">運費僅限台灣本島地區。</p>`;
            const selectElement = document.getElementById('shipping-method-select');
            if (selectElement) selectElement.value = state.selectedShippingMethodId || "";
        } else {
            shippingSelectorContainer.style.display = 'none';
            shippingSelectorContainer.innerHTML = '';
        }
    }

    // --- 5. 更新結帳按鈕狀態 ---
    if (checkoutButton) {
        // ✅ 【關鍵修正】現在，按鈕的啟用條件是：購物車非空，並且已選擇運送方式
        const isReadyForCheckout = state.items.length > 0 && state.selectedShippingMethodId;
        checkoutButton.classList.toggle('disabled', !isReadyForCheckout);
        checkoutButton.title = isReadyForCheckout ? '前往結帳' : '請先選擇運送方式';
    }
}

/**
 * [私有函式] 統一處理側邊欄內部的所有點擊事件
 */
function handleSidebarClick(event) {
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
    } else if (target.id === 'sidebar-close-btn' || target.id === 'cart-sidebar-overlay') {
        CartSidebar.close();
    }
}

/**
 * [私有函式] 處理運送方式變更的事件
 */
function handleShippingChange(event) {
    if (event.target.id === 'shipping-method-select') {
        const selectedId = event.target.value;
        CartService.selectShippingMethod(selectedId);
    }
}

export const CartSidebar = {
    /**
     * 初始化側邊欄元件，創建 HTML 結構、CSS 樣式並綁定事件
     */
    init() {
        if (document.getElementById('cart-sidebar')) return;

        // --- 創建 HTML 骨架 ---
        const sidebarHtml = `
            <div id="cart-sidebar-overlay" class="hidden"></div>
            <div id="cart-sidebar" class="hidden">
                <div class="sidebar-header"><h3>您的購物車</h3><button id="sidebar-close-btn" aria-label="關閉購物車">&times;</button></div>
                <div id="sidebar-item-list" class="sidebar-body"></div>
                <div class="sidebar-footer">
                    <div class="promo-section"><div class="input-group"><input type="text" id="coupon-code-input" placeholder="輸入折扣碼"><button id="apply-coupon-btn">套用</button></div></div>
                    <div id="shipping-selector-container" class="shipping-section" style="display: none;"></div>
                    <div class="summary-section">
                        <div class="summary-row"><span>商品小計</span><span id="sidebar-subtotal-price">$0</span></div>
                        <div class="summary-row discount" style="display: none;"><span>折扣優惠</span><span id="sidebar-coupon-discount">-$0</span></div>
                        <div class="summary-row"><span>運費</span><span id="sidebar-shipping-fee">$0</span></div>
                        <div class="summary-row total"><span>總計</span><span id="sidebar-total-price">$0</span></div>
                    </div>
                    <a href="./checkout.html" id="checkout-btn" class="checkout-btn disabled">前往結帳</a>
                </div>
            </div>`;
        document.body.insertAdjacentHTML('beforeend', sidebarHtml);

        // --- 創建 CSS 樣式 ---
        const styles = `
            :root { 
                --cart-primary-color: #5E8C61; --cart-cta-color: #B12704; --cart-text-color: #333;
                --cart-light-text-color: #666; --cart-border-color: #f0f0f0; --cart-sale-color: #D9534F;
            }
            #cart-sidebar-overlay { position: fixed; inset: 0; background-color: rgba(0,0,0,0.5); z-index: 1999; opacity: 0; transition: opacity 0.3s ease-in-out; }
            #cart-sidebar { position: fixed; top: 0; right: 0; width: 100%; max-width: 420px; height: 100%; background-color: #fff; z-index: 2000; box-shadow: -5px 0 20px rgba(0,0,0,0.1); display: flex; flex-direction: column; transform: translateX(100%); transition: transform 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94); }
            #cart-sidebar.open { transform: translateX(0); }
            #cart-sidebar-overlay.open { opacity: 1; }
            .hidden { pointer-events: none; }
            #cart-sidebar.open, #cart-sidebar-overlay.open { pointer-events: auto; }
            .sidebar-header { display: flex; justify-content: space-between; align-items: center; padding: 1.25rem; border-bottom: 1px solid var(--cart-border-color); flex-shrink: 0; }
            .sidebar-header h3 { margin: 0; font-size: 1.25rem; }
            #sidebar-close-btn { background: none; border: none; font-size: 2rem; cursor: pointer; color: var(--cart-light-text-color); line-height: 1; padding: 0; }
            .sidebar-body { padding: 1.25rem; overflow-y: auto; flex-grow: 1; }
            .sidebar-footer { padding: 1.25rem; border-top: 1px solid var(--cart-border-color); background-color: #f8f9fa; flex-shrink: 0; }
            .empty-cart-container { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; text-align: center; }
            .empty-cart-icon { color: #ccc; margin-bottom: 1rem; }
            .empty-cart-message { color: var(--cart-light-text-color); font-size: 1.1rem; }
            .continue-shopping-btn { margin-top: 1.5rem; padding: 0.8rem 1.5rem; background-color: var(--cart-primary-color); color: white; text-decoration: none; border-radius: 6px; }
            .cart-item { display: flex; gap: 1rem; border-bottom: 1px solid var(--cart-border-color); padding: 1.25rem 0; }
            .item-image { width: 80px; height: 80px; object-fit: cover; border-radius: 8px; flex-shrink: 0; border: 1px solid var(--cart-border-color); }
            .item-details { flex-grow: 1; display: flex; flex-direction: column; justify-content: space-between; }
            .item-name { font-weight: 600; margin: 0 0 0.25rem; }
            .item-unit-price { font-size: 0.9rem; color: var(--cart-light-text-color); margin: 0; }
            .item-unit-price s { color: #999; }
            .item-quantity-controls { display: flex; align-items: center; margin-top: 0.5rem; }
            .quantity-btn { width: 32px; height: 32px; border: 1px solid #ccc; background-color: #fff; cursor: pointer; font-size: 1.2rem; display: flex; align-items: center; justify-content: center; }
            .quantity-btn:disabled { background-color: #f5f5f5; color: #ccc; cursor: not-allowed; }
            .quantity-display { padding: 0 1rem; text-align: center; min-width: 20px; font-size: 1.1rem; font-weight: 500; }
            .item-price-section { text-align: right; display: flex; flex-direction: column; justify-content: space-between; align-items: flex-end; }
            .item-price { font-weight: bold; margin: 0; font-size: 1.1rem; }
            .remove-item-btn { background: none; border: none; color: var(--cart-light-text-color); text-decoration: underline; cursor: pointer; font-size: 0.85rem; padding: 0.25rem 0; }
            .promo-section { margin-bottom: 1rem; }
            .input-group { display: flex; }
            .input-group input { flex-grow: 1; border: 1px solid #ccc; padding: 0.6rem; border-radius: 6px 0 0 6px; font-size: 0.9rem; }
            .input-group button { border: 1px solid #ccc; border-left: none; background-color: #f5f5f5; padding: 0.6rem 1rem; cursor: pointer; border-radius: 0 6px 6px 0; }
            .input-group button:disabled { background-color: #e0e0e0; color: #999; cursor: not-allowed; }
            .shipping-section { margin-bottom: 1rem; }
            .shipping-section label { display: block; margin-bottom: 0.25rem; font-size: 0.9rem; font-weight: 500; }
            .shipping-section select { width: 100%; box-sizing: border-box; padding: 0.6rem; border: 1px solid #ccc; border-radius: 6px; font-size: 1rem; }
            .shipping-note { font-size: 0.75rem; color: var(--cart-light-text-color); text-align: right; margin-top: 0.5rem; margin-bottom: 0; }
            .summary-section { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1rem; }
            .summary-row { display: flex; justify-content: space-between; font-size: 0.9rem; }
            .summary-row.total { font-size: 1.1rem; font-weight: bold; border-top: 1px solid #ddd; padding-top: 0.75rem; margin-top: 0.25rem; }
            .summary-row.discount { color: var(--cart-sale-color); }
            .checkout-btn { padding: 0.85rem; font-size: 1rem; font-weight: bold; }
        `;
        const styleSheet = document.createElement("style");
        styleSheet.innerText = styles;
        document.head.appendChild(styleSheet);
        
        sidebarElement = document.getElementById('cart-sidebar');
        overlayElement = document.getElementById('cart-sidebar-overlay');
        itemListElement = document.getElementById('sidebar-item-list');
        subtotalElement = document.getElementById('sidebar-subtotal-price');
        checkoutButton = document.getElementById('checkout-btn');
        couponInputElement = document.getElementById('coupon-code-input');
        applyCouponButton = document.getElementById('apply-coupon-btn');
        couponDiscountElement = document.getElementById('sidebar-coupon-discount');
        shippingFeeElement = document.getElementById('sidebar-shipping-fee');
        totalElement = document.getElementById('sidebar-total-price');
        shippingSelectorContainer = document.getElementById('shipping-selector-container');

        document.body.addEventListener('click', handleSidebarClick);
        document.body.addEventListener('change', handleShippingChange);
        
        CartService.subscribe(render);
    },
    
    open() { if (sidebarElement) { sidebarElement.classList.add('open'); sidebarElement.classList.remove('hidden'); } if (overlayElement) { overlayElement.classList.add('open'); overlayElement.classList.remove('hidden'); } },
    close() { if (sidebarElement) sidebarElement.classList.remove('open'); if (overlayElement) overlayElement.classList.remove('open'); setTimeout(() => { if (sidebarElement) sidebarElement.classList.add('hidden'); if (overlayElement) overlayElement.classList.add('hidden'); }, 300); },
    toggle() { if (sidebarElement?.classList.contains('open')) { this.close(); } else { this.open(); } }
};