// ==============================================================================
// 檔案路徑: supabase/functions/get-orders-summary/index.ts
// 版本: v2.1 - 支援多条件筛选
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Get Orders Summary Function (获取订单彙總资讯函式)
 * @description 根据多个可选筛选条件，查询并回传订单的彙總资讯。
 * @version v2.1
 *
 * @update v2.1 - [MULTI-FILTER SUPPORT]
 * 1. [核心功能] 函式现在可以接收并处理 status, orderNumber, customerKeyword 等
 *          多个筛选条件，并将它们透传给 v2.0 版本的 RPC 函式。
 * 2. [日誌增强] 日誌现在会记录所有传入的筛选条件，以利于分析。
 *
 * @permission 呼叫者必须拥有 'warehouse_staff' 或 'super_admin' 角色。
 */

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import LoggingService, { withErrorLogging } from '../_shared/services/loggingService.ts';

const FUNCTION_NAME = 'get-orders-summary';
const FUNCTION_VERSION = 'v2.1';

const ALLOWED_ROLES = ['warehouse_staff', 'super_admin'];

async function mainHandler(
  req: Request,
  logger: LoggingService,
  correlationId: string
): Promise<Response> {
  // --- 1. 权限验证 ---
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
    logger.warn('权限不足，操作被拒绝', correlationId, {
      callerUserId: user?.id,
      callerRoles: roles,
    });
    return new Response(JSON.stringify({ error: '权限不足。' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // --- 2. 输入验证 (所有参数均为可选) ---
  const filters = await req.json().catch(() => ({}));
  logger.info('授权成功，开始查询订单彙總资讯', correlationId, {
    callerUserId: user.id,
    callerRoles: roles,
    filters,
  });

  // --- 3. 执行资料库查询 (使用 RPC) ---
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // v2.1 核心修正：将所有筛选条件传递给 RPC 函式
  const { data, error } = await supabaseAdmin
    .rpc('get_new_customers_summary', {
      p_start_date: filters.startDate || null,
      p_end_date: filters.endDate || null,
      p_status: filters.status || null,
      p_order_number: filters.orderNumber || null,
      p_customer_keyword: filters.customerKeyword || null,
    })
    .single();

  if (error) {
    throw error;
  }

  logger.info('订单彙總资讯查询成功', correlationId, {
    callerUserId: user.id,
    summary: data,
  });

  // --- 4. 回传成功响应 ---
  return new Response(JSON.stringify(data), {
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