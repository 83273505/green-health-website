// ==============================================================================
// 檔案路徑: permission-panel/js/core/app.js
// 版本: v28.3 - 正確相對路徑修正
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Permission Panel - App Initializer
 * @description 權限管理面板模組的應用程式主入口。
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
            case 'permission-dashboard':
                moduleUrl = new URL('../modules/permissions.js', import.meta.url).href;
                break;
            
            default:
                console.warn(`[permission-panel/app.js] 找不到與頁面 ID "${pageId}" 對應的業務模組。`);
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
        console.error(`[permission-panel/app.js] 應用程式初始化時發生致命錯誤:`, err);
        const mainContent = document.querySelector('.permission-container') || document.body;
        if (mainContent) {
            mainContent.innerHTML = `<div class="error-view"><h2>系統初始化失敗</h2><p>無法連接到後端服務，請稍後再試或聯繫管理員。</p></div>`;
        }
    }
});