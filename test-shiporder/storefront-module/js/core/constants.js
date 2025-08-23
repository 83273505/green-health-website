// ==============================================================================
// 檔案路徑: storefront-module/js/core/constants.js
// 版本: v32.0 - 消費者端模組拆分
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Constants Module (商店前端常數模組)
 * @description 集中管理商店前端的所有常數。
 */

/**
 * 商店前端的路由路徑。
 */
export const ROUTES = {
    PRODUCTS_LIST: '/storefront-module/products.html',
    PRODUCT_DETAIL: '/storefront-module/product-detail.html',
    CHECKOUT: '/storefront-module/checkout.html',
    ORDER_SUCCESS: '/storefront-module/order-success.html',
    TERMS: '/storefront-module/terms.html',
    
    // 指向會員中心的外部連結
    LOGIN: '/account-module/index.html',
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