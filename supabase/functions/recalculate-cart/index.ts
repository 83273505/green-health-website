// 檔案路径: supabase/functions/recalculate-cart/index.ts (Incremental Recovery - Step 1)

// 我们只保留绝对必要的、来自远程 URL 的 import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// 我们将 handleRequest 和 Deno.serve 合并，以简化这个测试阶段的结构
Deno.serve(async (req) => {
  // 定义一个绝对完整的、明确的 CORS 标头物件
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  // 處理 CORS 预检请求
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log("函式启动，准备初始化 Supabase client...");

    // ✅ 【增量还原 - 第 1 步】
    // 我们将初始化 Supabase client 和解析 body 的逻辑加回来
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { global: { fetch: fetch.bind(globalThis) } }
    );

    let cartId = null;
    try {
        const body = await req.json();
        cartId = body.cartId ?? null;
        console.log("成功解析 request body，cartId:", cartId);
    } catch (_) {
        console.log("Request body 为空或格式错误，这是正常的初始化流程。");
    }

    // ✅ 【增量还原 - 第 2 步】
    // 我们将查询数据库的逻辑加回来
    if (cartId) {
        console.log(`正在为 cartId: ${cartId} 查詢 cart_items...`);
        const { data, error } = await supabaseAdmin
            .from('cart_items')
            .select('*')
            .eq('cart_id', cartId);

        if (error) {
            console.error('查詢 cart_items 時發生錯誤:', error.message);
        } else {
            console.log('查詢 cart_items 成功，找到的項目數量:', data.length);
        }
    } else {
        console.log('未提供 cartId，跳過資料庫查詢。');
    }


    // 无论数据库查询是否成功，我们都继续回传一个固定的空快照
    const emptySnapshot = {
        items: [],
        itemCount: 0,
        summary: { subtotal: 0, couponDiscount: 0, shippingFee: 0, total: 0 },
        appliedCoupon: null
    };

    console.log('逻辑执行完毕，即将回传一个空的快照...');
    return new Response(JSON.stringify(emptySnapshot), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
    });

  } catch (error) {
    console.error('在 recalculate-cart 的增量还原版中发生错误:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
})