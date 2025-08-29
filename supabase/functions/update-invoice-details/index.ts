// ==============================================================================
// 檔案路徑: supabase/functions/update-invoice-details/index.ts
// 版本: v48.0 - 企業級日誌與安全稽核整合
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Update Invoice Details Function (更新發票詳情函式)
 * @description 處理來自後台的發票資料更新請求，包含修正與手動校正。
 * @version v48.0
 *
 * @update v48.0 - [ENTERPRISE LOGGING & SECURITY AUDIT INTEGRATION]
 * 1. [核心架構] 引入 `LoggingService` v2.0，並使用 `withErrorLogging` 處理異常。
 * 2. [安全稽核日誌] 對每一次發票資料的更新操作都留下了詳細的 `audit` 級別日誌，
 *          記錄了操作者、目標發票ID以及所有被變更的欄位與新值。
 * 3. [異常監控] 對於嘗試更新白名單之外欄位的行為，增加了 `warn` 級別日誌，
 *          便於監控潛在的異常請求。
 *
 * @update v47.2 - [AUTHORIZE MANUAL VOID]
 * 1. [功能閉環] 在 `allowedFields` 安全白名單中，新增了 `void_reason` 和
 *          `voided_at` 兩個欄位，授權前端手動標示為作廢的操作權限。
 */

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import LoggingService, { withErrorLogging } from '../_shared/services/loggingService.ts';

const FUNCTION_NAME = 'update-invoice-details';
const FUNCTION_VERSION = 'v48.0';

const allowedFields = [
  'vat_number', 'company_name',
  'carrier_type', 'carrier_number',
  'donation_code',
  'invoice_number', 'random_number', 'status', 'issued_at',
  'void_reason', 'voided_at'
];

async function mainHandler(req: Request, logger: LoggingService, correlationId: string): Promise<Response> {
  // --- 1. 權限驗證 ---
  const supabaseUserClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
  );
  const { data: { user } } = await supabaseUserClient.auth.getUser();
  if (!user || !(user.app_metadata?.permissions || []).includes('module:invoicing:view')) {
    logger.warn('權限不足，操作被拒絕', correlationId, { callerUserId: user?.id });
    return new Response(JSON.stringify({ error: '權限不足。' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // --- 2. 輸入驗證與過濾 ---
  const { invoiceId, updates } = await req.json().catch(() => ({}));
  if (!invoiceId || !updates || typeof updates !== 'object') {
    logger.warn('缺少 invoiceId 或 updates 物件', correlationId, { operatorId: user.id });
    return new Response(JSON.stringify({ error: '缺少 invoiceId 或 updates 物件。' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  
  logger.info('授權成功，準備更新發票資料', correlationId, { operatorId: user.id, invoiceId });

  const filteredUpdates: { [key: string]: any } = {};
  for (const key in updates) {
    if (allowedFields.includes(key)) {
      filteredUpdates[key] = updates[key];
    } else {
      logger.warn(`偵測到不允許的欄位更新嘗試: ${key}`, correlationId, { operatorId: user.id, invoiceId, attemptedField: key });
      return new Response(JSON.stringify({ error: `不允許的欄位: ${key}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  if (Object.keys(filteredUpdates).length === 0) {
    logger.warn('沒有提供任何有效的更新欄位', correlationId, { operatorId: user.id, invoiceId });
    return new Response(JSON.stringify({ error: '沒有提供任何有效的更新欄位。' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  filteredUpdates.updated_at = new Date().toISOString();
  
  // --- 3. 執行資料庫更新 ---
  const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data, error } = await supabaseAdmin
    .from('invoices')
    .update(filteredUpdates)
    .eq('id', invoiceId)
    .select()
    .single();

  if (error) throw error; // 由 withErrorLogging 捕捉

  // --- 4. 記錄稽核日誌並回傳成功響應 ---
  logger.audit('發票資料已成功手動更新', correlationId, {
    operatorId: user.id,
    invoiceId: invoiceId,
    updatedFields: filteredUpdates,
  });

  return new Response(JSON.stringify({ success: true, data, message: '發票資料已成功更新。' }), {
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