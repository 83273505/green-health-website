// ==============================================================================
// 檔案路徑: supabase/functions/get-orders-summary/index.ts
// 版本: v2.0 - 企業級日誌框架整合
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Get Orders Summary Function (獲取訂單彙總資訊函式)
 * @description 根據可選的日期區間，查詢並回傳該區間內所有新顧客的訂單彙總資訊，
 *              包括首次下單總數、總訂單數、以及總消費金額。
 * @version v2.0
 *
 * @update v2.0 - [ENTERPRISE LOGGING FRAMEWORK INTEGRATION]
 * 1. [核心架構] 引入 `LoggingService` v2.0，完全取代原有的本地 `log()` 函式。
 * 2. [標準化] 所有日誌輸出均遵循平台統一的結構化格式，並由 `correlationId` 貫穿。
 * 3. [錯誤處理優化] 使用 `withErrorLogging` 中介軟體處理未預期異常，並將業務
 *          邏輯錯誤與系統錯誤清晰分離。
 * 4. [安全稽核] 增強了權限驗證失敗時的日誌記錄，為數據存取提供稽核軌跡。
 *
 * @permission 呼叫者必須擁有 'warehouse_staff' 或 'super_admin' 角色。
 * @param {string} [startDate] - 查詢區間開始日期 (YYYY-MM-DD)。
 * @param {string} [endDate] - 查詢區間結束日期 (YYYY-MM-DD)。
 */

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import LoggingService, { withErrorLogging } from '../_shared/services/loggingService.ts';

const FUNCTION_NAME = 'get-orders-summary';
const FUNCTION_VERSION = 'v2.0';

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

  // --- 2. 輸入驗證 (日期區間為可選) ---
  const { startDate, endDate } = await req.json().catch(() => ({}));
  logger.info('授權成功，開始查詢訂單彙總資訊', correlationId, {
    callerUserId: user.id,
    callerRoles: roles,
    startDate,
    endDate,
  });

  // --- 3. 執行資料庫查詢 (使用 RPC 以在資料庫層級進行彙總計算) ---
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // 我們將使用 RPC 函式來執行高效的彙總查詢
  // 這樣可以避免將大量訂單資料拉到 Edge Function 中進行計算
  const { data, error } = await supabaseAdmin
    .rpc('get_new_customers_summary', {
      p_start_date: startDate || null,
      p_end_date: endDate || null,
    })
    .single();

  // 任何資料庫錯誤都將被 `withErrorLogging` 捕捉
  if (error) {
    throw error;
  }

  logger.info('訂單彙總資訊查詢成功', correlationId, {
    callerUserId: user.id,
    summary: data,
  });

  // --- 4. 回傳成功響應 ---
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

  // 使用 withErrorLogging 中介軟體包裹主要處理邏輯
  const wrappedHandler = withErrorLogging(mainHandler, logger);

  return await wrappedHandler(req);
});