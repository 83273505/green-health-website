// 檔案路徑: js/components/CartSidebar.js (Shipping Note Final Version)

import { CartService } from '../services/CartService.js';
import { formatPrice } from '../core/utils.js';

let sidebarElement, overlayElement, itemListElement, subtotalElement, checkoutButton;
let couponInputElement, applyCouponButton, couponDiscountElement, shippingFeeElement, totalElement;
let shippingSelectorContainer;

/**
 * [私有函式] 根據從 CartService 獲取的最新狀態來重新渲染整個側邊欄的 UI
 */
function render(state) {
    if (!itemListElement) return;

    // --- 1. 渲染商品列表 ---
    if (state.items.length === 0) {
        itemListElement.innerHTML = '<p class="empty-cart-message">您的購物車是空的。</p>';
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
            return `
                <div class="cart-item" data-item-id="${item.id}">
                    <img src="${imageUrl}" alt="${variantName}" class="item-image">
                    <div class="item-details">
                        <p class="item-name">${variantName}</p>
                        ${unitPriceHtml}
                        <div class="item-quantity-controls">
                            <button class="quantity-btn minus" data-item-id="${item.id}" data-quantity="${item.quantity - 1}">-</button>
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
        if (couponInputElement) {
            couponInputElement.value = appliedCoupon.code;
            couponInputElement.disabled = true;
        }
        if (applyCouponButton) {
            applyCouponButton.textContent = '已套用';
            applyCouponButton.disabled = true;
        }
    } else {
        if (couponInputElement) {
            couponInputElement.value = '';
            couponInputElement.disabled = false;
        }
        if (applyCouponButton) {
            applyCouponButton.textContent = '套用';
            applyCouponButton.disabled = false;
        }
    }
    
    // --- 4. 渲染運送方式選擇器 ---
    if (shippingSelectorContainer) {
        if (state.items.length > 0 && state.availableShippingMethods.length > 0) {
            shippingSelectorContainer.style.display = 'block';
            let optionsHtml = state.availableShippingMethods.map(method => {
                return `<option value="${method.id}">${method.method_name} - ${formatPrice(method.rate)}</option>`;
            }).join('');
            
            shippingSelectorContainer.innerHTML = `
                <label for="shipping-method-select">選擇運送方式</label>
                <select id="shipping-method-select">
                    <option value="">請選擇...</option>
                    ${optionsHtml}
                </select>
                <!-- ✅ 【關鍵修正】在選擇器下方，增加一行小字體的備註 -->
                <p class="shipping-note">運費僅限台灣本島地區。</p>
            `;
            const selectElement = document.getElementById('shipping-method-select');
            if (selectElement) selectElement.value = state.selectedShippingMethodId || "";
        } else {
            shippingSelectorContainer.style.display = 'none';
            shippingSelectorContainer.innerHTML = '';
        }
    }

    // --- 5. 更新結帳按鈕狀態 ---
    if (checkoutButton) checkoutButton.classList.toggle('disabled', state.items.length === 0);
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
     * 初始化側邊欄元件
     */
    init() {
        if (document.getElementById('cart-sidebar')) return;
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

        const styles = `
            #cart-sidebar-overlay { position: fixed; inset: 0; background-color: rgba(0,0,0,0.5); z-index: 1999; opacity: 0; transition: opacity 0.3s ease; }
            #cart-sidebar { position: fixed; top: 0; right: 0; width: 100%; max-width: 400px; height: 100%; background-color: white; z-index: 2000; box-shadow: -5px 0 15px rgba(0,0,0,0.1); display: flex; flex-direction: column; transform: translateX(100%); transition: transform 0.3s ease; }
            #cart-sidebar.open { transform: translateX(0); }
            #cart-sidebar-overlay.open { opacity: 1; }
            .hidden { pointer-events: none; }
            #cart-sidebar.open, #cart-sidebar-overlay.open { pointer-events: auto; }
            .sidebar-header { display: flex; justify-content: space-between; align-items: center; padding: 1rem; border-bottom: 1px solid #eee; flex-shrink: 0; }
            .sidebar-header h3 { margin: 0; }
            #sidebar-close-btn { background: none; border: none; font-size: 1.5rem; cursor: pointer; }
            .sidebar-body { flex-grow: 1; overflow-y: auto; padding: 1rem; }
            .sidebar-footer { padding: 1rem; border-top: 1px solid #eee; flex-shrink: 0; }
            .checkout-btn { display: block; width: 100%; box-sizing: border-box; padding: 1rem; background-color: #B12704; color: white; text-align: center; text-decoration: none; border-radius: 8px; font-weight: bold; transition: background-color 0.2s; }
            .checkout-btn.disabled { background-color: #ccc; pointer-events: none; cursor: not-allowed; }
            .empty-cart-message { text-align: center; color: #888; margin-top: 2rem; }
            .cart-item { display: flex; gap: 1rem; border-bottom: 1px solid #f0f0f0; padding: 1rem 0; }
            .item-image { width: 80px; height: 80px; object-fit: cover; border-radius: 4px; flex-shrink: 0; }
            .item-details { flex-grow: 1; display: flex; flex-direction: column; justify-content: space-between; }
            .item-name { font-weight: bold; margin: 0 0 0.5rem; }
            .item-unit-price { font-size: 0.9rem; color: #555; margin: 0.25rem 0; }
            .item-unit-price s { color: #999; }
            .item-quantity-controls { display: flex; align-items: center; }
            .quantity-btn { width: 28px; height: 28px; border: 1px solid #ccc; background-color: #f5f5f5; cursor: pointer; font-size: 1rem; }
            .quantity-display { padding: 0 1rem; text-align: center; min-width: 20px; }
            .item-price-section { text-align: right; display: flex; flex-direction: column; justify-content: space-between; align-items: flex-end; }
            .item-price { font-weight: bold; margin: 0; }
            .remove-item-btn { background: none; border: none; color: #888; text-decoration: underline; cursor: pointer; font-size: 0.8rem; }
            .promo-section { margin-bottom: 1rem; }
            .input-group { display: flex; }
            .input-group input { flex-grow: 1; border: 1px solid #ccc; padding: 0.5rem; border-radius: 4px 0 0 4px; }
            .input-group button { border: 1px solid #ccc; border-left: none; background-color: #f5f5f5; padding: 0.5rem 1rem; cursor: pointer; border-radius: 0 4px 4px 0; }
            .input-group button:disabled { background-color: #e0e0e0; cursor: not-allowed; }
            .summary-section { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1rem; }
            .summary-row { display: flex; justify-content: space-between; }
            .summary-row.total { font-size: 1.2rem; font-weight: bold; border-top: 1px solid #eee; padding-top: 0.5rem; margin-top: 0.5rem; }
            .summary-row.discount { color: #D9534F; }
            .shipping-section { margin-bottom: 1rem; }
            .shipping-section label { display: block; margin-bottom: 0.5rem; font-size: 0.9rem; font-weight: 500; }
            .shipping-section select { width: 100%; box-sizing: border-box; padding: 0.75rem; border: 1px solid #ccc; border-radius: 4px; font-size: 1rem; }
            /* ✅ 【新增】運費備註的新樣式 */
            .shipping-note { font-size: 0.75rem; color: #888; text-align: right; margin-top: 0.5rem; margin-bottom: 0; }
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
    
    open() {
        if (sidebarElement) {
            sidebarElement.classList.add('open');
            sidebarElement.classList.remove('hidden');
        }
        if (overlayElement) {
            overlayElement.classList.add('open');
            overlayElement.classList.remove('hidden');
        }
    },
    close() {
        if (sidebarElement) sidebarElement.classList.remove('open');
        if (overlayElement) overlayElement.classList.remove('open');
        setTimeout(() => {
            if (sidebarElement) sidebarElement.classList.add('hidden');
            if (overlayElement) overlayElement.classList.add('hidden');
        }, 300);
    },
    toggle() {
        if (sidebarElement?.classList.contains('open')) {
            this.close();
        } else {
            this.open();
        }
    }
};