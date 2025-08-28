// ==============================================================================
// 檔案路徑: supabase/functions/cancel-order/index.ts
// 版本: v1.1 - 基於角色的權限收官版
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Cancel Order Function (取消訂單函式)
 * @description 處理來自後台的訂單取消請求。
 * @version v1.1
 * 
 * @update v1.1 - [ROLE-BASED PERMISSION CHECK]
 * 1. [核心修正] 權限檢查邏輯從檢查抽象的 `permissions` 陣列，升級為
 *          直接檢查使用者是否具備 `warehouse_staff` 或 `super_admin` 角色。
 * 2. [優勢] 此修改與現有的 RBAC (基於角色的存取控制) 系統完美融合，
 *          簡化了未來的權限管理，只需為使用者指派正確角色即可。
 */

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';

// [v1.1] 定義允許執行此操作的角色列表
const ALLOWED_ROLES = ['warehouse_staff', 'super_admin'];

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
    
    // [v1.1] 使用基於角色的權限檢查
    const userRoles = user?.app_metadata?.roles || [];
    const isAuthorized = userRoles.some(role => ALLOWED_ROLES.includes(role));

    if (!user || !isAuthorized) {
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
    console.log(`[Cancel Order] 管理員 ${user.email} (角色: ${userRoles.join(',')}) 正在嘗試取消訂單 ${orderId}，原因: ${reason}`);
    const { data, error } = await supabaseAdmin.rpc('handle_order_cancellation', {
        p_order_id: orderId,
        p_cancellation_reason: reason
    });

    if (error) {
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
      status: 400,
    });
  }
});