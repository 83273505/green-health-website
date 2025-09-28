// 檔案路徑: supabase/functions/get-or-create-cart/index.ts
// ==============================================================================
/**
 * 版本：53.1 (路徑修正版)
 * AI 註記：
 * - 【v53.1 核心修正】將所有 import 路徑從錯誤的 `@/shared/...` 修正為正確的 `@/_shared/...`
 */
import { createClient } from '@/`_`shared/deps.ts';
import { corsHeaders } from '@/`_`shared/cors.ts';
import { createSecureHandler } from '@/`_`shared/api-gateway.ts';
import LoggingService from '@/`_`shared/services/loggingService.ts';

const FUNCTION_NAME = 'get-or-create-cart';
const FUNCTION_VERSION = 'v53.1';

async function mainHandler(req: Request, logger: LoggingService, correlationId: string): Promise<Response> {
    const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser();

    if (userError || !user) {
        logger.error('無法從 Session 中驗證使用者身份', correlationId, userError || new Error('User is null'));
        return new Response(JSON.stringify({ error: `Session 驗證失敗: ${userError?.message}` }), {
            status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    logger.info('成功驗證使用者 Session', correlationId, { userId: user.id, isAnonymous: user.is_anonymous });

    const { data: existingCart, error: cartError } = await supabaseAdmin.from('carts').select('id, access_token').eq('user_id', user.id).eq('status', 'active').maybeSingle();
    if (cartError) throw cartError;

    if (existingCart) {
        logger.info('找到現有購物車', correlationId, { cartId: existingCart.id, userId: user.id });
        return new Response(JSON.stringify({ cartId: existingCart.id, cart_access_token: existingCart.access_token }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    const { data: newCart, error: createError } = await supabaseAdmin.from('carts').insert({ user_id: user.id, status: 'active' }).select('id, access_token').single();
    if (createError) throw createError;

    logger.audit('成功建立新購物車', correlationId, { cartId: newCart.id, userId: user.id });
    return new Response(JSON.stringify({ cartId: newCart.id, cart_access_token: newCart.access_token }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}

Deno.serve(createSecureHandler(mainHandler, FUNCTION_NAME, FUNCTION_VERSION));