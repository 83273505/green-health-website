// ==============================================================================
// 檔案路徑: warehouse-panel/js/core/app.js
// 版本: v24.0 - 全域共用模組重構版
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Warehouse Panel Application Entry Point (倉庫後台應用程式主入口)
 * @description 根據 HTML 頁面 <body> 標籤的 ID，動態載入並執行對應的業務邏輯模組。
 */

document.addEventListener('DOMContentLoaded', async () => {
    const pageId = document.body.id;

    if (!pageId) {
        console.error('頁面初始化時缺少 body ID，無法載入業務模組。');
        document.body.innerHTML = '<p style="text-align: center; color: red; padding: 2rem;">頁面設定錯誤，無法啟動應用程式。</p>';
        return;
    }

    let modulePath;

    // 根據頁面 ID 決定要載入哪個業務邏輯模組
    switch (pageId) {
        // 【核心修改】移除對 'warehouse-login' 的處理，因為登入頁已被統一
        // case 'warehouse-login':
        //     modulePath = '../modules/warehouse/auth.js';
        //     break;
        
        case 'shipping-dashboard':
            modulePath = '../modules/warehouse/shipping.js';
            break;
        
        case 'user-management':
            modulePath = '../modules/warehouse/users.js';
            break;
        
        default:
            console.warn(`在 warehouse-panel 中，找不到與頁面 ID "${pageId}" 對應的業務模組。`);
            return; 
    }

    if (modulePath) {
        try {
            const module = await import(modulePath);
            if (module && typeof module.init === 'function') {
                await module.init(); // 呼叫模組的初始化函式
            } else {
                throw new Error(`模組 ${modulePath} 沒有正確匯出 init 函式。`);
            }
        } catch (err) {
            console.error(`載入模組 ${modulePath} 時發生錯誤:`, err);
            // 在主要內容區顯示錯誤，而不是覆蓋整個頁面
            const mainContent = document.querySelector('.dashboard-container') || document.querySelector('.user-management-container') || document.body;
            mainContent.innerHTML = `<div style="padding: 2rem; text-align: center; color: var(--error-color);">系統初始化失敗，請稍後再試或聯繫管理員。</div>`;
        }
    }
});