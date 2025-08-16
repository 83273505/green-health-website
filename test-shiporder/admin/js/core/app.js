// ==============================================================================
// 檔案路徑: test-shiporder/admin/js/core/app.js
// 版本: v28.3 - 正確相對路徑修正
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Admin Module - App Initializer
 * @description 統一後台入口模組的應用程式主入口。
 *              負責根據頁面 ID，動態載入並初始化對應的業務邏輯。
 */

// 【核心修正】import 路徑改為正確的相對路徑
import { supabase } from '../../../_shared/js/supabaseClient.js';

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await supabase;

        const pageId = document.body.id;
        if (!pageId) {
            throw new Error('頁面初始化失敗：缺少 <body> 標籤的 ID。');
        }

        let moduleUrl;

        // 使用 import.meta.url 來產生絕對路徑，這是最穩健的做法
        switch (pageId) {
            case 'admin-login':
                moduleUrl = new URL('../modules/auth.js', import.meta.url).href;
                break;
            
            case 'admin-launcher':
                moduleUrl = new URL('../modules/launcher.js', import.meta.url).href;
                break;
            
            default:
                console.warn(`[admin/app.js] 找不到與頁面 ID "${pageId}" 對應的業務模組。`);
                return; 
        }

        if (moduleUrl) {
            const module = await import(moduleUrl);
            if (module && typeof module.init === 'function') {
                await module.init();
            } else {
                throw new Error(`模組 ${moduleUrl} 沒有正確匯出 init 函式。`);
            }
        }
    } catch (err) {
        console.error(`[admin/app.js] 應用程式初始化時發生致命錯誤:`, err);
        const mainContent = document.querySelector('.launcher-container') || document.querySelector('.login-container') || document.body;
        if (mainContent) {
            mainContent.innerHTML = `<div style="padding: 2rem; text-align: center; color: var(--error-color);">系統初始化失敗，請稍後再試或聯繫管理員。</div>`;
        }
    }
});