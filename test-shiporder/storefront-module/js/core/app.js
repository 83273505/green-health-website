// 檔案路徑: storefront-module/js/core/app.js
// ==============================================================================
/**
 * 檔案名稱：app.js
 * 檔案職責：商店前端 (Storefront) - 應用程式主入口點。此腳本作為商店前端所有公開頁面的中央控制器。
 * 版本：v33.2 (正體中文校訂版)
 * AI 註記：
 * - [核心修正] 将所有 console.error 中的简体中文错误讯息，校订为标准正体中文。
 * - [架构还原] 此版本完全遵循您提供的 v33.0 稳定版架构，仅依赖 CartService.js
 *   作为唯一的购物逻辑和状态管理器。
 */
import { supabase } from './supabaseClient.js';
import { CartService } from '../services/CartService.js';
import { CartWidget } from '../components/CartWidget.js';

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const supabaseClient = await supabase;
        // 初始化唯一的 CartService
        await CartService.init(supabaseClient);
        // 初始化 CartWidget，它将自动从 CartService 订阅状态
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