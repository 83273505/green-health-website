// ==============================================================================
// 檔案路徑: invoice-panel/js/core/constants.js
// ------------------------------------------------------------------------------
// 【發票管理後台 - 常數模組】
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
    // 假設未來發票後台也需要自己的登入頁，可以與倉庫後台共用
    LOGIN: '../warehouse-panel/index.html',
    DASHBOARD: './index.html',
};