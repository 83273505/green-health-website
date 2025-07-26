// 檔案路径: supabase/functions/recalculate-cart/index.ts (Standard Headers - Final Version)

// 我们依然保持这个测试版本的纯粹性，不引入任何本地或外部的 Supabase 模组
// import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {

  // ✅ 【最终修正】使用 new Headers() 的标准方式来构建 CORS 标头
  const corsHeaders = new Headers();
  corsHeaders.set("Access-Control-Allow-Origin", "*");
  corsHeaders.set("Access-Control-Allow-Headers", "authorization, x-client-info, apikey, content-type");
  corsHeaders.set("Access-Control-Allow-Methods", "POST, OPTIONS");

  // 處理 CORS 预检请求
  if (req.method === 'OPTIONS') {
    // 对于 OPTIONS 请求，我们回传一个空的 body 和 CORS 标头
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 构造一个写死的、空的购物车快照
    const emptySnapshot = {
        items: [],
        itemCount: 0,
        summary: { subtotal: 0, couponDiscount: 0, shippingFee: 0, total: 0 },
        appliedCoupon: null,
    };
    
    console.log("即将回传一个空的快照 (标准 Headers 版)...");

    // ✅ 【最终修正】在回传 200 OK 时，也使用 new Headers() 来构建回应标头
    const responseHeaders = new Headers(corsHeaders); // 继承 CORS 标头
    responseHeaders.set("Content-Type", "application/json"); // 明确设定内容类型

    return new Response(
      JSON.stringify(emptySnapshot),
      {
        headers: responseHeaders, // 使用我们安全构建的 Headers 物件
        status: 200,
      }
    )
    
  } catch (error) {
    console.error('在 recalculate-cart 的标准 Headers 版中发生错误:', error.message);
    
    // ✅ 【同步修正】在错误回应中，也使用同样严谨的 Headers 构建方式
    const errorHeaders = new Headers(corsHeaders);
    errorHeaders.set("Content-Type", "application/json");

    return new Response(
      JSON.stringify({ error: error.message }), 
      {
        headers: errorHeaders,
        status: 500,
      }
    )
  }
})