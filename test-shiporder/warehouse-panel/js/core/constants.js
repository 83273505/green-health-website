// 檔案路徑: warehouse-panel/js/core/constants.js

/**
 * @file Warehouse Panel Constants (倉庫後台常數模組)
 * @description 集中管理倉庫後台應用程式的所有常數。
 */

/**
 * 倉庫後台的路由路徑。
 */
export const WAREHOUSE_ROUTES = {
    LOGIN: './index.html',
    DASHBOARD: './shipping-dashboard.html',
};

/**
 * Supabase 資料表名稱 (可以從主前端複製，或根據需要增減)。
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
 * Supabase Edge Function 的名稱。
 */
export const FUNCTION_NAMES = {
    GET_PAID_ORDERS: 'get-paid-orders',
    MARK_ORDER_AS_SHIPPED: 'mark-order-as-shipped-and-notify',
    // 如果需要，未來可以新增獲取訂單詳情的函式
    // GET_ORDER_DETAILS: 'get-order-details-for-picking'
};