// ==============================================================================
// 檔案路徑: supabase/functions/search-shipped-orders/index.ts
// 版本: v2.0 - 安全性強化與企業級日誌整合
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Search Shipped Orders Function (查詢已出貨訂單函式)
 * @description 根據多個可選條件，安全地查詢並回傳已出貨的訂單列表。
 * @version v2.0
 *
 * @update v2.0 - [SECURITY ENHANCEMENT & LOGGING INTEGRATION]
 * 1. [核心安全修正] 新增了 RBAC 權限檢查，僅允許 'warehouse_staff' 或 'super_admin'
 *          執行此操作，徹底修復了未授權資料存取漏洞。
 * 2. [核心架構] 引入 `LoggingService` v2.0，並使用 `withErrorLogging` 處理異常。
 * 3. [安全稽核日誌] 對每一次訂單搜尋操作都留下了詳細的稽核日誌，記錄了操作者、
 *          完整的查詢條件以及返回的結果數量。
 * 4. [標準化] 程式碼結構與平台其他查詢函式保持一致。
 */

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import LoggingService, { withErrorLogging } from '../_shared/services/loggingService.ts';

const FUNCTION_NAME = 'search-shipped-orders';
const FUNCTION_VERSION = 'v2.0';

const ALLOWED_ROLES = ['warehouse_staff', 'super_admin'];

async function mainHandler(req: Request, logger: LoggingService, correlationId: string): Promise<Response> {
  // --- 1. 權限驗證 ---
  const supabaseUserClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
  );
  const { data: { user } } = await supabaseUserClient.auth.getUser();
  const roles: string[] = user?.app_metadata?.roles || [];
  if (!user || !roles.some((r) => ALLOWED_ROLES.includes(r))) {
    logger.warn('權限不足，操作被拒絕', correlationId, { callerUserId: user?.id, callerRoles: roles });
    return new Response(JSON.stringify({ error: '權限不足。' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // --- 2. 獲取並記錄查詢參數 ---
  const params = await req.json().catch(() => ({}));
  logger.info('授權成功，開始查詢已出貨訂單', correlationId, {
    operatorId: user.id,
    params,
  });

  // --- 3. 動態建構查詢 ---
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
  let query = supabaseAdmin.from('orders').select(`
      id, order_number, created_at as order_date, shipped_at, shipping_tracking_code, carrier,
      subtotal_amount, shipping_fee, coupon_discount, total_amount,
      shipping_address_snapshot, payment_method, payment_status, payment_reference,
      profiles ( email, phone ),
      order_items ( quantity, price_at_order, product_variants ( name, sku, products (name) ) )
    `).eq('status', 'shipped');

  if (params.orderNumber) {
    query = query.eq('order_number', params.orderNumber);
  }
  if (params.recipientName) {
    query = query.like('shipping_address_snapshot->>recipient_name', `%${params.recipientName}%`);
  }
  if (params.email) {
    query = query.eq('profiles.email', params.email);
  }
  if (params.phone) {
    query = query.eq('profiles.phone', params.phone);
  }
  if (params.startDate) {
    const startOfDay = new Date(params.startDate);
    startOfDay.setHours(0, 0, 0, 0);
    query = query.gte('shipped_at', startOfDay.toISOString());
  }
  if (params.endDate) {
    const endOfDay = new Date(params.endDate);
    endOfDay.setHours(23, 59, 59, 999);
    query = query.lte('shipped_at', endOfDay.toISOString());
  }

  // --- 4. 執行查詢 ---
  const { data: orders, error } = await query.order('shipped_at', { ascending: false }).limit(100);

  if (error) throw error; // 由 withErrorLogging 捕捉

  logger.info(`已出貨訂單查詢成功，共找到 ${orders.length} 筆`, correlationId, { operatorId: user.id });

  // --- 5. 格式化回傳結果 ---
  const formattedOrders = orders.map(order => {
      const { profiles, ...restOfOrder } = order;
      return {
          ...restOfOrder,
          email: profiles?.email || null,
          phone: profiles?.phone || null
      };
  });

  return new Response(JSON.stringify(formattedOrders), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 200,
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const logger = new LoggingService(FUNCTION_NAME, FUNCTION_VERSION);

  // 使用 withErrorLogging 中介軟體包裹主要處理邏輯
  const wrappedHandler = withErrorLogging(mainHandler, logger);

  return await wrappedHandler(req);
});