// 檔案路徑: supabase/functions/get-or-create-cart/index.ts
// ==============================================================================
/**
 * 版本：53.0 (安全閘道重構版)
 * AI 註記：
 * 變更摘要:
 * - 【重構後】程式碼極度簡化。所有 CORS、日誌、錯誤處理的樣板程式碼均已移除。
 * - 【重構後】現在只專注於 `mainHandler` 的核心業務邏輯。
 * - 【重構後】函式啟動方式改為 `Deno.serve(createSecureHandler(...))`，確保所有請求都經過安全閘道處理。
 */
import { createClient } from '@/shared/deps.ts';
import { corsHeaders } from '@/shared/cors.ts';
import { createSecureHandler } from '@/shared/api-gateway.ts';
import LoggingService from '@/shared/services/loggingService.ts';

const FUNCTION_NAME = 'get-or-create-cart';
const FUNCTION_VERSION = 'v53.0';

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