// 檔案路徑: js/core/constants.js
// ----------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ----------------------------------------------------

/**
 * @file Constants Module (常數模組)
 * @description 集中管理整個應用程式的所有常數，以避免在程式碼中使用「魔法字串」(Magic Strings)，
 *              並提高未來的可維護性。
 */

/**
 * 應用程式的路由路徑。
 * 【核心修正】所有路徑都從相對於當前頁面的 './' 改為相對於網站根目錄的 '/'。
 * 這使得路由定義更加明確，並與 Netlify 的重寫規則 (Rewrite) 完美配合，
 * 無論當前在哪個頁面，都能確保連結指向正確的根路徑。
 * @enum {string}
 */
export const ROUTES = {
    LOGIN: '/index.html',
    DASHBOARD: '/dashboard.html',
    AUTH_CALLBACK: '/auth-callback.html',
    FORGOT_PASSWORD: '/forgot-password.html',
    UPDATE_PASSWORD: '/update-password.html',
    PROFILE_SETUP: '/profile-setup.html',
    ADDRESS_MANAGEMENT: '/address.html',
    PROFILE_EDIT: '/profile-edit.html',
    PRODUCTS_LIST: '/products.html',
    PRODUCT_DETAIL: '/product-detail.html', // 注意：商品詳情頁通常需要參數，這裡只定義基礎路徑
    CHECKOUT: '/checkout.html',
    ORDER_SUCCESS: '/order-success.html'
};

/**
 * Supabase 資料表名稱。
 * (維持不變)
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

    // 商業規則
    PAYMENT_METHODS: 'payment_methods',
    SHIPPING_RATES: 'shipping_rates',
    COUPONS: 'coupons',
    
    // 稽核與日誌
    INVENTORY_LOGS: 'inventory_logs'
};

/**
 * Supabase 特定的錯誤代碼。
 * (維持不變)
 * @enum {string}
 */
export const SUPABASE_ERRORS = {
    // 當使用 .single() 查詢但找不到任何資料列時，Supabase 回傳的錯誤代碼。
    NO_ROWS_FOUND: 'PGRST116',
};