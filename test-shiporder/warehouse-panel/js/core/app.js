// ==============================================================================
// 檔案路徑: warehouse-panel/js/core/app.js
// 版本: v45.4 - 完全正體化修正
// ------------------------------------------------------------------------------
// 【此檔案無需修改，可直接覆蓋以維持版本一致性】
// ==============================================================================

/**
 * @file Warehouse Panel Application Entry Point (倉庫後台應用程式主入口)
 * @description 根據 HTML 頁面 <body> 標籤的 ID，動態載入並執行對應的業務邏輯模組。
 * @version v45.4
 */

import { supabase } from '/_shared/js/supabaseClient.js';

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await supabase;

        const pageId = document.body.id;
        if (!pageId) {
            throw new Error('頁面初始化時缺少 body ID，無法載入業務模組。');
        }

        let modulePath;

        switch (pageId) {
            case 'shipping-dashboard':
                modulePath = '/warehouse-panel/js/modules/warehouse/shipping.js';
                break;
            
            case 'user-management':
                modulePath = '/warehouse-panel/js/modules/warehouse/users.js';
                break;
            
            default:
                console.warn(`在 warehouse-panel 中，找不到與頁面 ID "${pageId}" 對應的業務模組。`);
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
        console.error(`[warehouse-panel/app.js] 應用程式初始化時發生致命錯誤:`, err);
        const mainContent = document.querySelector('.dashboard-container') || document.querySelector('.user-management-container') || document.body;
        if (mainContent) {
            mainContent.innerHTML = `<div style="padding: 2rem; text-align: center; color: var(--error-color);">系統初始化失敗，請稍後再試或聯繫管理員。</div>`;
        }
    }
});