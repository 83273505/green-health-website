// ==============================================================================
// 檔案路徑: storefront-module/js/components/CartWidget.js
// 版本: v38.2 - 主動狀態同步勝利收官版
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file 購物車小工具 (Cart Widget)
 * @description 負責渲染並管理頁面右上角的購物車圖示及其數量角標。
 * @version v38.2
 * 
 * @update v38.2 - [PROACTIVE STATE SYNC]
 * 1. [核心修正] 在 `init` 函式的結尾，增加了主動從 `CartService` 獲取
 *          初始狀態並立即進行一次渲染的邏輯。
 * 2. [錯誤解決] 此修改徹底解決了因模組初始化順序而導致 `CartWidget`
 *          錯過 `CartService` 首次狀態通知，從而無法正確顯示初始購物車
 *          數量的問題，確保了 UI 狀態的絕對同步。
 */

import { CartService } from '../services/CartService.js';

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

        CartService.subscribe(render);
        
        // [v38.2] 核心修正: 主動獲取一次初始狀態並渲染
        const initialState = CartService.getState();
        render(initialState);
    }
};