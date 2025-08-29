// ==============================================================================
// 檔案路徑: supabase/functions/cancel-order/index.ts
// 版本: v2.0 - 強化日誌與授權驗證
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Cancel Order Function (取消訂單函式)
 * @description 處理後台取消訂單的請求。此函式具備 RBAC 權限檢查，
 *              並將核心業務邏輯委派給資料庫中的 RPC 函式 `handle_order_cancellation` 處理，
 *              以確保資料操作的原子性與一致性。
 * @version v2.0
 *
 * @permission 呼叫者必須擁有 'warehouse_staff' 或 'super_admin' 角色。
 *
 * @param {string} orderId - 要取消的訂單 UUID。
 * @param {string} reason - 取消訂單的原因描述。
 *
 * @returns {object} 成功時回傳 { success: true, message: '...' }。
 * @returns {object} 失敗時回傳 { error: '...' } 並伴隨對應的 HTTP 狀態碼。
 *
 * @error_codes
 *  - 400 BAD_REQUEST: 請求參數缺失或格式錯誤。
 *  - 401 UNAUTHORIZED: 未提供或無效的 JWT token。
 *  - 403 FORBIDDEN: 使用者權限不足。
 *  - 502 RPC_ERROR: 資料庫 RPC 函式執行失敗，可能為業務邏輯錯誤 (如訂單狀態不符)。
 *  - 500 UNEXPECTED_ERROR: 未知的伺服器內部錯誤。
 */

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';

// 定義允許執行此操作的角色
const ALLOWED_ROLES = ['warehouse_staff', 'super_admin'];

// 輔助函式：用於產生結構化的日誌
function log(level: 'INFO' | 'WARN' | 'ERROR', message: string, context: object = {}) {
  console.log(
    JSON.stringify({
      level,
      timestamp: new Date().toISOString(),
      function: 'cancel-order',
      message,
      ...context,
    })
  );
}

Deno.serve(async (req) => {
  // 處理 CORS 預檢請求
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let userContext = { email: 'unknown', id: 'unknown', roles: '[]' };

  try {
    // --- 1. 初始化 Supabase 客戶端 ---
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const authorization = req.headers.get('Authorization')!;
    if (!authorization) {
      throw new Error('UNAUTHORIZED: 缺少授權標頭。');
    }

    const supabaseUserClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authorization } } }
    );

    // --- 2. 授權驗證 (Authorization) ---
    const {
      data: { user },
      error: userError,
    } = await supabaseUserClient.auth.getUser();
    if (userError || !user) {
      throw new Error('UNAUTHORIZED: 無效的使用者憑證。');
    }

    const roles: string[] = user.app_metadata?.roles || [];
    userContext = { email: user.email!, id: user.id, roles: JSON.stringify(roles) };
    const isAuthorized = roles.some((r) => ALLOWED_ROLES.includes(r));

    if (!isAuthorized) {
      log('WARN', '權限不足，操作被拒絕。', userContext);
      throw new Error('FORBIDDEN: 權限不足，無法取消訂單。');
    }
    log('INFO', '授權成功。', userContext);

    // --- 3. 輸入驗證 (Input Validation) ---
    const { orderId, reason } = await req.json();
    if (!orderId || typeof orderId !== 'string') {
      throw new Error('BAD_REQUEST: 缺少有效的 orderId。');
    }
    if (!reason || typeof reason !== 'string' || reason.trim() === '') {
      throw new Error('BAD_REQUEST: 取消原因不可為空。');
    }
    log('INFO', '輸入驗證通過。', { ...userContext, orderId, reason });

    // --- 4. 執行核心業務邏輯 (RPC) ---
    const { data, error: rpcError } = await supabaseAdmin.rpc('handle_order_cancellation', {
      p_order_id: orderId,
      p_cancellation_reason: reason.trim(),
      p_operator_id: user.id, // 傳遞操作者 ID 以供日誌記錄
    });

    if (rpcError) {
      const dbErrorMessage = rpcError.message || 'UNKNOWN_DB_ERROR';
      log('ERROR', '資料庫 RPC 函式執行失敗。', { ...userContext, orderId, dbError: dbErrorMessage });
      throw new Error(`RPC_ERROR: ${dbErrorMessage}`);
    }

    log('INFO', '訂單取消成功。', { ...userContext, orderId, result: data });

    // --- 5. 回傳成功響應 ---
    return new Response(JSON.stringify(data || { success: true, message: '操作成功完成。' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    const message = typeof err?.message === 'string' ? err.message : 'UNEXPECTED_ERROR';
    const status =
      message.startsWith('BAD_REQUEST') ? 400 :
      message.startsWith('UNAUTHORIZED') ? 401 :
      message.startsWith('FORBIDDEN') ? 403 :
      message.startsWith('RPC_ERROR') ? 502 : 500; // 502 Bad Gateway 很適合表示上游 (DB) 錯誤

    log('ERROR', '函式執行時發生未處理的錯誤。', { ...userContext, error: message, status });

    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});