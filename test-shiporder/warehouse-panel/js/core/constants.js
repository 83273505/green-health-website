// ==============================================================================
// 檔案路徑: warehouse-panel/js/core/constants.js
// 版本: v25.3 - 核心服務引用最終修正版
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file 出貨管理儀表板 - 常數模組 (Warehouse Panel Constants)
 * @description 集中管理出貨管理儀表板應用程式的所有常數。
 * @version v25.3
 * 
 * @update v25.3 - [BUGFIX: CORE_SERVICE_REFERENCE]
 * 1. [錯誤修正] 根據使用者提供的原始碼，將 GET_ORDER_DETAILS 的引用，
 *          從錯誤的 'get-order-details-v2' 修正為系統中已存在的
 *          'get-order-details' (v2.1)，徹底解決 CORS 與網路錯誤。
 * 
 * @update v25.1 - [BUGFIX: VERSION_ALIGNMENT]
 * 1. [錯誤修正] 全面校準函式名稱的版本號。
 */

export const WAREHOUSE_ROUTES = {
  // 將登入路徑指向統一的 admin 登入頁
  LOGIN: '/admin/index.html',
  // 根據實際檔案結構，將路徑指向 index.html
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
  ORDER_CANCELLATION_REASONS: 'order_cancellation_reasons',
  ORDER_HISTORY_LOGS: 'order_history_logs',
};

export const FUNCTION_NAMES = {
  // 訂單操作
  GET_PAID_ORDERS: 'get-paid-orders',
  GET_ORDER_DETAILS: 'get-order-details', // [v25.3] 核心修正
  MARK_ORDER_AS_PAID: 'mark-order-as-paid',
  MARK_ORDER_AS_SHIPPED: 'mark-order-as-shipped-v3',
  RESEND_SHIPPED_NOTIFICATION: 'resend-shipped-notification-v2',
  CANCEL_ORDER: 'cancel-order-v2',
  // 訂單查詢與分析
  SEARCH_ORDERS: 'search-orders-v2',
  GET_ORDERS_SUMMARY: 'get-orders-summary',
  // 顧客資訊
  GET_CUSTOMER_SUMMARY: 'get-customer-summary',
  // 使用者管理
  SEARCH_USERS: 'search-users',
  MANAGE_USER_ROLE: 'manage-user-role',
  // 黑貓物流 API
  CREATE_TCAT_SHIPMENT: 'create-tcat-shipment',
  GET_TCAT_SHIPMENT_STATUS: 'get-tcat-shipment-status',
};

/**
 * 郵件相關的文字內容
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