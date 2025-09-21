// ==============================================================================
// 檔案路徑: supabase/functions/get-or-create-cart/index.ts
// 版本: v45.0 (健壯初始化 - 最終決定版)
// 說明: 此版本是為了解決所有初始化失敗問題而設計的最終方案。
//       它採用了更直接、更具防禦性的邏輯，確保任何使用者在任何情況下，
//       都能成功獲得一個有效的購物車憑證。
// ==============================================================================

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import LoggingService from '../_shared/services/loggingService.ts';

// 注意：此函式極其關鍵，我們不使用 withErrorLogging，而是採用手動的、
//       更精細的 try/catch 結構，以確保即使日誌服務失敗，也能回傳有意義的錯誤。
const FUNCTION_NAME = 'get-or-create-cart';
const FUNCTION_VERSION = 'v45.0';

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const logger = new LoggingService(FUNCTION_NAME, FUNCTION_VERSION);
    const correlationId = logger.generateCorrelationId();

    try {
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        );

        // 步驟 1: 嘗試從請求中獲取使用者。
        const { data: { user } } = await supabaseAdmin.auth.admin.getUserByCookie(req);

        // 如果連一個 user 物件（即便是匿名的）都拿不到，這是一個嚴重的 Session 問題。
        if (!user) {
            throw new Error('無法從 Supabase Auth 獲取使用者 Session。');
        }

        const isAnonymousUser = user.is_anonymous;

        // 步驟 2: 如果是「正式會員」，優先尋找已存在的購物車
        if (!isAnonymousUser) {
            const { data: cart, error: cartError } = await supabaseAdmin
                .from('carts')
                .select('id, access_token')
                .eq('user_id', user.id)
                .eq('status', 'active')
                .maybeSingle();

            if (cartError) throw cartError;

            if (cart) {
                logger.info('找到已登入使用者的活躍購物車', correlationId, { cartId: cart.id, userId: user.id });
                const { data: { session } } = await supabaseAdmin.auth.getSession();
                return new Response(JSON.stringify({
                    cartId: cart.id,
                    cart_access_token: cart.access_token,
                    token: session?.access_token,
                }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }
        }

        // 步驟 3: 如果是「匿名使用者」，或「已登入但沒有購物車的會員」，則建立一個新的購物車
        logger.info('為使用者建立新購物車', correlationId, { userId: user.id, isAnonymous: isAnonymousUser });
        
        // **【v45.0 最終核心修正】**
        // 根據 carts 表綱要，匿名使用者的 user_id 必須為 NULL，
        // 因為匿名 user.id 雖然存在於 JWT 中，但並不存在於 `auth.users` 主表中，
        // 強行寫入將違反 `carts_user_id_fkey` 外鍵約束。
        const insertPayload = {
            user_id: isAnonymousUser ? null : user.id,
            status: 'active'
        };
        
        const { data: newCart, error: createError } = await supabaseAdmin
            .from('carts')
            .insert(insertPayload)
            .select('id, access_token')
            .single();

        if (createError) throw createError;

        const { data: { session } } = await supabaseAdmin.auth.getSession();
        logger.audit('成功建立新購物車', correlationId, { cartId: newCart.id, userId: user?.id });
        
        return new Response(JSON.stringify({
            cartId: newCart.id,
            cart_access_token: newCart.access_token,
            token: session?.access_token,
        }), { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });

    } catch (error) {
        logger.critical('get-or-create-cart 發生致命錯誤', correlationId, error);
        return new Response(JSON.stringify({ 
            error: '無法初始化購物車，請稍後再試。',
            details: error.message 
        }), { 
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});