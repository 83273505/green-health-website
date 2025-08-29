// ==============================================================================
// 檔案路徑: supabase/functions/issue-invoice-manually/index.ts
// 版本: v46.0 - 企業級日誌框架整合
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Issue Invoice Manually Function (手動開立發票函式)
 * @description 發票管理後台的核心操作功能之一。允許授權使用者對處於
 *              'pending' 或 'failed' 狀態的發票記錄，手動觸發開立流程。
 * @version v46.0
 *
 * @update v46.0 - [ENTERPRISE LOGGING FRAMEWORK INTEGRATION]
 * 1. [核心架構] 引入 `LoggingService` v2.0，取代所有 `console.*` 呼叫。
 * 2. [全域錯誤捕捉] 使用 `withErrorLogging` 中介軟體處理未預期異常。
 * 3. [安全稽核日誌] 對每一次手動開票嘗試都進行了詳細的稽核日誌記錄，
 *          包括操作者、目標發票ID、權限檢查結果及最終操作結果。
 * 4. [追蹤 ID] 整個請求生命週期由 `correlationId` 貫穿，為高風險操作提供
 *          了完整的可追溯性。
 *
 * @update v45.1 - [PERMISSION MODEL FIX]
 * 1. [核心修正] 徹底分離了 Supabase Client 的初始化職責，解決了因使用者 Token
 *          優先級高於 Service Key 導致後端操作意外受到 RLS 限制的根本問題。
 */

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { InvoiceService } from '../_shared/services/InvoiceService.ts';
import LoggingService, { withErrorLogging } from '../_shared/services/loggingService.ts';

const FUNCTION_NAME = 'issue-invoice-manually';
const FUNCTION_VERSION = 'v46.0';

async function mainHandler(
  req: Request,
  logger: LoggingService,
  correlationId: string
): Promise<Response> {
  // --- 1. 初始化 Client 並進行權限驗證 ---
  const { invoiceId } = await req.json().catch(() => ({ invoiceId: null }));
  if (!invoiceId) {
    logger.warn("請求中缺少必要的 'invoiceId' 參數", correlationId);
    return new Response(JSON.stringify({ error: "請求中缺少必要的 'invoiceId' 參數。" }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  
  const supabaseUserClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
  );

  const {
    data: { user },
    error: userError,
  } = await supabaseUserClient.auth.getUser();

  if (userError || !user) {
    logger.warn('使用者認證失敗', correlationId, { error: userError?.message });
    return new Response(JSON.stringify({ error: '使用者未授權或 Token 無效。' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const userPermissions = user.app_metadata?.permissions || [];
  if (!userPermissions.includes('permissions:users:edit')) {
    logger.warn('權限不足，手動開票操作被拒絕', correlationId, {
        userId: user.id,
        invoiceId: invoiceId,
        requiredPermission: 'permissions:users:edit'
    });
    return new Response(JSON.stringify({ error: '權限不足，您無法執行手動開立發票的操作。' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  logger.info('權限驗證通過，準備手動開立發票', correlationId, { userId: user.id, invoiceId });

  // --- 2. 執行前的狀態檢查 ---
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data: invoiceToCheck, error: checkError } = await supabaseAdmin
    .from('invoices')
    .select('status')
    .eq('id', invoiceId)
    .single();

  if (checkError) {
    logger.warn(`找不到指定的發票記錄`, correlationId, { userId: user.id, invoiceId });
    // 直接拋出錯誤，讓 withErrorLogging 處理，但回傳 404 可能更語意化
    return new Response(JSON.stringify({ error: `找不到指定的發票記錄 (ID: ${invoiceId})。` }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  if (!['pending', 'failed'].includes(invoiceToCheck.status)) {
    logger.warn(`發票狀態不符，無法執行開立操作`, correlationId, { userId: user.id, invoiceId, currentStatus: invoiceToCheck.status });
    return new Response(JSON.stringify({ error: `此發票的狀態為 "${invoiceToCheck.status}"，無法執行開立操作。` }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); // 409 Conflict
  }

  // --- 3. 呼叫 InvoiceService 執行核心開票邏輯 ---
  const invoiceService = new InvoiceService(supabaseAdmin, logger, correlationId);
  await invoiceService.issueInvoiceViaAPI(invoiceId);

  // --- 4. 記錄關鍵稽核日誌並回傳成功響應 ---
  logger.audit('手動開立發票流程已成功觸發', correlationId, {
    operatorId: user.id,
    invoiceId: invoiceId,
    previousStatus: invoiceToCheck.status,
  });

  return new Response(
    JSON.stringify({
      success: true,
      message: `發票 (ID: ${invoiceId}) 已成功送交開立。`,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

Deno.serve(async (req) => {
  // 處理 CORS 預檢請求
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const logger = new LoggingService(FUNCTION_NAME, FUNCTION_VERSION);

  // 使用 withErrorLogging 中介軟體包裹主要處理邏輯
  const wrappedHandler = withErrorLogging(mainHandler, logger);
  
  return await wrappedHandler(req);
});