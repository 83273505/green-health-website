// ==============================================================================
// 檔案路徑: supabase/functions/cancel-order/index.ts
// 版本: v1.2 - RBAC+錯誤碼一致化+冪等回應
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================
import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';

const ALLOWED_ROLES = ['warehouse_staff', 'super_admin'] as const;

type CancelResult = { success: boolean; message: string };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const supabaseUserClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user } } = await supabaseUserClient.auth.getUser();
    const roles: string[] = user?.app_metadata?.roles || [];
    const isAuthorized = roles.some(r => ALLOWED_ROLES.includes(r as any));

    if (!user || !isAuthorized) {
      return new Response(JSON.stringify({ error: 'FORBIDDEN: 權限不足，無法取消訂單。' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { orderId, reason } = await req.json();
    if (!orderId || typeof orderId !== 'string') {
      throw new Error('BAD_REQUEST: 缺少有效的 orderId。');
    }
    if (!reason || typeof reason !== 'string' || reason.trim() === '') {
      throw new Error('BAD_REQUEST: 取消原因不可為空。');
    }

    console.log(`[Cancel Order] by ${user.email} roles=${roles.join(',')} orderId=${orderId} reason="${reason}"`);

    const { data, error } = await supabaseAdmin.rpc('handle_order_cancellation', {
      p_order_id: orderId,
      p_cancellation_reason: reason.trim(),
    });

    if (error) {
      // 將 DB 錯誤訊息透過一致化錯誤碼回應
      const msg = error.message || 'UNKNOWN_ERROR';
      console.error('[Cancel Order] RPC Error:', msg);
      throw new Error(`RPC_ERROR: ${msg}`);
    }

    const result = (data ?? {}) as CancelResult;
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('[cancel-order] Unhandled:', err);
    const message = typeof err?.message === 'string' ? err.message : 'UNEXPECTED_ERROR';
    const status =
      message.startsWith('FORBIDDEN') ? 403 :
      message.startsWith('BAD_REQUEST') ? 400 :
      message.startsWith('RPC_ERROR') ? 502 : 400;

    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});