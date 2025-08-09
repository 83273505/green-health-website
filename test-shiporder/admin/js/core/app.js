// ==============================================================================
// 檔案路徑: test-shiporder/admin/js/core/app.js
// 版本: v26.0 - 生產就緒版
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Admin Module - App Initializer
 * @description 統一後台入口模組的應用程式主入口。
 *              負責根據頁面 ID，動態載入並初始化對應的業務邏輯。
 */

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const pageId = document.body.id;

        if (!pageId) {
            throw new Error('頁面初始化失敗：缺少 <body> 標籤的 ID。');
        }

        let modulePath;

        // 根據頁面 ID 決定要載入哪個業務邏輯模組
        switch (pageId) {
            case 'admin-login':
                modulePath = '../modules/auth.js';
                break;
            
            case 'admin-launcher':
                modulePath = '../modules/launcher.js';
                break;
            
            default:
                console.warn(`[app.js] 找不到與頁面 ID "${pageId}" 對應的業務模組。`);
                return; 
        }

        if (modulePath) {
            const module = await import(modulePath);
            if (module && typeof module.init === 'function') {
                await module.init(); // 呼叫模組的初始化函式
            } else {
                throw new Error(`模組 ${modulePath} 沒有正確匯出 init 函式。`);
            }
        }
    } catch (err) {
        console.error(`[app.js] 應用程式初始化時發生致命錯誤:`, err);
        const mainContent = document.querySelector('.launcher-container') || document.querySelector('.login-container') || document.body;
        if (mainContent) {
            mainContent.innerHTML = `<div style="padding: 2rem; text-align: center; color: var(--error-color);">系統初始化失敗，請稍後再試或聯繫管理員。</div>`;
        }
    }
});