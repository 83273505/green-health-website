// 檔案路徑: storefront-module/js/core/app.js
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