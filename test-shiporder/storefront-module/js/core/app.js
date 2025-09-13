// 檔案路徑: storefront-module/js/core/app.js
// ==============================================================================
/**
檔案名稱：app.js
檔案職責：商店前端 (Storefront) - 應用程式主入口點。此腳本作為商店前端所有公開頁面的中央控制器。
版本：33.0 (主席提供之穩定版)
SOP 條款對應：
[2.2.2] 非破壞性整合
AI 註記：
此版本為您提供的、已知可運作的穩定版本，是本次架構還原的核心基石。
更新日誌 (Changelog)：
v33.0：恢復至主席提供的、以 CartService 為核心的穩定初始化流程。
*/
import { supabase } from './supabaseClient.js';
import { CartService } from '../services/CartService.js';
import { CartWidget } from '../components/CartWidget.js';
document.addEventListener('DOMContentLoaded', async () => {
try {
const supabaseClient = await supabase;
await CartService.init(supabaseClient);
CartWidget.init('cart-widget-container');
code
Code
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