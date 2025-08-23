// ==============================================================================
// 檔案路徑: invoice-panel/js/core/app.js
// 版本: v45.3 - 路徑現代化重構 (決定版)
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Invoice Panel Application Entry Point (發票管理後台應用程式主入口)
 * @description 根據 HTML 頁面 <body> 標籤的 ID，動態載入並執行對應的業務邏輯模組。
 * @version v45.3
 * 
 * @update v45.3 - [PATH MODERNIZATION]
 * 1. [核心修正] 徹底放棄了所有相對路徑及 import.meta.url 的 import 寫法，
 *          所有 import 均改為從網站根目錄 (`/`) 開始的絕對路徑。
 * 2. [原理] 絕對路徑不受檔案自身位置變化的影響，在 Netlify 等複雜的部署
 *          環境下，是最健壯、最無歧義、最可靠的路徑引用方式。
 *          這將徹底解決因路徑解析錯誤導致的 MIME type 問題。
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
            case 'invoice-dashboard':
                modulePath = '/invoice-panel/js/modules/invoicing.js';
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