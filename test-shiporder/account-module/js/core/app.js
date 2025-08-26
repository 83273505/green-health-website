// ==============================================================================
// 檔案路徑: account-module/js/core/app.js
// 版本: v32.1 - 修复幽灵依赖
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file 會員中心 (Account) - 應用程式主入口點
 * @description 此腳本作為會員中心所有私有頁面的中央控制器。
 * @version v32.1
 * 
 * @update v32.1 - [CRITICAL BUG FIX]
 * 1. [移除] 删除了所有对 CartService, CartWidget, CartSidebar 等商店端 (storefront)
 *          专属模组的非法跨模组引用。这些引用是模组拆分时遗留的“幽灵依赖”，
 *          导致会员中心载入时出现 404 错误并使应用程式瘫痪。
 * 2. [移除] 删除了所有与购物车元件初始化相关的函式呼叫 (CartService.init, 
 *          CartWidget.init, CartSidebar.init)，恢复了会员中心模组的职责单一性。
 */

// [修正] 只保留对本模组及 _shared 模组的合法引用
import { supabase } from './supabaseClient.js';

document.addEventListener('DOMContentLoaded', async () => {
    try {
        // [修正] 移除所有与购物车元件初始化相关的程式码
        // await CartService.init(supabaseClient);
        // CartWidget.init('cart-widget-container');
        // CartSidebar.init(); 

        const pageId = document.body.id;
        if (!pageId) return;

        let modulePath;

        // 【核心逻辑维持不变】保留与会员中心 (SPA) 相关的路由
        switch (pageId) {
            case 'auth-login':
            case 'auth-callback':
            case 'auth-forgot-password':
            case 'auth-update-password':
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
            default:
                console.warn(`[Account App] No specific module found for pageId: ${pageId}`);
                return; 
        }

        if (modulePath) {
            console.log(`[Account App] Loading module for pageId: ${pageId} from ${modulePath}`);
            const module = await import(modulePath);
            if (module && typeof module.init === 'function') {
                // [修正] 不再传递 supabaseClient，因为每个子模组应该自行 import
                await module.init(pageId); 
            }
        }
    } catch (error) {
        console.error('❌ 會員中心初始化時發生致命錯誤:', error);
        document.body.innerHTML = '<h1>系統初始化失敗</h1><p>無法連接到後端服務，請稍後再試或聯繫管理員。</p>';
    }
});