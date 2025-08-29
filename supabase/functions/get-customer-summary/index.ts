// ==============================================================================
// 檔案路徑: supabase/functions/get-customer-summary/index.ts
// 版本: v2.0 - 企業級日誌框架整合
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Get Customer Summary Function (獲取顧客摘要函式)
 * @description 根據 user_id，查詢並回傳該顧客的歷史訂單摘要資訊，
 *              包括首次下單日、總訂單數、總消費金額與取消次數。
 * @version v2.0
 *
 * @update v2.0 - [ENTERPRISE LOGGING FRAMEWORK INTEGRATION]
 * 1. [核心架構] 引入 `LoggingService` v2.0，完全取代原有的本地 `log()` 函式。
 * 2. [標準化] 所有日誌輸出均遵循平台統一的結構化格式，並由 `correlationId` 貫穿。
 * 3. [錯誤處理優化] 使用 `withErrorLogging` 中介軟體處理未預期異常，並將業務
 *          邏輯錯誤（如權限、參數問題）與系統錯誤清晰分離。
 * 4. [安全稽核] 增強了權限驗證失敗時的日誌記錄，提供了更豐富的稽核上下文。
 *
 * @permission 呼叫者必須擁有 'warehouse_staff' 或 'super_admin' 角色。
 * @param {string} userId - 要查詢的顧客 user_id。
 */

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import LoggingService, { withErrorLogging } from '../_shared/services/loggingService.ts';

const FUNCTION_NAME = 'get-customer-summary';
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

  // --- 2. 輸入驗證 ---
  const { userId } = await req.json().catch(() => ({ userId: null }));
  if (!userId || typeof userId !== 'string') {
    logger.warn('缺少有效的 userId 參數', correlationId, {
      callerUserId: user.id,
    });
    return new Response(JSON.stringify({ error: '缺少有效的 userId 參數。' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  logger.info('授權成功，開始查詢顧客摘要', correlationId, {
    callerUserId: user.id,
    targetUserId: userId,
  });

  // --- 3. 執行資料庫查詢 ---
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // 平行執行三個查詢以提升效能
  const [profilePromise, firstOrderPromise, statsPromise] = [
    // 查詢 1: 獲取取消次數
    supabaseAdmin.from('profiles').select('cancellation_count').eq('id', userId).single(),
    // 查詢 2: 獲取首次下單日期
    supabaseAdmin.from('orders').select('created_at').eq('user_id', userId).order('created_at', { ascending: true }).limit(1).single(),
    // 查詢 3: 統計總訂單數與總金額
    supabaseAdmin.from('orders').select('total_amount').eq('user_id', userId).in('status', ['paid', 'shipped', 'completed']),
  ];

  const [
    { data: profileData, error: profileError },
    { data: firstOrderData, error: firstOrderError },
    { data: statsData, error: statsError },
  ] = await Promise.all([profilePromise, firstOrderPromise, statsPromise]);

  // 任何資料庫錯誤都將被 `withErrorLogging` 捕捉
  if (profileError && profileError.code !== 'PGRST116') throw profileError; // PGRST116 = 'Not found', which is ok
  if (firstOrderError && firstOrderError.code !== 'PGRST116') throw firstOrderError;
  if (statsError) throw statsError;


  // --- 4. 組合回傳資料 ---
  const totalOrders = statsData?.length || 0;
  const totalSpent = (statsData || []).reduce((sum, order) => sum + Number(order.total_amount || 0), 0);

  const summary = {
    firstOrderDate: firstOrderData?.created_at || null,
    totalOrders: totalOrders,
    totalSpent: totalSpent,
    cancellationCount: profileData?.cancellation_count || 0,
  };

  logger.info('顧客摘要查詢成功', correlationId, {
    callerUserId: user.id,
    targetUserId: userId,
    summary,
  });

  // --- 5. 回傳成功響應 ---
  return new Response(JSON.stringify(summary), {
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