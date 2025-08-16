// ==============================================================================
// 檔案路徑: account-module/js/core/app.js
// 版本: v32.0 - 消費者端模組拆分
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file 會員中心 (Account) - 應用程式主入口點
 * @description 此腳本作為會員中心所有私有頁面的中央控制器。
 */

import { supabase } from './supabaseClient.js';
import { CartService } from '../services/CartService.js';
import { CartWidget } from '../components/CartWidget.js';
import { CartSidebar } from '../components/CartSidebar.js';

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const supabaseClient = await supabase;
        await CartService.init(supabaseClient);
        CartWidget.init('cart-widget-container');
        CartSidebar.init(); 

        const pageId = document.body.id;
        if (!pageId) return;

        let modulePath;

        // 【核心修正】只保留與會員中心 (SPA) 相關的路由
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
                return; 
        }

        if (modulePath) {
            const module = await import(modulePath);
            if (module && typeof module.init === 'function') {
                await module.init(pageId);
            }
        }
    } catch (error) {
        console.error('❌ 會員中心初始化時發生致命錯誤:', error);
        document.body.innerHTML = '<h1>系統初始化失敗</h1><p>無法連接到後端服務，請稍後再試或聯繫管理員。</p>';
    }
});