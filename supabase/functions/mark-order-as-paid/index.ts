// ==============================================================================
// 檔案路徑: supabase/functions/mark-order-as-paid/index.ts
// 版本: v3.0 - 企業級日誌與安全稽核整合
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Mark Order as Paid Function (標記訂單為已付款函式)
 * @description 處理後台確認收款的請求，具備 RBAC 權限檢查，
 *              並將核心邏輯委派給資料庫 RPC 函式以確保交易的原子性，
 *              同時自動記錄詳細的操作稽核日誌。
 * @version v3.0
 *
 * @update v3.0 - [ENTERPRISE LOGGING & SECURITY AUDIT INTEGRATION]
 * 1. [核心架構] 引入 `LoggingService` v2.0，完全取代原有的本地 `log()` 函式。
 * 2. [標準化] 所有日誌輸出均遵循平台統一的結構化格式，並由 `correlationId` 貫穿。
 * 3. [錯誤處理優化] 使用 `withErrorLogging` 處理未預期異常，並將業務邏輯錯誤
 *          (RPC 回傳 success: false) 與系統錯誤清晰分離。
 * 4. [安全稽核] 對每一次金融狀態的變更操作都留下了詳細的 `audit` 級別日誌。
 *
 * @permission 呼叫者必須擁有 'warehouse_staff' 或 'super_admin' 角色。
 */

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import LoggingService, { withErrorLogging } from '../_shared/services/loggingService.ts';

const FUNCTION_NAME = 'mark-order-as-paid';
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
  const { orderId, paymentMethod, paymentReference } = await req.json().catch(() => ({}));
  if (!orderId || !paymentMethod) {
    logger.warn('缺少 orderId 或 paymentMethod 參數', correlationId, {
      operatorId: user.id,
      payload: { orderId, paymentMethod },
    });
    return new Response(JSON.stringify({ error: '缺少 orderId 或 paymentMethod 參數' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  
  logger.info('授權成功，準備標記訂單為已付款', correlationId, {
    operatorId: user.id,
    orderId,
    paymentMethod,
    paymentReference
  });

  // --- 3. 執行核心邏輯 (RPC) ---
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const rpcParams = {
    p_order_id: orderId,
    p_operator_id: user.id,
    p_payment_method: paymentMethod,
    p_payment_reference: paymentReference || null,
  };

  const { data, error: rpcError } = await supabaseAdmin.rpc('confirm_order_payment', rpcParams).single();

  if (rpcError) {
    // 系統級錯誤，直接拋出讓 withErrorLogging 處理
    throw rpcError;
  }

  const result = data as { success: boolean; message: string; updated_order: any };

  if (!result.success) {
    // 業務邏輯級錯誤，記錄警告並回傳給前端
    logger.warn('RPC 函式回傳業務邏輯失敗', correlationId, {
      operatorId: user.id,
      orderId,
      rpcResultMessage: result.message,
    });
    
    // 根據 RPC 回傳的訊息決定 HTTP 狀態碼
    const status = 
        result.message.includes('找不到') ? 404 :
        result.message.includes('狀態不符') ? 409 : 400; // 409 Conflict for state mismatch

    return new Response(JSON.stringify({ error: result.message }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // --- 4. 記錄關鍵稽核日誌並回傳成功響應 ---
  logger.audit('訂單已成功標記為已付款', correlationId, {
    operatorId: user.id,
    orderId: orderId,
    details: rpcParams,
  });

  return new Response(JSON.stringify({ success: true, updatedOrder: result.updated_order }), {
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