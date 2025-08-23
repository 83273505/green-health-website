// ==============================================================================
// 檔案路徑: storefront-module/js/core/app.js
// 版本: v33.0 - 統一流程與體驗終局
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file 商店前端 (Storefront) - 應用程式主入口點
 * @description 此腳本作為商店前端所有公開頁面的中央控制器。
 */

import { supabase } from './supabaseClient.js';
import { CartService } from '../services/CartService.js';
import { CartWidget } from '../components/CartWidget.js';

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const supabaseClient = await supabase;
        await CartService.init(supabaseClient);
        CartWidget.init('cart-widget-container');

        const pageId = document.body.id;
        if (!pageId) return;

        let modulePath;

        // 【核心修正】更新路由表以匹配統一後的使用者流程
        switch (pageId) {
            case 'products-list':
                modulePath = '../modules/product/product.js';
                break;
            case 'product-detail':
                modulePath = '../modules/product/product-detail.js';
                break;
            
            // 【核心新增】新增購物車頁面的路由
            case 'cart-page':
                modulePath = '../modules/cart/cart.js';
                break;
            
            // 【核心修正】恢復為單一的結帳頁面路由
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