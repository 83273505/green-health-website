// ==============================================================================
// 檔案路徑: supabase/functions/manage-cart/index.ts
// ==============================================================================

/**
 * 檔案名稱：index.ts
 * 檔案職責：作為購物車管理的單一權威 API 端點。
 * 版本：1.0
 * AI 註記：
 * - [核心架構]: 此函式是「協調者」，負責驗證請求、授權，然後單次呼叫 `atomic_manage_cart` RPC
 *   來執行所有核心業務邏輯，最後將 RPC 的結果直接透傳給前端。
 * - [廢棄]: 此函式取代了舊的 `recalculate-cart` 函式。
 */
import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import LoggingService, { withErrorLogging } from '../_shared/services/loggingService.ts';

const FUNCTION_NAME = 'manage-cart';
const FUNCTION_VERSION = 'v1.0';

async function mainHandler(req: Request, logger: LoggingService, correlationId: string): Promise<Response> {
    const { cartId, actions, couponCode, shippingMethodId } = await req.json().catch(() => ({}));

    if (!cartId) {
        logger.warn('請求中缺少 cartId', correlationId);
        return new Response(JSON.stringify({ success: false, error: { message: '缺少 cartId', code: 'INVALID_REQUEST' } }), 
            { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseUserClient = createClient(
        Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );
    const { data: { user } } = await supabaseUserClient.auth.getUser();
    if (!user) {
        logger.warn('使用者未授權', correlationId, { cartId });
        return new Response(JSON.stringify({ success: false, error: { message: '使用者未授權', code: 'UNAUTHORIZED' } }), 
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data, error } = await supabaseAdmin.rpc('atomic_manage_cart', {
        p_cart_id: cartId,
        p_user_id: user.id,
        p_actions: actions || [],
        p_coupon_code: couponCode || null,
        p_shipping_method_id: shippingMethodId || null
    });

    if (error) {
        logger.error('呼叫 atomic_manage_cart RPC 時發生錯誤', correlationId, error);
        const isInsufficientStock = error.message.includes('INSUFFICIENT_STOCK');
        const cleanMessage = error.message.replace(/.*ERROR:  /, '').replace(/CONTEXT:.*/s, '').trim();
        
        return new Response(JSON.stringify({ 
            success: false, 
            error: { 
                message: cleanMessage, 
                code: isInsufficientStock ? 'INSUFFICIENT_STOCK' : 'DB_ERROR' 
            }
        }), { status: isInsufficientStock ? 409 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: true, data }), 
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') { return new Response('ok', { headers: corsHeaders }); }
    const logger = new LoggingService(FUNCTION_NAME, FUNCTION_VERSION);
    const wrappedHandler = withErrorLogging(mainHandler, logger);
    return await wrappedHandler(req);
});