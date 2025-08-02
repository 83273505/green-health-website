// 檔案路徑: js/core/constants.js

/**
 * @file Constants Module (常數模組)
 * @description 集中管理整個應用程式的所有常數，以避免在程式碼中使用「魔法字串」(Magic Strings)，
 *              並提高未來的可維護性。
 */

/**
 * 應用程式的路由路徑。
 * 所有路徑都是相對於網站根目錄的相對路徑，方便在不同頁面間跳轉。
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
    PRODUCT_DETAIL: './product-detail.html',
    CHECKOUT: './checkout.html',
    
    // ✅ 【新增】補上訂單成功頁面的路徑，解決跳轉至 undefined 的問題
    ORDER_SUCCESS: './order-success.html'
};

/**
 * Supabase 資料表名稱。
 * 統一管理所有資料表名稱，可避免拼寫錯誤，並方便未來修改。
 * @enum {string}
 */
export const TABLE_NAMES = {
    // 會員核心
    PROFILES: 'profiles',
    ADDRESSES: 'addresses',

    // 產品核心
    PRODUCTS: 'products',
    PRODUCT_VARIANTS: 'product_variants',
    CATEGORIES: 'categories',
    
    // 交易核心
    CARTS: 'carts',
    CART_ITEMS: 'cart_items',
    ORDERS: 'orders',
    ORDER_ITEMS: 'order_items',

    // ✅ 【新增】補齊我們新增的商業規則相關資料表
    PAYMENT_METHODS: 'payment_methods',
    SHIPPING_RATES: 'shipping_rates',
    COUPONS: 'coupons',
    
    // 稽核與日誌
    INVENTORY_LOGS: 'inventory_logs'
};

/**
 * Supabase 特定的錯誤代碼。
 * 集中管理這些代碼，讓錯誤處理的邏輯更清晰。
 * @enum {string}
 */
export const SUPABASE_ERRORS = {
    // 當使用 .single() 查詢但找不到任何資料列時，Supabase 回傳的錯誤代碼。
    NO_ROWS_FOUND: 'PGRST116',
};