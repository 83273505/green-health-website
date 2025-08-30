// ==============================================================================
// 檔案路徑: supabase/functions/get-order-details/index.ts
// 版本: v2.1 - RBAC 權限強化與 Service Role 查詢
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Get Order Details Function (獲取訂單詳細資訊函式)
 * @description 根據 orderId，安全地查詢並回傳該訂單的商品項目列表。
 *              此函式為後台專用，執行前會進行 RBAC 角色權限檢查。
 * @version v2.1
 *
 * @update v2.1 - [RBAC & SERVICE ROLE]
 * 1. [核心安全修正] 新增 RBAC 角色權限檢查，確保只有 'warehouse_staff' 或
 *          'super_admin' 角色的使用者才能呼叫此函式。
 * 2. [核心功能修正] 在權限驗證通過後，所有資料庫查詢將使用 service_role_key
 *          執行，以繞過 RLS 限制，確保後台能夠讀取所有訂單的詳細資訊。
 * 3. [架構保留] 完整保留 v2.0 的 LoggingService 和 withErrorLogging 框架。
 */

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import LoggingService, { withErrorLogging } from '../_shared/services/loggingService.ts';

const FUNCTION_NAME = 'get-order-details';
const FUNCTION_VERSION = 'v2.1';
const ALLOWED_ROLES = ['warehouse_staff', 'super_admin'];

async function mainHandler(
  req: Request,
  logger: LoggingService,
  correlationId: string
): Promise<Response> {
  // 步驟 1: 驗證使用者身份與角色權限 (RBAC)
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    logger.warn('缺少授權標頭', correlationId);
    return new Response(JSON.stringify({ error: '使用者未授權' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUserClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user } } = await supabaseUserClient.auth.getUser();
  if (!user) {
    logger.warn('無效的 Token，使用者未授權', correlationId);
    return new Response(JSON.stringify({ error: '使用者未授權' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const roles: string[] = user.app_metadata?.roles || [];
  const isAuthorized = roles.some(r => ALLOWED_ROLES.includes(r));

  if (!isAuthorized) {
    logger.warn('權限不足，操作被拒絕', correlationId, { userId: user.id, roles });
    return new Response(JSON.stringify({ error: '權限不足' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // 步驟 2: 獲取並驗證輸入參數
  const { orderId } = await req.json().catch(() => ({ orderId: null }));
  if (!orderId) {
    logger.warn('缺少 orderId 參數', correlationId, { userId: user.id });
    return new Response(JSON.stringify({ error: '缺少 orderId 參數' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  
  logger.info('授權成功，開始查詢訂單詳細資訊', correlationId, { userId: user.id, orderId });

  // 步驟 3: 【核心修正】建立具有 service_role 權限的 Admin Client
  const supabaseAdminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // 使用 Admin Client 進行查詢，以繞過 RLS
  const { data: items, error } = await supabaseAdminClient
    .from('order_items')
    .select(
      `
      quantity,
      price_at_order,
      product_variants (
        name, 
        sku,
        products (
          name,
          image_url
        )
      )
    `
    )
    .eq('order_id', orderId);

  if (error) {
    // 任何資料庫錯誤都將被 `withErrorLogging` 捕捉
    throw error;
  }
  
  logger.info(`成功查詢到 ${items.length} 筆商品項目`, correlationId, { userId: user.id, orderId });

  // 步驟 4: 回傳查詢到的商品項目陣列
  return new Response(JSON.stringify(items), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 200,
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const logger = new LoggingService(FUNCTION_NAME, FUNCTION_VERSION);
  const wrappedHandler = withErrorLogging(mainHandler, logger);

  return await wrappedHandler(req);
});