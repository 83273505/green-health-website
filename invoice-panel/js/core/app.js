// ==============================================================================
// 檔案路徑: invoice-panel/js/core/app.js
// ------------------------------------------------------------------------------
// 【發票管理後台 - 應用程式主入口 (安全非同步版)】
// ==============================================================================

// 由於核心的 supabaseClient 現在是非同步的，
// 這裡的 DOMContentLoaded 事件監聽器也必須是 async 的。
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const pageId = document.body.id;

        if (!pageId) {
            console.error('頁面初始化時缺少 body ID，無法載入業務模組。');
            return;
        }

        let modulePath;

        // 根據頁面 ID，決定要載入哪個 JavaScript 業務邏輯模組
        switch (pageId) {
            // 假設未來可能會有獨立的登入頁，先預留
            // case 'invoice-login':
            //     modulePath = '../modules/auth.js';
            //     break;
            
            case 'invoice-dashboard':
                modulePath = '../modules/invoicing.js';
                break;
            
            default:
                console.warn(`找不到與 page ID "${pageId}" 對應的業務模組。`);
                return; 
        }

        if (modulePath) {
            // 使用動態 import() 語法來非同步載入模組
            const module = await import(modulePath);
            if (module && typeof module.init === 'function') {
                // 【核心邏輯】使用 await 呼叫模組的 init 函式。
                // 這是因為模組的 init 函式現在也是 async 的 (它需要 await requireInvoiceLogin())，
                // 我們需要等待它完全執行完畢。
                await module.init(); 
            } else {
                console.error(`模組 ${modulePath} 沒有正確匯出 init 函式或模組載入失敗。`);
            }
        }
    } catch (err) {
        // 這是最外層的錯誤捕捉。如果任何核心功能 (包括 Supabase Client 初始化) 失敗，
        // 都會在這裡被捕捉到，並向使用者顯示一個通用的錯誤訊息。
        console.error(`應用程式初始化時發生致命錯誤:`, err);
        document.body.innerHTML = `<div style="padding: 2rem; text-align: center; color: red;">系統初始化失敗，請查看控制台錯誤。</div>`;
    }
});