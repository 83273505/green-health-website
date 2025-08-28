// ==============================================================================
// 檔案路徑: supabase/functions/cancel-order/index.ts
// 版本: v1.0 - 訂單取消核心功能
// ------------------------------------------------------------------------------
// 【此為全新檔案，可直接使用】
// ==============================================================================

/**
 * @file Cancel Order Function (取消訂單函式)
 * @description 處理來自後台的訂單取消請求。
 * @version v1.0
 */

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // --- 1. 安全驗證 ---
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    const supabaseUserClient = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );
    
    const { data: { user } } = await supabaseUserClient.auth.getUser();
    // 註：請確保您已在 `permissions` 表中建立 'module:orders:cancel' 權限
    if (!user || !(user.app_metadata?.permissions || []).includes('module:orders:cancel')) {
      return new Response(JSON.stringify({ error: '權限不足，無法取消訂單。' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // --- 2. 參數驗證 ---
    const { orderId, reason } = await req.json();
    if (!orderId || !reason) {
      throw new Error('缺少 orderId 或 reason 參數。');
    }
    if (typeof reason !== 'string' || reason.trim() === '') {
        throw new Error('取消原因不可為空。');
    }

    // --- 3. 呼叫 RPC 函式執行核心邏輯 ---
    console.log(`[Cancel Order] 管理員 ${user.email} 正在嘗試取消訂單 ${orderId}，原因: ${reason}`);
    const { data, error } = await supabaseAdmin.rpc('handle_order_cancellation', {
        p_order_id: orderId,
        p_cancellation_reason: reason
    });

    if (error) {
        // 如果是資料庫函式 RAISE EXCEPTION，錯誤會在這裡被捕獲
        console.error(`[Cancel Order] RPC 執行失敗 for order ${orderId}:`, error);
        throw new Error(`取消訂單失敗：${error.message}`);
    }

    // --- 4. 回傳成功結果 ---
    console.log(`[Cancel Order] 成功取消訂單 ${orderId}`);
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('[cancel-order] 函式發生嚴重錯誤:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400, // 使用 400 表示客戶端請求可能有問題
    });
  }
});