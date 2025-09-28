// 檔案路徑: supabase/functions/get-cart-snapshot/index.ts
// ==============================================================================
/**
 * 版本: v53.1 (路徑修正版)
 * AI 註記：
 * - 【v53.1 核心修正】將所有 import 路徑從錯誤的 `@/shared/...` 修正為正確的 `@/_shared/...`
 */
import { createClient } from '@/`_`shared/deps.ts';
import { corsHeaders } from '@/`_`shared/cors.ts';
import { createSecureHandler } from '@/`_`shared/api-gateway.ts';
import LoggingService from '@/`_`shared/services/loggingService.ts';

const FUNCTION_NAME = 'get-cart-snapshot';
const FUNCTION_VERSION = 'v53.1';

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

Deno.serve(createSecureHandler(mainHandler, FUNCTION_NAME, FUNCTION_VERSION));