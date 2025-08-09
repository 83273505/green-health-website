// 檔案路徑: js/core/app.js (Final Routing Version)

/**
 * @file 應用程式主入口點 (Application Entry Point)
 * @description 此腳本作為所有頁面的中央控制器。它會根據 HTML 頁面 <body> 標籤的 ID，
 *              動態地從 ../modules/ 目錄中載入並執行對應的業務邏輯模組。
 */
import { CartService } from '../services/CartService.js';
import { CartWidget } from '../components/CartWidget.js';
import { CartSidebar } from '../components/CartSidebar.js';

document.addEventListener('DOMContentLoaded', async () => {
    // 1. 初始化核心服務
    await CartService.init();

    // 2. 初始化全域 UI 元件
    CartWidget.init('cart-widget-container');
    CartSidebar.init(); 

    // 3. 根據頁面 ID 載入特定頁面的業務邏輯
    const pageId = document.body.id;

    if (!pageId) {
        console.error('頁面初始化時缺少 body ID，無法載入業務模組。');
        return;
    }

    let modulePath;

    // 根據頁面 ID 決定要載入哪個業務模組
    switch (pageId) {
        // --- 會員模組路由 ---
        case 'auth-login':
        case 'auth-callback':
        case 'auth-forgot-password':
        case 'auth-update-password':
        case 'auth-terms':
            modulePath = '../modules/auth/auth.js';
            break;
        
        case 'dashboard':
            modulePath = '../modules/dashboard/dashboard.js';
            break;
        
        case 'address-management':
            modulePath = '../modules/address/address.js';
            break;
        
        case 'profile-edit':
            modulePath = '../modules/profile/profile-edit.js';
            break;
        
        case 'profile-setup':
            modulePath = '../modules/profile/profile-setup.js';
            break;

        // --- 商店模組路由 ---
        case 'products-list':
            modulePath = '../modules/product/product.js';
            break;

        case 'product-detail':
            modulePath = '../modules/product/product-detail.js';
            break;
        
        // ✅ 【新增】結帳與訂單相關的路由
        case 'checkout':
            modulePath = '../modules/checkout/checkout.js';
            break;
        
        case 'order-success':
            modulePath = '../modules/order/order-success.js';
            break;
        
        default:
            // 對於沒有特定邏輯的頁面，不安靜地退出是正常的
            return; 
    }

    if (modulePath) {
        import(modulePath)
            .then(module => {
                if (module && typeof module.init === 'function') {
                    module.init(pageId); 
                } else {
                    console.error(`模組 ${modulePath} 沒有正確匯出 init 函式或模組載入失敗。`);
                }
            })
            .catch(err => console.error(`載入模組 ${modulePath} 時發生錯誤:`, err));
    }
});