// ==============================================================================
// 檔案路徑: invoice-panel/js/core/app.js
// 版本: v24.0 - 全域共用模組重構版
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Invoice Panel Application Entry Point (發票管理後台應用程式主入口)
 * @description 根據 HTML 頁面 <body> 標籤的 ID，動態載入並執行對應的業務邏輯模組。
 */

// 由於核心的 supabaseClient 現在是非同步的，
// 這裡的 DOMContentLoaded 事件監聽器也必須是 async 的，以確保能正確使用 await。
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const pageId = document.body.id;

        if (!pageId) {
            console.error('頁面初始化失敗：缺少 <body> 標籤的 ID，無法載入業務模組。');
            document.body.innerHTML = '<p style="text-align: center; color: red; padding: 2rem;">頁面設定錯誤，無法啟動應用程式。</p>';
            return;
        }

        let modulePath;

        // 根據頁面 ID，決定要載入哪個 JavaScript 業務邏輯模組
        switch (pageId) {
            case 'invoice-dashboard':
                modulePath = '../modules/invoicing.js';
                break;
            
            default:
                console.warn(`在 invoice-panel 中，找不到與頁面 ID "${pageId}" 對應的業務模組。`);
                return; 
        }

        if (modulePath) {
            // 使用動態 import() 語法來非同步載入模組
            const module = await import(modulePath);
            if (module && typeof module.init === 'function') {
                // 【核心邏輯】使用 await 呼叫模組的 init 函式。
                // 這是因為模組的 init 函式現在也是 async 的 (它需要 await requireInvoiceLogin())，
                // 我們需要等待它完全執行完畢，才能確保頁面功能都已正確初始化。
                await module.init(); 
            } else {
                throw new Error(`模組 ${modulePath} 沒有正確匯出 init 函式。`);
            }
        }
    } catch (err) {
        // 這是最外層的錯誤捕捉。如果任何核心功能 (包括 Supabase Client 初始化) 失敗，
        // 都會在這裡被捕捉到，並向使用者顯示一個通用的錯誤訊息。
        console.error(`應用程式初始化時發生致命錯誤:`, err);
        const mainContent = document.querySelector('.invoice-container') || document.body;
        mainContent.innerHTML = `<div style="padding: 2rem; text-align: center; color: var(--error-color);">系統初始化失敗，請稍後再試或聯繫管理員。</div>`;
    }
});