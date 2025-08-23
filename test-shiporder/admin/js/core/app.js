// ==============================================================================
// 檔案路徑: test-shiporder/admin/js/core/app.js
// 版本: v45.3 - 路徑現代化重構 (決定版)
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Admin Module - App Initializer (管理後台 - 應用程式主入口)
 * @description 統一後台入口模組的應用程式主入口。
 *              負責根據頁面 ID，動態載入並初始化對應的業務邏輯。
 * @version v45.3
 * 
 * @update v45.3 - [PATH MODERNIZATION & LOCALIZATION]
 * 1. [核心修正] 徹底放棄了所有相對路徑的 import 寫法，所有 import 均改為
 *          從網站根目錄 (`/`) 開始的絕對路徑。
 * 2. [原理] 絕對路徑不受檔案自身位置變化的影響，在 Netlify 等複雜的部署
 *          環境下，是最健壯、最無歧義、最可靠的路徑引用方式。
 * 3. [正體化] 檔案內所有註解及 UI 字串均已修正為正體中文。
 */

// [v45.3 核心修正] 使用絕對路徑引用共用模組
import { supabase } from '/_shared/js/supabaseClient.js';

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await supabase;

        const pageId = document.body.id;
        if (!pageId) {
            throw new Error('頁面初始化失敗：缺少 <body> 標籤的 ID。');
        }

        let modulePath;

        // [v45.3 核心修正] 動態載入的路徑也使用絕對路徑
        switch (pageId) {
            case 'admin-login':
                modulePath = '/admin/js/modules/auth.js';
                break;
            
            case 'admin-launcher':
                modulePath = '/admin/js/modules/launcher.js';
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
        const mainContent = document.querySelector('.launcher-container') || document.querySelector('.login-container') || document.body;
        if (mainContent) {
            mainContent.innerHTML = `<div style="padding: 2rem; text-align: center; color: var(--error-color);">系統初始化失敗，請稍後再試或聯繫管理員。</div>`;
        }
    }
});