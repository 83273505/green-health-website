// ==============================================================================
// 檔案路徑: supabase/functions/search-invoices/index.ts
// 版本: v48.0 - 企業級日誌與安全稽核整合
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Search Invoices Function (搜尋發票函式)
 * @description 發票管理後台的核心後端服務。
 * @version v48.0
 *
 * @update v48.0 - [ENTERPRISE LOGGING & SECURITY AUDIT INTEGRATION]
 * 1. [核心架構] 引入 `LoggingService` v2.0，取代所有 `console.*` 呼叫。
 * 2. [全域錯誤捕捉] 使用 `withErrorLogging` 中介軟體處理未預期異常。
 * 3. [安全稽核日誌] 對每一次發票搜尋操作都留下了詳細的稽核日誌，記錄了
 *          操作者、完整的查詢條件以及返回的結果數量，為安全與效能分析
 *          提供了關鍵數據。
 * 4. [追蹤 ID] 整個請求生命週期由 `correlationId` 貫穿。
 *
 * @update v47.0 - [ALIGN WITH v47.0 RPC FUNCTION]
 * 1. [核心簡化] 移除在 Edge Function 中手動組合搜尋詞的邏輯，將其下沉至
 *          `search_invoices_advanced` RPC 函式中。
 */

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import LoggingService, { withErrorLogging } from '../_shared/services/loggingService.ts';

const FUNCTION_NAME = 'search-invoices';
const FUNCTION_VERSION = 'v48.0';

async function mainHandler(req: Request, logger: LoggingService, correlationId: string): Promise<Response> {
  // --- 1. 初始化並驗證使用者權限 ---
  const supabaseUserClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
  );

  const { data: { user } } = await supabaseUserClient.auth.getUser();
  if (!user || !(user.app_metadata?.permissions || []).includes('module:invoicing:view')) {
    logger.warn('權限不足，操作被拒絕', correlationId, { callerUserId: user?.id });
    return new Response(JSON.stringify({ error: '權限不足，您無法存取發票資料。' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // --- 2. 解析前端傳來的篩選條件 ---
  const filters = await req.json().catch(() => ({}));
  logger.info('授權成功，開始搜尋發票', correlationId, {
    operatorId: user.id,
    filters,
  });

  // --- 3. 直接呼叫新版 RPC 函式執行查詢 ---
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
  
  const { data, error: rpcError } = await supabaseAdmin.rpc('search_invoices_advanced', {
    _status: filters.status || null,
    _search_term: filters.searchTerm || null,
    _date_from: filters.dateFrom || null,
    _date_to: filters.dateTo || null,
    _order_status: filters.orderStatus || null,
  });

  if (rpcError) {
    // 系統級錯誤，直接拋出讓 withErrorLogging 處理
    throw rpcError;
  }

  const resultData = data ? data.map((row: any) => row.invoice_details) : [];
  
  logger.info(`發票搜尋成功，共返回 ${resultData.length} 筆結果`, correlationId, {
    operatorId: user.id,
  });

  // --- 4. 回傳查詢結果 ---
  return new Response(JSON.stringify(resultData), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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