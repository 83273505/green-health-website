// 檔案路徑: js/components/CartWidget.js

import { CartService } from '../services/CartService.js';
// ✅ 【增加】引入 CartSidebar 以便呼叫其方法
import { CartSidebar } from './CartSidebar.js';

// --- 模組內部變數 ---
let _widgetElement = null;
let _countElement = null;

// --- 公開的物件與方法 ---
export const CartWidget = {
    /**
     * 初始化購物車小工具，將其掛載到頁面上並訂閱狀態
     * @param {string} containerId - 掛載小工具的容器元素 ID
     */
    init(containerId = 'cart-widget-container') {
        const container = document.getElementById(containerId);
        if (!container) {
            // 在某些頁面（如登入頁）可能沒有這個容器，這是正常的，所以不安靜地退出即可
            return;
        }

        // 創建 HTML 結構
        container.innerHTML = `
            <div id="cart-widget" style="position: relative; cursor: pointer;" title="查看購物車">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="9" cy="21" r="1"></circle>
                    <circle cx="20" cy="21" r="1"></circle>
                    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                </svg>
                <span id="cart-item-count" style="position: absolute; top: -8px; right: -8px; background-color: #D9534F; color: white; border-radius: 50%; padding: 2px 6px; font-size: 12px; font-weight: bold; display: none; line-height: 1;">0</span>
            </div>
        `;

        _widgetElement = document.getElementById('cart-widget');
        _countElement = document.getElementById('cart-item-count');

        // ✅ 【增加】為購物車圖示本身綁定點擊事件，以切換側邊欄
        if (_widgetElement) {
            _widgetElement.addEventListener('click', () => {
                CartSidebar.toggle();
            });
        }

        // 訂閱 CartService 的狀態更新
        CartService.subscribe(this.render);
    },

    /**
     * 根據購物車狀態重新渲染小工具
     * @param {object} state - 來自 CartService 的最新狀態
     */
    render(state) {
        if (!_countElement) return;

        if (state.itemCount > 0) {
            _countElement.textContent = state.itemCount;
            _countElement.style.display = 'block';
        } else {
            _countElement.style.display = 'none';
        }
    }
};