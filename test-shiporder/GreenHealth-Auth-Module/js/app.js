// 檔案路徑: GreenHealth-Auth-Module/js/app.js

/**
 * @file Main Application Entry Point
 * @description This script acts as the central controller for the entire application.
 * It determines the current page and dynamically loads the appropriate JavaScript module.
 * All HTML pages should only include this script.
 */

document.addEventListener('DOMContentLoaded', () => {
    const pageId = document.body.id;

    if (!pageId) {
        console.error('Page initialized without a body ID. Cannot load modules.');
        return;
    }

    switch (pageId) {
        case 'page-login':
        case 'page-auth-callback':
        case 'page-forgot-password':
        case 'page-update-password':
            import('./auth.js')
                .then(module => {
                    if (module && typeof module.init === 'function') {
                        module.init(pageId);
                    }
                })
                .catch(err => console.error(`Error loading auth module: ${err}`));
            break;

        case 'page-dashboard':
            import('./dashboard.js')
                .then(module => {
                    if (module && typeof module.init === 'function') {
                        module.init();
                    }
                })
                .catch(err => console.error(`Error loading dashboard module: ${err}`));
            break;
        
        // 【新增部分】
        // 當頁面是地址管理頁時，載入 address.js 模組
        case 'page-address-management':
            import('./address.js')
                .then(module => {
                    if (module && typeof module.init === 'function') {
                        module.init();
                    }
                })
                .catch(err => console.error(`Error loading address module: ${err}`));
            break;

        default:
            console.log(`No specific module for page ID: ${pageId}.`);
            break;
    }
});