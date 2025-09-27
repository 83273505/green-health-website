// 檔案路徑: supabase/functions/manage-cart/index.ts
// ==============================================================================
/**
 * 檔案名稱：index.ts
 * 檔案職責：【v52.0 熔爐協議修正版】處理所有購物車修改命令的安全閘道。
 * 版本：52.0
 * SOP 條款對應：
 * - [SOP-CE 13] 競爭性熔爐協議
 * AI 註記：
 * 變更摘要:
 * - [核心邏輯]::[重構]::【✅ 主席團最終裁決】不再將身份驗證的隱式責任推給資料庫。
 * - [核心邏輯]::[修正]:: 此函式現在負責從 JWT 中權威地解析出 `user.id`。
 * - [核心邏輯]::[修正]:: 在呼叫資料庫 RPC 時，將解析出的 `user.id` 作為一個明確的參數 `p_user_id` 傳遞下去，建立清晰的、可驗證的契約。
 * 更新日誌 (Changelog)：
 * - v52.0 (2025-09-27)：實現主席團裁決，明確傳遞 user_id，解決 auth.uid() 問題。
 * - v3.0 (舊版)：依賴資料庫層隱式解析 auth.uid()。
 */

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import LoggingService, { withErrorLogging } from '../_shared/services/loggingService.ts';

const FUNCTION_NAME = 'manage-cart-command';
const FUNCTION_VERSION = 'v52.0';

async function mainHandler(req: Request, logger: LoggingService, correlationId: string): Promise<Response> {
    const { cartId, action } = await req.json().catch(() => ({}));

    if (!cartId || !action) {
        return new Response(JSON.stringify({ success: false, error: '缺少 cartId 或 action' }), { status: 422, headers: corsHeaders });
    }

    // 步驟 1: 使用 Admin Client 權威地獲取使用者 ID
    const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user } } = await supabaseAdmin.auth.getUser();
    if (!user) {
        return new Response(JSON.stringify({ success: false, error: '使用者未授權或 Token 無效' }), { status: 401, headers: corsHeaders });
    }
    
    // 步驟 2: 【核心修正】將解析出的 user.id 作為明確參數，呼叫資料庫函式
    const { data, error } = await supabaseAdmin.rpc('atomic_modify_cart', {
        p_cart_id: cartId,
        p_user_id: user.id, // 明確傳遞 user_id
        p_action: action
    });

    if (error) {
        logger.error('呼叫 atomic_modify_cart RPC 失敗', correlationId, error);
        // 根據錯誤類型回傳更精確的狀態碼
        const errorMessage = error.message.toLowerCase();
        if (errorMessage.includes('cart_not_found_or_forbidden')) {
            return new Response(JSON.stringify({ success: false, error: '購物車不存在或無權限操作' }), { status: 404, headers: corsHeaders });
        }
        if (errorMessage.includes('insufficient_stock')) {
            return new Response(JSON.stringify({ success: false, error: '商品庫存不足' }), { status: 409, headers: corsHeaders }); // 409 Conflict
        }
        return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ success: true, data }), { status: 200, headers: corsHeaders });
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') { return new Response('ok', { headers: corsHeaders }); }
    const logger = new LoggingService(FUNCTION_NAME, FUNCTION_VERSION);
    const wrappedHandler = withErrorLogging(mainHandler, logger);
    return await wrappedHandler(req);
});