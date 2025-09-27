// 檔案路徑: supabase/functions/manage-cart/index.ts
// ==============================================================================
/**
 * 版本：53.0 (安全閘道重構版)
 */
import { createClient } from '@/shared/deps.ts';
import { corsHeaders } from '@/shared/cors.ts';
import { createSecureHandler } from '@/shared/api-gateway.ts';
import LoggingService from '@/shared/services/loggingService.ts';

const FUNCTION_NAME = 'manage-cart-command';
const FUNCTION_VERSION = 'v53.0';

async function mainHandler(req: Request, logger: LoggingService, correlationId: string): Promise<Response> {
    const { cartId, action } = await req.json().catch(() => ({}));

    if (!cartId || !action) {
        return new Response(JSON.stringify({ success: false, error: '缺少 cartId 或 action' }), { status: 422, headers: corsHeaders });
    }

    const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );
    const { data: { user } } = await supabaseAdmin.auth.getUser();
    if (!user) {
        return new Response(JSON.stringify({ success: false, error: '使用者未授權或 Token 無效' }), { status: 401, headers: corsHeaders });
    }
    
    const { data, error } = await supabaseAdmin.rpc('atomic_modify_cart', {
        p_cart_id: cartId,
        p_user_id: user.id,
        p_action: action
    });

    if (error) {
        logger.error('呼叫 atomic_modify_cart RPC 失敗', correlationId, error);
        const errorMessage = error.message.toLowerCase();
        if (errorMessage.includes('cart_not_found_or_forbidden')) {
            return new Response(JSON.stringify({ success: false, error: '購物車不存在或無權限操作' }), { status: 404, headers: corsHeaders });
        }
        if (errorMessage.includes('insufficient_stock')) {
            return new Response(JSON.stringify({ success: false, error: '商品庫存不足' }), { status: 409, headers: corsHeaders });
        }
        return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ success: true, data }), { status: 200, headers: corsHeaders });
}

Deno.serve(createSecureHandler(mainHandler, FUNCTION_NAME, FUNCTION_VERSION));