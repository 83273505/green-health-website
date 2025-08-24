// ==============================================================================
// 檔案路徑: invoice-panel/js/core/constants.js
// 版本: v47.1 - 匯出功能常數補全
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Invoice Panel Constants (發票管理後台 - 常數模組)
 * @description 集中管理發票管理後台應用程式的所有常數。
 * @version v47.1
 * 
 * @update v47.1 - [ADD EXPORT FUNCTION CONSTANT]
 * 1. [新增] 在 FUNCTION_NAMES 中新增了 `EXPORT_INVOICES_CSV`，其值為
 *          `export-invoices-csv`。
 * 2. [目的] 修正因缺少此常數定義而導致的 CORS `undefined` 錯誤，
 *          並啟用 v47.3 版本 `invoicing.js` 中的批次匯出功能。
 */

/**
 * Edge Function 的名稱常數。
 * 統一管理所有會從發票後台呼叫的後端函式名稱。
 */
export const FUNCTION_NAMES = {
    SEARCH_INVOICES: 'search-invoices',
    ISSUE_INVOICE_MANUALLY: 'issue-invoice-manually',
    VOID_INVOICE: 'void-invoice',
    UPDATE_INVOICE_DETAILS: 'update-invoice-details',
    EXPORT_INVOICES_CSV: 'export-invoices-csv', // [v47.1 新增]
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