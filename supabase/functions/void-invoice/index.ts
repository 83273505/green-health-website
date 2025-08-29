// ==============================================================================
// 檔案路徑: supabase/functions/void-invoice/index.ts
// 版本: v46.0 - 企業級日誌與安全稽核整合
// ------------------------------------------------------------------------------
// 【此為全新檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Void Invoice Function (作廢發票函式)
 * @description 發票管理後台的核心操作功能之一。允許授權使用者對處於
 *              'issued' (已開立) 狀態的發票，手動觸發作廢流程。
 * @version v46.0
 *
 * @update v46.0 - [ENTERPRISE LOGGING & SECURITY AUDIT INTEGRATION]
 * 1. [核心架構] 引入 `LoggingService` v2.0，取代所有 `console.*` 呼叫。
 * 2. [全域錯誤捕捉] 使用 `withErrorLogging` 中介軟體處理未預期異常。
 * 3. [安全稽核日誌] 對每一次手動發票作廢的嘗試都進行了詳細的 `audit` 級別日誌
 *          記錄，包括操作者、目標發票ID、作廢原因及最終操作結果。
 * 4. [追蹤 ID] 整個請求生命週期由 `correlationId` 貫穿，為高風險操作提供
 *          了完整的可追溯性。
 *
 * @update v45.0 - 初始版本，建立安全閘道並委派給 InvoiceService。
 */

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { InvoiceService } from '../_shared/services/InvoiceService.ts';
import LoggingService, { withErrorLogging } from '../_shared/services/loggingService.ts';

const FUNCTION_NAME = 'void-invoice';
const FUNCTION_VERSION = 'v46.0';

async function mainHandler(req: Request, logger: LoggingService, correlationId: string): Promise<Response> {
  // --- 1. 初始化 Client 並進行權限驗證 ---
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
  );

  const { data: { user } } = await supabaseAdmin.auth.getUser();
  if (!user) {
    logger.warn('使用者認證失敗 (無效 Token)', correlationId);
    return new Response(JSON.stringify({ error: '使用者未授權或 Token 無效。' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const userPermissions = user.app_metadata?.permissions || [];
  if (!userPermissions.includes('permissions:users:edit')) {
    logger.warn('權限不足，作廢發票操作被拒絕', correlationId, {
        userId: user.id,
        requiredPermission: 'permissions:users:edit'
    });
    return new Response(JSON.stringify({ error: '權限不足，您無法執行作廢發票的操作。' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // --- 2. 解析前端傳來的參數 ---
  const { invoiceId, reason } = await req.json().catch(() => ({}));
  if (!invoiceId || !reason) {
    logger.warn('缺少 invoiceId 或 reason 參數', correlationId, { operatorId: user.id });
    return new Response(JSON.stringify({ error: "請求中缺少必要的 'invoiceId' 或 'reason' 參數。" }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (reason.length > 20) {
    logger.warn('作廢原因長度超過限制', correlationId, { operatorId: user.id, reason });
    return new Response(JSON.stringify({ error: "作廢原因長度不可超過 20 個字。" }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  
  logger.info('權限驗證通過，準備作廢發票', correlationId, { operatorId: user.id, invoiceId, reason });

  // --- 3. 執行前的狀態檢查 ---
  const { data: invoiceToCheck, error: checkError } = await supabaseAdmin
    .from('invoices')
    .select('status')
    .eq('id', invoiceId)
    .single();

  if (checkError) {
    logger.warn(`找不到指定的發票記錄`, correlationId, { operatorId: user.id, invoiceId });
    return new Response(JSON.stringify({ error: `找不到指定的發票記錄 (ID: ${invoiceId})。` }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  if (invoiceToCheck.status !== 'issued') {
    logger.warn(`發票狀態不符，無法執行作廢操作`, correlationId, { operatorId: user.id, invoiceId, currentStatus: invoiceToCheck.status });
    return new Response(JSON.stringify({ error: `此發票的狀態為 "${invoiceToCheck.status}"，無法執行作廢操作。` }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // --- 4. 呼叫 InvoiceService 執行核心作廢邏輯 ---
  const invoiceService = new InvoiceService(supabaseAdmin, logger, correlationId);
  await invoiceService.voidInvoiceViaAPI(invoiceId, reason);

  // --- 5. 記錄關鍵稽核日誌並回傳成功響應 ---
  logger.audit('發票作廢流程已成功觸發', correlationId, {
    operatorId: user.id,
    invoiceId: invoiceId,
    reason: reason,
  });

  return new Response(
    JSON.stringify({
      success: true,
      message: `發票 (ID: ${invoiceId}) 已成功送交作廢。`,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
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