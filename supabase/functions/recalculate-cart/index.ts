// 檔案路径: supabase/functions/recalculate-cart/index.ts (Incremental Recovery Test Version)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// 在 handleRequest 外部初始化一次 client，这是 Supabase 官方推荐的最佳效能实践
const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { global: { fetch: fetch.bind(globalThis) } } // 确保 fetch 绑定
);

/**
 * 核心逻辑处理器
 */
async function handleRequest(req: Request): Promise<Response> {
  let body;
  try {
    body = await req.json();
    console.log('成功解析 request body:', body);
  } catch (_) {
    console.log('Request body 為空或格式錯誤，這是正常的初始化流程。');
    body = {}; // 如果 body 为空或格式错误，给一个空物件
  }

  const cartId = body.cartId;

  // ✅ 【增量恢复测试】我们现在加入了与 Supabase 互动的逻辑
  if (!cartId) {
    console.log('未提供 cartId，跳過資料庫查詢。');
  } else {
    // 尝试查询 cart_items 表
    console.log(`正在為 cartId: ${cartId} 查詢 cart_items...`);
    const { data, error } = await supabaseAdmin
      .from('cart_items')
      .select('*')
      .eq('cart_id', cartId);

    if (error) {
      console.error('查詢 cart_items 時發生錯誤:', error.message);
      // 注意：即使查询失败，我们依然继续执行并回传 200，以便观察日志
    } else {
      console.log('查詢 cart_items 成功，找到的項目數量:', data.length);
    }
  }

  // 无论数据库查询是否成功，我们都回传一个固定的空快照
  const emptySnapshot = {
    items: [],
    itemCount: 0,
    summary: { subtotal: 0, couponDiscount: 0, shippingFee: 0, total: 0 },
    appliedCoupon: null
  };

  console.log('即将回传一个空的快照...');
  return new Response(JSON.stringify(emptySnapshot), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 200 // 强制回传 200 OK
  });
}

/**
 * 主服务
 */
Deno.serve(async (req) => {
  // CORS 预检请求处理
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 明确等待 handleRequest 完成
    return await handleRequest(req);
  } catch (error) {
    console.error('在 handleRequest 外部發生未捕捉的錯誤:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
})