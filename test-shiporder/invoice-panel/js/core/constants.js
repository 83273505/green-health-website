// ==============================================================================
// 檔案路徑: invoice-panel/js/core/constants.js
// 版本: v29.1 - 鏡像 warehouse-panel
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * Edge Function 的名稱常數。
 * 統一管理所有會從發票後台呼叫的後端函式名稱。
 */
export const FUNCTION_NAMES = {
    SEARCH_INVOICES: 'search-invoices',
    ISSUE_INVOICE_MANUALLY: 'issue-invoice-manually',
    VOID_INVOICE: 'void-invoice',
    RESEND_INVOICE_NOTIFICATION: 'resend-invoice-notification',
    // 可能會共用的函式
    GET_ORDER_DETAILS: 'get-order-details', 
};

/**
 * 資料庫表的名稱常數。
 */
export const TABLE_NAMES = {
    INVOICES: 'invoices',
    ORDERS: 'orders',
    PROFILES: 'profiles',
};

/**
 * 頁面路由常數。
 */
export const INVOICE_ROUTES = {
    // 【核心設定】將登入路徑指向統一的 admin 登入頁
    LOGIN: '/admin/index.html',
    
    // 將所有路徑改為從網站根目錄開始的絕對路徑，更為穩健
    DASHBOARD: '/invoice-panel/index.html',
};