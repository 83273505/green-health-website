// 檔案路径: supabase/functions/recalculate-cart/index.ts (No Local Imports - Final Version)

// 我们只保留绝对必要的、来自远程 URL 的 import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// 我们不再从 '../_shared/cors.ts' 导入，而是直接在函式内部定义
// const { corsHeaders } = await import('../_shared/cors.ts') // 暂时禁用

async function handleRequest(req: Request): Promise<Response> {
    // 【关键修正】直接在函式作用域内定义 CORS 标头
    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    };

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { global: { fetch: fetch.bind(globalThis) } }
    );

    // 后续的逻辑，我们暂时简化，只保留最核心的空快照回传
    // 以确保我们测试的是 import 问题，而不是逻辑问题
    const emptySnapshot = {
        items: [],
        itemCount: 0,
        summary: { subtotal: 0, couponDiscount: 0, shippingFee: 0, total: 0 },
        appliedCoupon: null
    };

    console.log('即将回传一个空的快照 (无本地 Import 版)...');
    return new Response(JSON.stringify(emptySnapshot), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
    });
}

Deno.serve(async (req) => {
    // 【关键修正】CORS 标头也在这里直接定义
    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    };

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        return await handleRequest(req);
    } catch (error) {
        console.error('发生未知错误:', error.message);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500
        });
    }
})