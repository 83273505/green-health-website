// 檔案路徑: warehouse-panel/js/core/app.js

/**
 * @file Warehouse Panel Application Entry Point (倉庫後台應用程式主入口)
 * @description 根據 HTML 頁面 <body> 標籤的 ID，動態載入並執行對應的業務邏輯模組。
 */

document.addEventListener('DOMContentLoaded', async () => {
    const pageId = document.body.id;

    if (!pageId) {
        console.error('頁面初始化時缺少 body ID，無法載入業務模組。');
        return;
    }

    let modulePath;

    // 根據頁面 ID 決定要載入哪個業務模組
    switch (pageId) {
        case 'warehouse-login':
            modulePath = '../modules/warehouse/auth.js';
            break;
        
        case 'shipping-dashboard':
            modulePath = '../modules/warehouse/shipping.js';
            break;
        
        default:
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