// ==============================================================================
// 檔案路徑: supabase/functions/get-cart-snapshot/index.ts
// 版本: v5.0 (信任反轉閘道 - 最終版)
// 說明: 此版本已完全重構，不再依賴不可靠的匿名 JWT。它透過一個自訂的
//       `X-Cart-Token` 標頭來接收安全的「購物車訪問權杖」，並在函式
//       內部執行權威的所有權驗證，是「堡壘計畫」安全架構的核心。
// ==============================================================================

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import LoggingService, { withErrorLogging } from '../_shared/services/loggingService.ts';

const FUNCTION_NAME = 'get-cart-snapshot';
const FUNCTION_VERSION = 'v5.0';

async function mainHandler(req: Request, logger: LoggingService, correlationId: string): Promise<Response> {
    const { cartId, couponCode, shippingMethodId } = await req.json().catch(() => ({}));
    const cartAccessToken = req.headers.get('X-Cart-Token'); // **【核心修正】** 從自訂標頭讀取權杖

    if (!cartId || !cartAccessToken) {
        logger.warn('請求中缺少 cartId 或 X-Cart-Token', correlationId, { cartId: !!cartId, cartToken: !!cartAccessToken });
        return new Response(JSON.stringify({ error: '缺少 cartId 或 X-Cart-Token' }), { status: 400, headers: corsHeaders });
    }

    // 使用 Admin Client 來執行權威驗證
    const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL')!, 
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // **【核心修正】** 不再依賴 RLS，直接在程式碼中進行權威驗證
    // 驗證 cartId 和 access_token 是否匹配
    const { data: cart, error: ownerError } = await supabaseAdmin
        .from('carts')
        .select('id')
        .eq('id', cartId)
        .eq('access_token', cartAccessToken)
        .maybeSingle();
    
    if (ownerError) {
        logger.error('驗證購物車所有權時發生資料庫錯誤', correlationId, ownerError, { cartId });
        return new Response(JSON.stringify({ error: '伺服器內部錯誤' }), { status: 500, headers: corsHeaders });
    }
    
    if (!cart) {
        logger.warn('購物車不存在或訪問權杖無效', correlationId, { cartId });
        return new Response(JSON.stringify({ error: '購物車不存在或訪問權杖無效' }), { status: 404, headers: corsHeaders });
    }

    // 權限已在上方被驗證，現在可以安全地呼叫 RPC
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

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }
    try {
        const logger = new LoggingService(FUNCTION_NAME, FUNCTION_VERSION);
        const wrappedHandler = withErrorLogging(mainHandler, logger);
        return await wrappedHandler(req);
    } catch (e) {
        console.error("Critical error during function initialization:", e);
        return new Response(JSON.stringify({ error: "Internal Server Error" }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
    }
});