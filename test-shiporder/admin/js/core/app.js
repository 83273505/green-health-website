// ==============================================================================
// 檔案路徑: admin/js/core/app.js
// 版本: v45.4 - 物流中心路由整合版
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Admin Module - App Initializer (管理後台 - 應用程式主入口)
 * @description 統一後台入口模組的應用程式主入口。
 *              負責根據頁面 ID，動態載入並初始化對應的業務邏輯。
 * @version v45.4
 * 
 * @update v45.4 - [LOGISTICS_CENTER_ROUTING]
 * 1. [核心新增] 在路由 `switch` 區塊中，新增了對 `tcat-shipment-dashboard`
 *          頁面 ID 的處理，並將其正確地指向 `tcatshipment-panel` 的主
 *          應用程式腳本。
 * 2. [錯誤解決] 此修改解決了點擊「物流託運管理」模組卡片後，因缺少路由
 *          而無法載入對應功能的問題。
 */

import { supabase } from '/_shared/js/supabaseClient.js';

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await supabase;

        const pageId = document.body.id;
        if (!pageId) {
            throw new Error('頁面初始化失敗：缺少 <body> 標籤的 ID。');
        }

        let modulePath;

        switch (pageId) {
            case 'admin-login':
                modulePath = '/admin/js/modules/auth.js';
                break;
            
            case 'admin-launcher':
                modulePath = '/admin/js/modules/launcher.js';
                break;
            
            // [v45.4] 核心新增：為黑貓託運單儀表板新增路由
            case 'tcat-shipment-dashboard':
                modulePath = '/tcatshipment-panel/js/app.js';
                break;
            
            default:
                console.warn(`[admin/app.js] 找不到與頁面 ID "${pageId}" 對應的業務模組。`);
                return; 
        }

        if (modulePath) {
            const module = await import(modulePath);
            if (module && typeof module.init === 'function') {
                await module.init();
            } else {
                throw new Error(`模組 ${modulePath} 沒有正確匯出 init 函式。`);
            }
        }
    } catch (err) {
        console.error(`[admin/app.js] 應用程式初始化時發生致命錯誤:`, err);
        const mainContent = document.querySelector('.launcher-container') || document.querySelector('.login-container') || document.querySelector('main') || document.body;
        if (mainContent) {
            mainContent.innerHTML = `<div style="padding: 2rem; text-align: center; color: var(--error-color);">系統初始化失敗，請稍後再試或聯繫管理員。</div>`;
        }
    }
});