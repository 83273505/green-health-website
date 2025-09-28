// 檔案路徑: supabase/functions/manage-cart/index.ts
// ==============================================================================
/**
 * 版本：54.0 (主席外部情資整合版)
 * AI 註記：
 * - 【v54.0 核心修正】新增了處理 CORS `OPTIONS` 預檢請求的邏輯。
 * - 【v54.0 核心修正】移除了對已廢止的 `api-gateway.ts` 的所有依賴。
 * - 【v54.0 核心修正】修正了所有 `import` 路徑，確保 `@/_shared/` 的正確性。
 */
import { createClient } from '@/_shared/deps.ts';
import { corsHeaders } from '@/_shared/cors.ts';
import LoggingService, { withErrorLogging } from '@/_shared/services/loggingService.ts';

const FUNCTION_NAME = 'manage-cart-command';
const FUNCTION_VERSION = 'v54.0';

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

// 【v54.0 核心修正】
Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }
    const logger = new LoggingService(FUNCTION_NAME, FUNCTION_VERSION);
    const wrappedHandler = withErrorLogging(mainHandler, logger);
    return await wrappedHandler(req);
});