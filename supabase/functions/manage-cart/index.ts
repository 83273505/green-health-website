// ==============================================================================
// 檔案路徑: supabase/functions/manage-cart/index.ts
// 版本：55.0 (CORS 基礎設施修正版)
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * 檔案名稱：index.ts
 * 檔案職責：提供單一、原子化的端點來處理所有對購物車的修改命令。
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

const FUNCTION_NAME = 'manage-cart-command';
const FUNCTION_VERSION = 'v55.0';

async function mainHandler(req: Request, logger: LoggingService, correlationId: string): Promise<Response> {
    const { cartId, action } = await req.json().catch(() => ({}));

    if (!cartId || !action) {
        return new Response(JSON.stringify({ success: false, error: '缺少 cartId 或 action' }), { status: 422, headers: corsHeaders });
    }

    const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );
    const { data: { user } } = await supabaseAdmin.auth.getUser();
    if (!user) {
        return new Response(JSON.stringify({ success: false, error: '使用者未授權或 Token 無效' }), { status: 401, headers: corsHeaders });
    }
    
    // 【S-CTO 註記】此處的 RPC 函式 `atomic_modify_cart` 將在下一階段進行 RLS 權限重構
    const { data, error } = await supabaseAdmin.rpc('atomic_modify_cart', {
        p_cart_id: cartId,
        p_user_id: user.id,
        p_action: action
    });

    if (error) {
        logger.error('呼叫 atomic_modify_cart RPC 失敗', correlationId, error);
        const errorMessage = error.message.toLowerCase();
        if (errorMessage.includes('cart_not_found_or_forbidden')) {
            return new Response(JSON.stringify({ success: false, error: '購物車不存在或無權限操作' }), { status: 404, headers: corsHeaders });
        }
        if (errorMessage.includes('insufficient_stock')) {
            return new Response(JSON.stringify({ success: false, error: '商品庫存不足' }), { status: 409, headers: corsHeaders });
        }
        return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ success: true, data }), { status: 200, headers: corsHeaders });
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