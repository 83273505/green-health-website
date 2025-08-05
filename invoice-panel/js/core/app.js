// ==============================================================================
// 檔案路徑: invoice-panel/js/core/app.js
// ------------------------------------------------------------------------------
// 【發票管理後台 - 應用程式主入口】
// ==============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    const pageId = document.body.id;

    if (!pageId) {
        console.error('頁面初始化時缺少 body ID，無法載入業務模組。');
        return;
    }

    let modulePath;

    // 根據頁面 ID 決定要載入哪個業務模組
    switch (pageId) {
        // 假設未來可能會有獨立的登入頁
        // case 'invoice-login':
        //     modulePath = '../modules/invoiceAuth.js';
        //     break;
        
        case 'invoice-dashboard':
            modulePath = '../modules/invoicing.js';
            break;
        
        default:
            console.warn(`找不到與 page ID "${pageId}" 對應的業務模組。`);
            return; 
    }

    if (modulePath) {
        try {
            const module = await import(modulePath);
            if (module && typeof module.init === 'function') {
                module.init(); // 呼叫模組的初始化函式
            } else {
                console.error(`模組 ${modulePath} 沒有正確匯出 init 函式或模組載入失敗。`);
            }
        } catch (err) {
            console.error(`載入模組 ${modulePath} 時發生錯誤:`, err);
        }
    }
});