// 檔案路徑: supabase/functions/get-cart-snapshot/index.ts
// ==============================================================================
/**
 * 版本: v54.0 (主席外部情資整合版)
 * AI 註記：
 * - 【v54.0 核心修正】新增了處理 CORS `OPTIONS` 預檢請求的邏輯。
 * - 【v54.0 核心修正】移除了對已廢止的 `api-gateway.ts` 的所有依賴。
 * - 【v54.0 核心修正】修正了所有 `import` 路徑，確保 `@/_shared/` 的正確性。
 */
import { createClient } from '@/_shared/deps.ts';
import { corsHeaders } from '@/_shared/cors.ts';
import LoggingService, { withErrorLogging } from '@/_shared/services/loggingService.ts';

const FUNCTION_NAME = 'get-cart-snapshot';
const FUNCTION_VERSION = 'v54.0';

async function mainHandler(req: Request, logger: LoggingService, correlationId: string): Promise<Response> {
    const { cartId, couponCode, shippingMethodId } = await req.json().catch(() => ({}));
    const cartAccessToken = req.headers.get('X-Cart-Token');

    if (!cartId || !cartAccessToken) {
        logger.warn('請求中缺少 cartId 或 X-Cart-Token', correlationId, { cartId: !!cartId, cartToken: !!cartAccessToken });
        return new Response(JSON.stringify({ error: '缺少 cartId 或 X-Cart-Token' }), { status: 400, headers: corsHeaders });
    }

    const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL')!, 
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: cart, error: ownerError } = await supabaseAdmin.from('carts').select('id').eq('id', cartId).eq('access_token', cartAccessToken).maybeSingle();
    if (ownerError) {
        logger.error('驗證購物車所有權時發生資料庫錯誤', correlationId, ownerError, { cartId });
        return new Response(JSON.stringify({ error: '伺服器內部錯誤' }), { status: 500, headers: corsHeaders });
    }
    if (!cart) {
        logger.warn('購物車不存在或訪問權杖無效', correlationId, { cartId });
        return new Response(JSON.stringify({ error: '購物車不存在或訪問權杖無效' }), { status: 404, headers: corsHeaders });
    }

    const { data, error } = await supabaseAdmin.rpc('get_cart_snapshot', {
        p_cart_id: cartId,
        p_coupon_code: couponCode || null,
        p_shipping_method_id: shippingMethodId || null
    });

    if (error) {
        logger.error('呼叫 get_cart_snapshot RPC 失敗', correlationId, error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
    }

    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
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