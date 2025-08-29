// ==============================================================================
// 檔案路徑: supabase/functions/get-paid-orders/index.ts
// 版本: v3.0 - 安全性強化與日誌框架整合
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Get Orders by Status (依狀態獲取訂單函式)
 * @description 根據傳入的訂單狀態，安全地查詢並回傳對應的訂單列表。
 * @version v3.0
 *
 * @update v3.0 - [SECURITY ENHANCEMENT & LOGGING INTEGRATION]
 * 1. [核心安全修正] 函式現在強制要求呼叫者必須經過身份驗證，並且角色必須為
 *          'warehouse_staff' 或 'super_admin'，徹底修復了先前版本中存在的
 *          未授權資料存取漏洞。
 * 2. [核心架構] 引入 `LoggingService` v2.0，取代所有本地 `log()` 函式。
 * 3. [全域錯誤捕捉] 使用 `withErrorLogging` 中介軟體處理未預期異常。
 * 4. [安全稽核日誌] 清晰記錄每一次的查詢請求，包括操作者、角色及查詢條件。
 *
 * @update v2.1 - [BACKWARD COMPATIBLE]
 * 1. [核心原則] 維持函式名稱 'get-paid-orders' 不變，確保對現有系統的完全向下相容性。
 * 2. [功能擴充] 擴充 status 參數的接受範圍，新增對 'cancelled' 狀態的支援。
 */

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import LoggingService, { withErrorLogging } from '../_shared/services/loggingService.ts';

const FUNCTION_NAME = 'get-paid-orders';
const FUNCTION_VERSION = 'v3.0';

const ALLOWED_ROLES = ['warehouse_staff', 'super_admin'];

async function mainHandler(
  req: Request,
  logger: LoggingService,
  correlationId: string
): Promise<Response> {
  // --- 1. 權限驗證 ---
  const supabaseUserClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
  );
  const {
    data: { user },
  } = await supabaseUserClient.auth.getUser();
  const roles: string[] = user?.app_metadata?.roles || [];

  if (!user || !roles.some((r) => ALLOWED_ROLES.includes(r))) {
    logger.warn('權限不足，操作被拒絕', correlationId, {
      callerUserId: user?.id,
      callerRoles: roles,
    });
    return new Response(JSON.stringify({ error: '權限不足。' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // --- 2. 輸入驗證 ---
  const { status } = await req.json().catch(() => ({ status: null }));
  const allowedStatus = ['pending_payment', 'paid', 'cancelled'];
  if (!status || !allowedStatus.includes(status)) {
    logger.warn('缺少或無效的 status 參數', correlationId, {
      callerUserId: user.id,
      receivedStatus: status,
    });
    return new Response(JSON.stringify({ error: '缺少或無效的 status 參數' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  
  logger.info('授權成功，開始查詢訂單', correlationId, {
    callerUserId: user.id,
    callerRoles: roles,
    status,
  });

  // --- 3. 執行資料庫查詢 ---
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  let columns = `
    id, order_number, created_at, status, payment_status, payment_reference,
    shipping_address_snapshot, shipping_rates (method_name)
  `;
  if (status === 'cancelled') {
    columns += `, cancelled_at, cancellation_reason`;
  }

  let query = supabaseAdmin.from('orders').select(columns).eq('status', status);

  if (status === 'cancelled') {
    query = query.order('cancelled_at', { ascending: false });
  } else {
    query = query.order('created_at', { ascending: true });
  }

  if (status === 'paid') {
    query = query.is('shipping_tracking_code', null);
  }

  const { data: orders, error } = await query.limit(100);

  if (error) {
    throw error; // 將由 withErrorLogging 捕捉
  }

  logger.info(`查詢成功，找到 ${orders.length} 筆 [${status}] 狀態的訂單`, correlationId, {
    callerUserId: user.id,
  });

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