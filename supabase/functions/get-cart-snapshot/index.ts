// 檔案路徑: supabase/functions/get-cart-snapshot/index.ts
// 版本: v3.1 (CORS 健壯性修正版)
// 說明: 此版本重構了 Deno.serve 的啟動邏輯，確保 OPTIONS 預檢請求
//       永遠能被優先處理並返回正確的 CORS 標頭，從而解決 CORS policy 錯誤。

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import LoggingService, { withErrorLogging } from '../_shared/services/loggingService.ts';

const FUNCTION_NAME = 'get-cart-snapshot';
const FUNCTION_VERSION = 'v3.1';

// 核心業務邏輯保持不變
async function mainHandler(req: Request, logger: LoggingService, correlationId: string): Promise<Response> {
    const { cartId, couponCode, shippingMethodId } = await req.json().catch(() => ({}));

    if (!cartId) {
        return new Response(JSON.stringify({ error: '缺少 cartId' }), { status: 400, headers: corsHeaders });
    }

    const supabaseUserClient = createClient(
        Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );
    const { data: { user } } = await supabaseUserClient.auth.getUser();
    if (!user) {
        return new Response(JSON.stringify({ error: '使用者未授權' }), { status: 401, headers: corsHeaders });
    }

    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data, error } = await supabaseAdmin.rpc('get_cart_snapshot', {
        p_cart_id: cartId,
        p_user_id: user.id,
        p_coupon_code: couponCode || null,
        p_shipping_method_id: shippingMethodId || null
    });

    if (error) {
        logger.error('呼叫 get_cart_snapshot RPC 失敗', correlationId, error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
    }

    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
}

// [v3.1 CORE FIX] 採用更健壯的服務啟動模式
Deno.serve(async (req) => {
    // 立即處理 OPTIONS 請求，這是處理 CORS 的第一道防線
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }
    
    // 只有在不是 OPTIONS 請求時，才初始化日誌服務並執行核心邏輯
    try {
        const logger = new LoggingService(FUNCTION_NAME, FUNCTION_VERSION);
        const wrappedHandler = withErrorLogging(mainHandler, logger);
        return await wrappedHandler(req);
    } catch (e) {
        // 這是一個兜底的錯誤處理，以防日誌服務本身初始化失敗
        console.error("Critical error during function initialization:", e);
        return new Response(JSON.stringify({ error: "Internal Server Error" }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
    }
});