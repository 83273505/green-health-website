// ==============================================================================
// 檔案路徑: storefront-module/js/core/app.js
// 版本: v33.2 (已知可運作的純淨版本)
// ------------------------------------------------------------------------------
// 【此為完整檔案，請用此檔案直接覆蓋已損毀的版本】
// ==============================================================================

/**
 * 檔案名稱：app.js
 * 檔案職責：商店前端 (Storefront) - 應用程式主入口點。此腳本作為商店前端所有公開頁面的中央控制器。
 * 版本：v33.2 (正體中文校訂版)
 * AI 註記：
 * - [核心修正] 將所有 console.error 中的簡體中文錯誤訊息，校訂為標準正體中文。
 * - [架構還原] 此版本完全遵循您提供的 v33.0 穩定版架構，僅依賴 CartService.js
 *   作為唯一的購物邏輯和狀態管理器。
 */
import { supabase } from './supabaseClient.js';
import { CartService } from '../services/CartService.js';
import { CartWidget } from '../components/CartWidget.js';

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const supabaseClient = await supabase;
        // 初始化唯一的 CartService
        await CartService.init(supabaseClient);
        // 初始化 CartWidget，它將自動從 CartService 訂閱狀態
        CartWidget.init('cart-widget-container');

        const pageId = document.body.id;
        if (!pageId) return;

        let modulePath;

        switch (pageId) {
            case 'products-list':
                modulePath = '../modules/product/product.js';
                break;
            case 'product-detail':
                modulePath = '../modules/product/product-detail.js';
                break;
            case 'cart-page':
                modulePath = '../modules/cart/cart.js';
                break;
            case 'checkout':
                modulePath = '../modules/checkout/checkout.js';
                break;
            case 'order-success':
                modulePath = '../modules/order/order-success.js';
                break;
            case 'auth-terms':
                return;
            default:
                return; 
        }

        if (modulePath) {
            const module = await import(modulePath);
            if (module && typeof module.init === 'function') {
                await module.init(pageId);
            }
        }
    } catch (error) {
        console.error('❌ 商店前端初始化時發生致命錯誤:', error);
        document.body.innerHTML = '<h1>系統初始化失敗</h1><p>無法連接到後端服務，請稍後再試或聯繫管理員。</p>';
    }
});