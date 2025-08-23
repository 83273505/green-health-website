// ==============================================================================
// 檔案路徑: permission-panel/js/core/constants.js
// 版本: v28.3 - 正確相對路徑修正
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Permission Panel Constants Module
 * @description 定義 permission-panel 模組中使用的所有常數。
 */

/**
 * 頁面路由常數。
 */
export const PERMISSION_ROUTES = {
    // 【核心設定】將登入路徑指向統一的 admin 登入頁
    LOGIN: '/admin/index.html',
    DASHBOARD: '/permission-panel/index.html'
};

/**
 * 後端 Edge Function 的名稱常數。
 */
export const FUNCTION_NAMES = {
    GET_RBAC_SETTINGS: 'get-all-rbac-settings',
    MANAGE_PERMISSION: 'manage-role-permission'
};