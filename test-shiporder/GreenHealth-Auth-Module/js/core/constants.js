// 档案路径: js/core/constants.js

/**
 * @file Constants Module (常数模组)
 * @description 集中管理整個應用程式的常數，以避免在程式碼中使用魔法字串 (Magic Strings)，
 *              並提高未來的可維護性。在新架構下，它被歸類為核心 (core) 模組。
 */

/**
 * 應用程式的路由路徑。
 * 
 * 【架构说明】
 *   - 根据 netlify.toml 的设定 (`publish = "test-shiporder/GreenHealth-Auth-Module"`),
 *     部署后的网站根目录 (/) 直接对应 GreenHealth-Auth-Module 资料夹。
 *   - 因此，所有页面间的跳转路径，都是相对于这个根目录的简单相对路径。
 * 
 * @enum {string}
 */
export const ROUTES = {
    LOGIN: './index.html',
    DASHBOARD: './dashboard.html',
    AUTH_CALLBACK: './auth-callback.html',
    FORGOT_PASSWORD: './forgot-password.html',
    UPDATE_PASSWORD: './update-password.html',
    PROFILE_SETUP: './profile-setup.html',
    ADDRESS_MANAGEMENT: './address.html',
    PROFILE_EDIT: './profile-edit.html',
    PRODUCTS_LIST: './products.html',
    PRODUCT_DETAIL: './product-detail.html'
};

/**
 * Supabase 資料表名稱。
 * @enum {string}
 */
export const TABLE_NAMES = {
    PROFILES: 'profiles',
    ADDRESSES: 'addresses',
    PRODUCTS: 'products',
    PRODUCT_VARIANTS: 'product_variants',
    CARTS: 'carts',
    CART_ITEMS: 'cart_items',
    ORDERS: 'orders',
    ORDER_ITEMS: 'order_items',
    CATEGORIES: 'categories',
    INVENTORY_LOGS: 'inventory_logs'
};

/**
 * Supabase 特定的錯誤代碼。
 * @enum {string}
 */
export const SUPABASE_ERRORS = {
    // 當使用 .single() 查詢但找不到任何資料列時，Supabase 回傳的錯誤代碼。
    NO_ROWS_FOUND: 'PGRST116',
};