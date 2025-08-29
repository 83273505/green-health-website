// ==============================================================================
// 檔案路徑: warehouse-panel/js/core/constants.js
// 版本: v24.0 - 整合顧客輪廓與訂單彙總函式
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Warehouse Panel Constants (倉庫後台常數模組)
 * @description 集中管理倉庫後台應用程式的所有常數。
 * @version v24.0
 * 
 * @update v24.0
 * 1. [功能新增] 新增 GET_CUSTOMER_SUMMARY 函式，用於獲取單一顧客的歷史輪廓。
 * 2. [功能新增] 新增 GET_ORDERS_SUMMARY 函式，用於獲取訂單查詢結果的彙總數據。
 */

export const WAREHOUSE_ROUTES = {
  // 【核心修改】將登入路徑指向統一的 admin 登入頁
  LOGIN: '/admin/index.html',

  // 【v23.5 最終修正】根據實際檔案結構，將路徑指向 index.html
  DASHBOARD: '/warehouse-panel/index.html',
  USER_MANAGEMENT: '/warehouse-panel/user-management.html',
};

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
  INVENTORY_LOGS: 'inventory_logs',
};

export const FUNCTION_NAMES = {
  GET_PAID_ORDERS: 'get-paid-orders',
  GET_ORDER_DETAILS: 'get-order-details',
  MARK_ORDER_AS_PAID: 'mark-order-as-paid',
  MARK_ORDER_AS_SHIPPED: 'mark-order-as-shipped-and-notify',
  SEARCH_SHIPPED_ORDERS: 'search-shipped-orders', // 保留以與舊邏輯相容
  RESEND_SHIPPED_NOTIFICATION: 'resend-shipped-notification',
  SEARCH_USERS: 'search-users',
  MANAGE_USER_ROLE: 'manage-user-role',
  CANCEL_ORDER: 'cancel-order',
  SEARCH_ORDERS: 'search-orders',
  // v24.0 新增
  GET_CUSTOMER_SUMMARY: 'get-customer-summary',
  GET_ORDERS_SUMMARY: 'get-orders-summary',
};

/**
 * 郵件相關的文字內容
 * 集中管理可重複使用的郵件文字片段。
 */
export const EMAIL_TEXTS = {
  /**
   * 防詐騙宣導文字 (標準詳細版)
   */
  ANTI_FRAUD_WARNING: `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ 防詐騙提醒
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Green Health 綠健 絕對不會以任何名義，透過電話、簡訊或 Email 要求您操作 ATM、提供信用卡資訊或點擊不明連結。我們不會要求您解除分期付款或更改訂單設定。

若您接到任何可疑來電或訊息，請不要理會，並可直接透過官網客服管道與我們聯繫確認，或撥打 165 反詐騙諮詢專線。
    `.trim(),
};