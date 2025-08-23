// ==============================================================================
// 檔案路徑: storefront-module/js/components/CartWidget.js
// 版本: v38.1 - 现代化模组重构
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

import { CartService } from '../services/CartService.js';

/**
 * [私有函式] 根據購物車的最新狀態，重新渲染小工具的 UI。
 * @param {object} state - 來自 CartService 的最新狀態。
 */
function render(state) {
    const widgetElement = document.getElementById('cart-widget');
    const countElement = document.getElementById('cart-item-count');
    const svgElement = widgetElement ? widgetElement.querySelector('svg') : null;

    if (!widgetElement || !countElement || !svgElement) return;

    if (state.itemCount > 0) {
        countElement.textContent = state.itemCount;
        countElement.style.display = 'block';
    } else {
        countElement.style.display = 'none';
    }
    
    if (state.isLoading) {
        widgetElement.style.opacity = '0.7';
        svgElement.style.animation = 'spin 1s linear infinite';
    } else {
        widgetElement.style.opacity = '1';
        svgElement.style.animation = 'none';
    }
}

export const CartWidget = {
    /**
     * 初始化購物車小工具，將其掛載到頁面上並訂閱狀態。
     * @param {string} containerId - 掛載小工具的容器元素 ID。
     */
    init(containerId = 'cart-widget-container') {
        const container = document.getElementById(containerId);
        if (!container || document.getElementById('cart-widget')) {
            return;
        }

        container.innerHTML = `
            <div id="cart-widget" style="position: relative; cursor: pointer; transition: opacity 0.3s;" title="查看購物車">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.5s;">
                    <circle cx="9" cy="21" r="1"></circle>
                    <circle cx="20" cy="21" r="1"></circle>
                    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                </svg>
                <span id="cart-item-count" style="position: absolute; top: -8px; right: -8px; background-color: #D9534F; color: white; border-radius: 50%; padding: 2px 6px; font-size: 12px; font-weight: bold; display: none; line-height: 1;">0</span>
            </div>
        `;
        
        const styles = `@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;
        const styleSheet = document.createElement("style");
        styleSheet.innerText = styles;
        document.head.appendChild(styleSheet);

        const widgetElement = document.getElementById('cart-widget');
        if (widgetElement) {
            widgetElement.addEventListener('click', () => {
                window.location.href = '/storefront-module/cart.html';
            });
        }

        // [v38.1 修正] CartWidget 依然依赖 CartService，但 CartService 现在是自给自足的
        CartService.subscribe(render);
    }
};