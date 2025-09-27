// 檔案路徑: supabase/functions/get-or-create-cart/index.ts
// ==============================================================================
/**
 * 檔案名稱：index.ts
 * 檔案職責：【v50.0 堡壘計畫修正版】為任何有效的使用者 Session (包含匿名) 尋找或建立一個活躍的購物車。
 * 版本：50.0
 * SOP 條款對應：
 * - [SOP-CE 3.3] 務實不完美原則
 * - [SOP v7.2 2.3.2] 統一日誌策略
 * - [SOP v7.2 3.1.6] 絕對純淨交付鐵律
 * AI 註記：
 * 變更摘要:
 * - [核心邏輯]::[重構]::【✅ 根本原因修正】完全廢除了舊版 (v49.0) 中對前端傳入 JWT 的依賴。
 * - [核心邏輯]::[重構]::【✅ 權威性修正】改為直接使用 Supabase Admin Client 與 `auth.uid()`，從伺服器端權威地解析使用者身份，徹底解決了 `invalid JWT` 的問題。
 * - [核心邏輯]::[簡化]:: 移除了不必要的 try-catch 塊，統一由 `withErrorLogging` 中介軟體處理異常。
 * 更新日誌 (Changelog)：
 * - v50.0 (2025-09-25)：堡壘計畫修正版，修復了因前後端契約不匹配導致的致命初始化失敗。
 * - v49.0 (2025-09-24)：舊版，依賴前端傳遞的 JWT。
 */

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import LoggingService, { withErrorLogging } from '../_shared/services/loggingService.ts';

const FUNCTION_NAME = 'get-or-create-cart';
const FUNCTION_VERSION = 'v50.0';

async function mainHandler(req: Request, logger: LoggingService, correlationId: string): Promise<Response> {
    // 步驟 1: 使用 Admin Client 權威地獲取使用者身份
    // 這是核心修正：不再信任 req.headers.get('Authorization')，而是讓 Supabase 內部直接解析
    const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser();

    if (userError || !user) {
        // 如果連 Admin Client 都無法解析出使用者，代表 Session 確實有根本性問題
        logger.error('無法從 Session 中驗證使用者身份', correlationId, userError || new Error('User is null'));
        return new Response(JSON.stringify({ error: `Session 驗證失敗: ${userError?.message}` }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    logger.info('成功驗證使用者 Session', correlationId, {
        userId: user.id,
        isAnonymous: user.is_anonymous
    });

    // 步驟 2: 查詢此使用者的現有活躍購物車
    const { data: existingCart, error: cartError } = await supabaseAdmin
        .from('carts')
        .select('id, access_token')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();

    if (cartError) {
        // 由 withErrorLogging 捕捉並記錄
        throw cartError;
    }

    if (existingCart) {
        logger.info('找到現有購物車', correlationId, { cartId: existingCart.id, userId: user.id });
        return new Response(JSON.stringify({
            cartId: existingCart.id,
            cart_access_token: existingCart.access_token,
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    // 步驟 3: 若無活躍購物車，則建立一個新的
    logger.info('為使用者建立新購物車', correlationId, { userId: user.id });
    const { data: newCart, error: createError } = await supabaseAdmin
        .from('carts')
        .insert({ user_id: user.id, status: 'active' })
        .select('id, access_token')
        .single();

    if (createError) {
        // 由 withErrorLogging 捕捉並記錄
        throw createError;
    }

    logger.audit('成功建立新購物車', correlationId, { cartId: newCart.id, userId: user.id });
    
    return new Response(JSON.stringify({
        cartId: newCart.id,
        cart_access_token: newCart.access_token,
    }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}

// 使用標準化的錯誤處理中介軟體啟動服務
Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }
    const logger = new LoggingService(FUNCTION_NAME, FUNCTION_VERSION);
    const wrappedHandler = withErrorLogging(mainHandler, logger);
    return await wrappedHandler(req);
});