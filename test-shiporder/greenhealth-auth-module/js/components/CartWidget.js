// ==============================================================================
// 檔案路徑: js/components/CartWidget.js
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋 - v20.0 狀態驅動版】
// ==============================================================================

import { CartService } from '../services/CartService.js';
import { CartSidebar } from './CartSidebar.js';

// --- 模組內部變數 ---
// 不再於模組頂層緩存 DOM 元素，以避免初始化時序問題。

// --- 核心函式 ---

/**
 * [私有函式] 根據購物車的最新狀態，重新渲染小工具的 UI。
 * @param {object} state - 來自 CartService 的最新狀態。
 */
function render(state) {
    // 【核心修改】將 DOM 元素獲取移至 render 函式內部，確保每次都取得最新參照。
    const widgetElement = document.getElementById('cart-widget');
    const countElement = document.getElementById('cart-item-count');
    const svgElement = widgetElement ? widgetElement.querySelector('svg') : null;

    // 如果核心元素不存在，則不進行渲染。
    if (!widgetElement || !countElement || !svgElement) return;

    // --- 1. 渲染商品數量角標 ---
    if (state.itemCount > 0) {
        countElement.textContent = state.itemCount;
        countElement.style.display = 'block';
    } else {
        countElement.style.display = 'none';
    }
    
    // --- 2. 【新增】根據 isLoading 狀態，提供視覺回饋 ---
    if (state.isLoading) {
        // 如果 CartService 正在背景執行非同步操作，讓圖示輕微地旋轉，提示使用者系統正在處理。
        widgetElement.style.opacity = '0.7';
        svgElement.style.animation = 'spin 1s linear infinite';
    } else {
        // 載入完成後，恢復正常樣式。
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
            // 如果容器不存在，或小工具已經被初始化過，則不執行任何操作。
            return;
        }

        // --- 1. 創建 HTML 結構 ---
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
        
        // --- 2. 【新增】透過 JavaScript 動態注入 isLoading 狀態所需的 CSS 動畫 ---
        const styles = `@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;
        const styleSheet = document.createElement("style");
        styleSheet.innerText = styles;
        document.head.appendChild(styleSheet);

        // --- 3. 綁定事件 ---
        const widgetElement = document.getElementById('cart-widget');
        if (widgetElement) {
            widgetElement.addEventListener('click', () => {
                CartSidebar.toggle();
            });
        }

        // --- 4. 訂閱 CartService 的狀態更新 ---
        CartService.subscribe(render);
    }
};