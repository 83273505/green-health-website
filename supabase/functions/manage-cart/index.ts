// 檔案路徑: supabase/functions/manage-cart/index.ts
// 版本: v3.0 (Command Gateway)
// 說明: 此函式已被重構，現在僅作為 `atomic_modify_cart` 命令函式的安全閘道。

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import LoggingService, { withErrorLogging } from '../_shared/services/loggingService.ts';

const FUNCTION_NAME = 'manage-cart-command';
const FUNCTION_VERSION = 'v3.0';

async function mainHandler(req: Request, logger: LoggingService, correlationId: string): Promise<Response> {
    const { cartId, action } = await req.json().catch(() => ({}));

    if (!cartId || !action) {
        return new Response(JSON.stringify({ success: false, error: '缺少 cartId 或 action' }), { status: 422, headers: corsHeaders });
    }

    const supabaseUserClient = createClient(
        Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );
    const { data: { user } } = await supabaseUserClient.auth.getUser();
    if (!user) {
        return new Response(JSON.stringify({ success: false, error: '使用者未授權' }), { status: 401, headers: corsHeaders });
    }
    
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data, error } = await supabaseAdmin.rpc('atomic_modify_cart', {
        p_cart_id: cartId,
        p_user_id: user.id,
        p_action: action
    });

    if (error) {
        logger.error('呼叫 atomic_modify_cart RPC 失敗', correlationId, error);
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