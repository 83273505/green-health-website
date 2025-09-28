// 檔案路徑: supabase/functions/get-or-create-cart/index.ts
// ==============================================================================
/**
 * 版本：54.0 (主席外部情資整合版)
 * AI 註記：
 * - 【v54.0 核心修正】完全採納主席發現的 GitHub 解決方案。
 * - 【v54.0 核心修正】在 `Deno.serve` 入口處，新增了處理 CORS `OPTIONS` 預檢請求的邏輯，
 *   這是解決 `net::ERR_FAILED` 的關鍵。
 * - 【v54.0 核心修正】移除了對已廢止的 `api-gateway.ts` 的所有依賴，回歸 Deno 原生寫法。
 * - 【v54.0 核心修正】修正了所有 `import` 路徑，確保 `@/_shared/` 的正確性。
 */
import { createClient } from '@/_shared/deps.ts';
import { corsHeaders } from '@/_shared/cors.ts';
import LoggingService, { withErrorLogging } from '@/_shared/services/loggingService.ts';

const FUNCTION_NAME = 'get-or-create-cart';
const FUNCTION_VERSION = 'v54.0';

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

// 【v54.0 核心修正】使用主席發現的、更簡潔的啟動方式
Deno.serve(async (req) => {
    // 這是解決 CORS 錯誤的關鍵：在執行任何邏輯前，先回應瀏覽器的 OPTIONS (預檢) 請求。
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }
    
    // 將日誌和錯誤處理包裹在業務邏輯外層
    const logger = new LoggingService(FUNCTION_NAME, FUNCTION_VERSION);
    const wrappedHandler = withErrorLogging(mainHandler, logger);
    return await wrappedHandler(req);
});