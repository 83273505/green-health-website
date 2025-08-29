// ==============================================================================
// 檔案路徑: supabase/functions/search-orders/index.ts
// 版本: v1.0 - 企業級日誌與安全稽核整合
// ------------------------------------------------------------------------------
// 【此為全新檔案，請建立對應資料夾與檔案】
// ==============================================================================

/**
 * @file Search Orders Function (統一訂單查詢函式)
 * @description 根據多個可選條件，查詢並回傳訂單列表。
 * @version v1.0
 *
 * @update v1.0 - [ENTERPRISE LOGGING & SECURITY AUDIT]
 * 1. [核心架構] 引入 `LoggingService` v2.0，完全取代原有的本地 `log()` 函式，
 *          並使用 `withErrorLogging` 中介軟體處理未預期異常。
 * 2. [安全稽核] 對每一次訂單搜尋操作都留下了詳細的稽核日誌，記錄了操作者、
 *          完整的查詢條件以及返回的結果數量。
 * 3. [標準化] 程式碼結構與平台其他查詢函式 (如 search-invoices) 保持一致。
 *
 * @permission 呼叫者必須擁有 'warehouse_staff' 或 'super_admin' 角色。
 */

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import LoggingService, { withErrorLogging } from '../_shared/services/loggingService.ts';

const FUNCTION_NAME = 'search-orders';
const FUNCTION_VERSION = 'v1.0';

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
  logger.info('授權成功，開始處理訂單查詢請求', correlationId, {
    operatorId: user.id,
    params,
  });

  // --- 3. 動態建構查詢 ---
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
  let query = supabaseAdmin.from('orders').select(`
    id, order_number, created_at, status, shipped_at, cancelled_at,
    cancellation_reason, shipping_tracking_code, carrier,
    shipping_address_snapshot, customer_email,
    order_items ( quantity, product_variants ( name, products (name) ) )
  `);

  if (params.status) {
    query = query.eq('status', params.status);
  }
  if (params.orderNumber) {
    query = query.ilike('order_number', `%${params.orderNumber}%`);
  }
  if (params.customerKeyword) {
    const keyword = `%${params.customerKeyword}%`;
    query = query.or(`shipping_address_snapshot->>recipient_name.ilike.${keyword},customer_email.ilike.${keyword}`);
  }
  if (params.startDate) {
    query = query.gte('created_at', new Date(params.startDate).toISOString());
  }
  if (params.endDate) {
    const endOfDay = new Date(params.endDate);
    endOfDay.setHours(23, 59, 59, 999);
    query = query.lte('created_at', endOfDay.toISOString());
  }

  // --- 4. 執行查詢 ---
  const { data: orders, error } = await query
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    // 系統級錯誤，直接拋出讓 withErrorLogging 處理
    throw error;
  }
  
  logger.info(`訂單查詢成功，共找到 ${orders.length} 筆訂單`, correlationId, {
    operatorId: user.id,
    count: orders.length,
  });

  // --- 5. 回傳結果 ---
  return new Response(JSON.stringify(orders), {
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