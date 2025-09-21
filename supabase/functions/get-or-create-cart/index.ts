// ==============================================================================
// 檔案路徑: supabase/functions/get-or-create-cart/index.ts
// 版本: v44.2 (外鍵約束遵循 - 最終修正版)
// 說明: 此版本已完全重構。其核心修正是：在為「匿名使用者」建立購物車時，
//       將 user_id 欄位安全地設定為 NULL，以完全遵循資料庫的外鍵約束，
//       從而徹底解決初始化時的 500 錯誤。
// ==============================================================================

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import LoggingService, { withErrorLogging } from '../_shared/services/loggingService.ts';

const FUNCTION_NAME = 'get-or-create-cart';
const FUNCTION_VERSION = 'v44.2';

async function mainHandler(req: Request, logger: LoggingService, correlationId: string): Promise<Response> {
    // 使用 Admin Client 以便能處理匿名與登入兩種 session
    const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 從請求中安全地獲取使用者 session
    const { data: { user }, error: userError } = await supabaseAdmin.auth.admin.getUserByCookie(req);

    if (userError || !user) {
        // 即使是匿名使用者，Supabase 也會為其分配一個 user 物件
        // 如果連 user 物件都拿不到，代表 session 處理出現嚴重問題
        logger.error('無法獲取或解析使用者 Session', correlationId, userError || new Error('No user from cookie'));
        return new Response(JSON.stringify({ error: '無法識別使用者身份' }), { status: 500, headers: corsHeaders });
    }

    const isAnonymousUser = user.is_anonymous;

    // 只有在是「正式會員」時，才嘗試用 user.id 去尋找舊購物車
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

    // **【v44.2 最終核心修正】**
    // 根據 carts 表的綱要，匿名使用者的 user_id 必須為 NULL，
    // 因為匿名 user.id 雖然存在於 JWT 中，但並不存在於 `auth.users` 主表中，
    // 直接寫入將違反 `carts_user_id_fkey` 外鍵約束。
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
        logger.critical('建立新購物車時發生資料庫錯誤', correlationId, createError, { payload: insertPayload });
        throw createError;
    }
    
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