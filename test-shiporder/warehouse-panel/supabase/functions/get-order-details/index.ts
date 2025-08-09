// 檔案路徑: supabase/functions/get-order-details/index.ts
// ----------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ----------------------------------------------------

// 【核心修正】從 deps.ts 引入依賴
import { createClient } from '../_shared/deps.ts'
import { corsHeaders } from '../_shared/cors.ts'

console.log(`函式 "get-order-details" 已啟動`)

Deno.serve(async (req) => {
  // 處理 CORS 預檢請求
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { orderId } = await req.json()

    if (!orderId) {
      return new Response(JSON.stringify({ error: '缺少 orderId 參數' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 建立一個具有最高權限的 Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 查詢特定訂單的所有 order_items，並深度連接到 product_variants 和 products
    // 以獲取完整的商品資訊
    const { data: items, error } = await supabaseClient
      .from('order_items')
      .select(`
        quantity,
        product_variants (
          name, 
          sku,
          products (
            name
          )
        )
      `)
      .eq('order_id', orderId)

    if (error) {
      console.error(`查詢訂單 ${orderId} 詳細資訊時發生錯誤:`, error)
      throw error
    }

    // 回傳查詢到的商品項目陣列
    return new Response(JSON.stringify(items), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('[get-order-details] 函式錯誤:', error.message);
    return new Response(JSON.stringify({ error: '伺服器內部錯誤' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})