// ==============================================================================
// 檔案路徑: supabase/functions/get-or-create-cart/index.ts
// 版本: v44.1 (匿名使用者外鍵約束修正版)
// 說明: 此版本已完全重構。其核心修正是：在為匿名使用者建立購物車時，
//       將 user_id 欄位安全地設定為 NULL，以符合資料庫的外鍵約束，
//       從而徹底解決初始化時的 500 錯誤。
// ==============================================================================

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import LoggingService, { withErrorLogging } from '../_shared/services/loggingService.ts';

const FUNCTION_NAME = 'get-or-create-cart';
const FUNCTION_VERSION = 'v44.1';

async function mainHandler(req: Request, logger: LoggingService, correlationId: string): Promise<Response> {
    const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 授權標頭現在是可選的，因為我們需要處理首次訪問的匿名使用者
    const authHeader = req.headers.get('Authorization');
    
    const { data: { user }, error: userError } = await supabaseAdmin.auth.admin.getUserByCookie(req);

    if (userError || !user) {
        logger.error('無法獲取或解析使用者', correlationId, userError || new Error('No user from cookie'));
        // 即使獲取用戶失敗，我們依然可以嘗試為其建立一個完全匿名的購物車
        // 但此處我們先返回錯誤，以觀察是否為預期行為
        return new Response(JSON.stringify({ error: '無法識別使用者身份' }), { status: 401, headers: corsHeaders });
    }

    // 核心邏輯：區分正式會員與匿名訪客
    const isAnonymousUser = user.is_anonymous;

    // 嘗試尋找該使用者已存在的、活躍的購物車
    // 只有在是「正式會員」時，我們才嘗試用 user.id 去尋找舊購物車
    if (!isAnonymousUser) {
        const { data: cart, error: cartError } = await supabaseAdmin
            .from('carts')
            .select('id, access_token')
            .eq('user_id', user.id)
            .eq('status', 'active')
            .maybeSingle();

        if (cartError) {
            logger.error('查詢已登入使用者的購物車時發生錯誤', correlationId, cartError, { userId: user.id });
            throw cartError;
        }

        if (cart) {
            logger.info('找到已登入使用者的活躍購物車', correlationId, { cartId: cart.id, userId: user.id });
            const { data: { session } } = await supabaseAdmin.auth.getSession();
            return new Response(JSON.stringify({
                cartId: cart.id,
                userId: user.id,
                isAnonymous: false,
                token: session?.access_token,
                cart_access_token: cart.access_token
            }), { 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            });
        }
    }

    // 如果是匿名使用者，或已登入使用者但沒有活躍購物車，則建立一個新的
    logger.info('為使用者建立新購物車', correlationId, { userId: user.id, isAnonymous: isAnonymousUser });

    // **【v44.1 CORE FIX】**
    // 關鍵修正：如果是匿名使用者，user_id 必須為 NULL，因為匿名 user.id 不存在於 auth.users 表中。
    const insertPayload = {
        user_id: isAnonymousUser ? null : user.id,
        status: 'active'
    };
    
    const { data: newCart, error: createError } = await supabaseAdmin
        .from('carts')
        .insert(insertPayload)
        .select('id, access_token')
        .single();

    if (createError) {
        logger.error('建立新購物車時發生資料庫錯誤', correlationId, createError, { payload: insertPayload });
        throw createError;
    }
    
    // 為新建立的購物車生成一個臨時的 JWT Session 以便後續操作
    const { data: sessionData, error: sessionError } = await supabaseAdmin.auth.getSession();
    if(sessionError) {
        logger.warn('建立購物車後，獲取 Session 失敗', correlationId, sessionError);
    }

    logger.audit('成功建立新購物車', correlationId, { cartId: newCart.id, userId: user.id, isAnonymous: isAnonymousUser });
    
    return new Response(JSON.stringify({
        cartId: newCart.id,
        userId: user.id, // 依然回傳匿名 ID 供前端識別
        isAnonymous: isAnonymousUser,
        token: sessionData?.session?.access_token,
        cart_access_token: newCart.access_token
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