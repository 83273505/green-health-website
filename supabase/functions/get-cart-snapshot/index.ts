// ==============================================================================
// 檔案路徑: supabase/functions/get-cart-snapshot/index.ts
// 版本：55.0 (CORS 基礎設施修正版)
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * 檔案名稱：index.ts
 * 檔案職責：作為前端購物車狀態的唯一事實來源，提供計算後的完整購物車快照。
 * 版本：55.0
 * SOP 條款對應：
 * - [SOP v7.2 2.1.4.3] 絕對路徑錨定原則
 * 依賴清單 (Dependencies)：
 * - @/_shared/deps.ts -> ../_shared/deps.ts (路徑修正)
 * - @/_shared/cors.ts -> ../_shared/cors.ts (路徑修正)
 * - @/_shared/services/loggingService.ts -> ../_shared/services/loggingService.ts (路徑修正)
 * AI 註記：
 * 變更摘要:
 * - [Deno.serve]::[修改]::【✅ CCOO 核心修正】根據最終作戰計畫，在函式入口處新增了對 CORS `OPTIONS` 預檢請求的處理邏輯。
 * - [import]::[修正]:: 修正了所有 `import` 路徑，確保其指向 `_shared` 目錄，而非已被廢棄的 `@/`。
 * 更新日誌 (Changelog)：
 * - v55.0 (2025-09-28)：新增 CORS OPTIONS 預檢請求處理。
 * - v54.0 (2025-09-27)：舊版，缺少 OPTIONS 處理。
 */
import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import LoggingService, { withErrorLogging } from '../_shared/services/loggingService.ts';

const FUNCTION_NAME = 'get-cart-snapshot';
const FUNCTION_VERSION = 'v55.0';

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

    // 【S-CTO 註記】此處的 RLS 將在下一階段進行權限重構
    const { data: cart, error: ownerError } = await supabaseAdmin.from('carts').select('id').eq('id', cartId).eq('access_token', cartAccessToken).maybeSingle();
    if (ownerError) {
        logger.error('驗證購物車所有權時發生資料庫錯誤', correlationId, ownerError, { cartId });
        return new Response(JSON.stringify({ error: '伺服器內部錯誤' }), { status: 500, headers: corsHeaders });
    }
    if (!cart) {
        logger.warn('購物車不存在或訪問權杖無效', correlationId, { cartId });
        return new Response(JSON.stringify({ error: '購物車不存在或訪問權杖無效' }), { status: 404, headers: corsHeaders });
    }

    // 【S-CTO 註記】此處的 RPC 函式 `get_cart_snapshot` 將在下一階段進行 RLS 權限重構
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

// 【v55.0 CCOO 核心修正】
Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }
    const logger = new LoggingService(FUNCTION_NAME, FUNCTION_VERSION);
    const wrappedHandler = withErrorLogging(mainHandler, logger);
    return await wrappedHandler(req);
});