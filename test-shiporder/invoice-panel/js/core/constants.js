// ==============================================================================
// 檔案路徑: invoice-panel/js/core/constants.js
// 版本: v47.0 - 新增 update-invoice-details 函式常數
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Invoice Panel Constants (發票管理後台 - 常數模組)
 * @description 集中管理發票管理後台應用程式的所有常數。
 * @version v47.0
 * 
 * @update v47.0 - [ADD NEW FUNCTION CONSTANT]
 * 1. [新增] 在 FUNCTION_NAMES 中新增了 `UPDATE_INVOICE_DETAILS`，其值為
 *          `update-invoice-details`。
 * 2. [目的] 為了支援 v47.1 版本 `invoicing.js` 中的「僅儲存修改」功能，
 *          使其能夠安全地呼叫對應的後端 Edge Function。
 */

/**
 * Edge Function 的名稱常數。
 * 統一管理所有會從發票後台呼叫的後端函式名稱。
 */
export const FUNCTION_NAMES = {
    SEARCH_INVOICES: 'search-invoices',
    ISSUE_INVOICE_MANUALLY: 'issue-invoice-manually',
    VOID_INVOICE: 'void-invoice',
    UPDATE_INVOICE_DETAILS: 'update-invoice-details', // [v47.0 新增]
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