// ==============================================================================
// 檔案路徑: supabase/functions/get-or-create-cart/index.ts
// 版本: v44.0 (購物車訪問權杖生成版)
// 說明: 此版本已完全重構。其核心職責是在建立或獲取購物車時，
//       回傳一個安全的、用於匿名訪問的 `cart_access_token`，
//       這是「堡壘計畫」最終階段的關鍵第一步。
// ==============================================================================

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import LoggingService, { withErrorLogging } from '../_shared/services/loggingService.ts';

const FUNCTION_NAME = 'get-or-create-cart';
const FUNCTION_VERSION = 'v44.0';

async function mainHandler(req: Request, logger: LoggingService, correlationId: string): Promise<Response> {
    const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: { session }, error: sessionError } = await supabaseAdmin.auth.getSession();

    if (sessionError || !session) {
        logger.error('無法獲取 Session', correlationId, sessionError || new Error('No session'));
        return new Response(JSON.stringify({ error: '無法獲取使用者 Session' }), { status: 500, headers: corsHeaders });
    }

    const { user } = session;

    // 嘗試尋找該使用者已存在的、活躍的購物車
    const { data: cart, error: cartError } = await supabaseAdmin
        .from('carts')
        .select('id, access_token') // **【核心修正】** 同時讀取 access_token
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();

    if (cartError) {
        logger.error('查詢購物車時發生資料庫錯誤', correlationId, cartError);
        throw cartError;
    }

    if (cart) {
        logger.info('找到已存在的活躍購物車', correlationId, { cartId: cart.id, userId: user.id });
        return new Response(JSON.stringify({
            cartId: cart.id,
            userId: user.id,
            isAnonymous: user.is_anonymous,
            token: session.access_token,
            cart_access_token: cart.access_token // **【核心修正】** 回傳已存在的權杖
        }), { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
    }

    // 如果找不到，則建立一個新的購物車
    logger.info('未找到活躍購物車，正在為使用者建立新購物車', correlationId, { userId: user.id });
    const { data: newCart, error: createError } = await supabaseAdmin
        .from('carts')
        .insert({ user_id: user.id, status: 'active' })
        .select('id, access_token') // **【核心修正】** 建立時即回傳 access_token
        .single();

    if (createError) {
        logger.error('建立新購物車時發生資料庫錯誤', correlationId, createError);
        throw createError;
    }

    logger.audit('成功建立新購物車', correlationId, { cartId: newCart.id, userId: user.id });
    
    return new Response(JSON.stringify({
        cartId: newCart.id,
        userId: user.id,
        isAnonymous: user.is_anonymous,
        token: session.access_token,
        cart_access_token: newCart.access_token // **【核心修正】** 回傳新生成的權杖
    }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }
    const logger = new LoggingService(FUNCTION_NAME, FUNCTION_VERSION);
    const wrappedHandler = withErrorLogging(mainHandler, logger);
    return await wrappedHandler(req);
});