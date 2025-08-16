// ==============================================================================
// 檔案路徑: invoice-panel/js/core/app.js
// 版本: v29.1 - 鏡像 warehouse-panel
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Invoice Panel Application Entry Point (發票管理後台應用程式主入口)
 * @description 根據 HTML 頁面 <body> 標籤的 ID，動態載入並執行對應的業務邏輯模組。
 *              此架構完全鏡像自 warehouse-panel，以確保一致性與穩定性。
 */

import { supabase } from '../../../_shared/js/supabaseClient.js';

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await supabase;

        const pageId = document.body.id;
        if (!pageId) {
            throw new Error('頁面初始化失敗：缺少 <body> 標籤的 ID。');
        }

        let modulePath;

        // 【核心修正】動態載入的路徑改為與 warehouse-panel 一致的簡單相對路徑
        switch (pageId) {
            case 'invoice-dashboard':
                modulePath = '../modules/invoicing.js';
                break;
            
            default:
                console.warn(`[invoice-panel/app.js] 找不到與頁面 ID "${pageId}" 對應的業務模組。`);
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
        console.error(`[invoice-panel/app.js] 應用程式初始化時發生致命錯誤:`, err);
        const mainContent = document.querySelector('.invoice-container') || document.body;
        if (mainContent) {
            mainContent.innerHTML = `<div style="padding: 2rem; text-align: center; color: var(--error-color);">系統初始化失敗，請稍後再試或聯繫管理員。</div>`;
        }
    }
});