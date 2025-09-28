// ==============================================================================
// 檔案路徑: supabase/functions/get-or-create-cart/index.ts
// 版本：55.0 (CORS 基礎設施修正版)
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * 檔案名稱：index.ts
 * 檔案職責：獲取或建立一個與使用者（匿名或正式）綁定的購物車。
 * 版本：55.0
 * SOP 條款對應：
 * - [SOP v7.2 2.1.4.3] 絕對路徑錨定原則
 * 依賴清單 (Dependencies)：
 * - @/_shared/deps.ts
 * - @/_shared/cors.ts
 * - @/_shared/services/loggingService.ts
 * AI 註記：
 * 變更摘要:
 * - [Deno.serve]::[修改]::【✅ CCOO 核心修正】根據最終作戰計畫，在函式入口處新增了對 CORS `OPTIONS` 預檢請求的處理邏輯。這是解決瀏覽器端網路錯誤的關鍵第一步。
 * - [import]::[修正]:: 修正了所有 `import` 路徑，確保其指向 `_shared` 目錄，而非已被廢棄的 `@/`。
 * 更新日誌 (Changelog)：
 * - v55.0 (2025-09-28)：新增 CORS OPTIONS 預檢請求處理。
 * - v54.0 (2025-09-27)：舊版，缺少 OPTIONS 處理。
 */

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import LoggingService, { withErrorLogging } from '../_shared/services/loggingService.ts';

const FUNCTION_NAME = 'get-or-create-cart';
const FUNCTION_VERSION = 'v55.0';

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

// 【v55.0 CCOO 核心修正】
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