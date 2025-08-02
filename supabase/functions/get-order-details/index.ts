import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

console.log(`函式 "get-order-details" 已啟動`)

Deno.serve(async (req) => {
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

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 查詢特定訂單的所有 order_items，並深度連接到 product_variants 和 products
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
    return new Response(JSON.stringify({ error: '伺服器內部錯誤' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})