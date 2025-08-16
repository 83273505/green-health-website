// ==============================================================================
// 檔案路徑: account-module/js/core/constants.js
// 版本: v32.0 - 消費者端模組拆分
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Constants Module (會員中心常數模組)
 * @description 集中管理會員中心的所有常數。
 */

/**
 * 會員中心的路由路徑。
 */
export const ROUTES = {
    LOGIN: '/account-module/index.html',
    DASHBOARD: '/account-module/dashboard.html',
    AUTH_CALLBACK: '/account-module/auth-callback.html',
    FORGOT_PASSWORD: '/account-module/forgot-password.html',
    UPDATE_PASSWORD: '/account-module/update-password.html',
    PROFILE_SETUP: '/account-module/profile-setup.html',
    ADDRESS_MANAGEMENT: '/account-module/address.html',
    PROFILE_EDIT: '/account-module/profile-edit.html',
    
    // 指向商店前端的外部連結
    PRODUCTS_LIST: '/storefront-module/products.html',
};

/**
 * Supabase 資料表名稱。
 */
export const TABLE_NAMES = {
    PROFILES: 'profiles',
    ADDRESSES: 'addresses',
    PRODUCTS: 'products',
    PRODUCT_VARIANTS: 'product_variants',
    CATEGORIES: 'categories',
    CARTS: 'carts',
    CART_ITEMS: 'cart_items',
    ORDERS: 'orders',
    ORDER_ITEMS: 'order_items',
    PAYMENT_METHODS: 'payment_methods',
    SHIPPING_RATES: 'shipping_rates',
    COUPONS: 'coupons',
    INVENTORY_LOGS: 'inventory_logs'
};

/**
 * Supabase 特定的錯誤代碼。
 */
export const SUPABASE_ERRORS = {
    NO_ROWS_FOUND: 'PGRST116',
};