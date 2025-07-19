// 檔案路徑: GreenHealth-Auth-Module/js/app.js

/**
 * @file Main Application Entry Point
 * @description This script acts as the central controller for the entire application.
 * It determines the current page and dynamically loads the appropriate JavaScript module.
 * All HTML pages should only include this script.
 */

document.addEventListener('DOMContentLoaded', () => {
    // 獲取 <body> 標籤的 ID 作為頁面標識符
    const pageId = document.body.id;

    if (!pageId) {
        console.error('Page initialized without a body ID. Cannot load modules.');
        return;
    }

    // 根據頁面 ID 動態載入對應的模組
    switch (pageId) {
        case 'page-login':
        case 'page-auth-callback':
        case 'page-forgot-password':
        case 'page-update-password':
            // 這些頁面都由 auth.js 模組處理
            import('./auth.js')
                .then(module => {
                    // 檢查模組是否成功載入並有 init 方法
                    if (module && typeof module.init === 'function') {
                        module.init(pageId); // 將 pageId 傳入，讓模組內部決定執行哪個函式
                    }
                })
                .catch(err => console.error(`Error loading auth module: ${err}`));
            break;

        case 'page-dashboard':
            // dashboard 頁面由 dashboard.js 模組處理
            import('./dashboard.js')
                .then(module => {
                    if (module && typeof module.init === 'function') {
                        module.init();
                    }
                })
                .catch(err => console.error(`Error loading dashboard module: ${err}`));
            break;
        
        // 未來可以在這裡添加更多頁面的載入邏輯
        // case 'page-address-management':
        //     import('./address.js').then(module => module.init());
        //     break;

        default:
            console.log(`No specific module for page ID: ${pageId}.`);
            break;
    }
});