// supabase/functions/cart-operations/index.ts (Final Version)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// 在函式內部直接定義 CORS 標頭，確保穩定性
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // 處理瀏覽器的 CORS 預檢請求
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 建立一個具有服務角色的 Supabase client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    
    // 從請求 body 中解析出操作指令
    const { cartId, action, payload } = await req.json()
    if (!cartId || !action) throw new Error('Cart ID and action are required.')

    switch (action) {
      case 'ADD_ITEM': {
        const { variantId, quantity } = payload
        if (!variantId || !quantity || quantity < 1) {
            throw new Error('Valid Variant ID and quantity are required.')
        }

        // 1. 從資料庫獲取商品規格的最新價格，製作價格快照 (Price Snapshot)
        const { data: variant, error: variantError } = await supabaseAdmin
          .from('product_variants')
          .select('price, sale_price')
          .eq('id', variantId)
          .single()
        
        if (variantError) throw new Error(`Product variant not found: ${variantError.message}`)
        
        const price_snapshot = variant.sale_price || variant.price

        // 2. 使用 upsert 將商品加入或更新購物車中的數量
        //    這裡我們假設如果商品已存在，是累加數量，但更簡單的實現是直接覆蓋
        //    一個更完整的實現會先查詢現有數量再更新，但 upsert 更簡潔
        const { data: cartItem, error } = await supabaseAdmin
          .from('cart_items')
          .upsert({
              cart_id: cartId,
              product_variant_id: variantId,
              quantity: quantity,
              price_snapshot: price_snapshot,
          }, { 
              onConflict: 'cart_id,product_variant_id', // 如果 cart_id 和 product_variant_id 的組合已存在
              ignoreDuplicates: false // 則更新該行，而不是忽略
          })
          .select()
          .single()
        
        if (error) throw error
        
        return new Response(JSON.stringify(cartItem), { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
            status: 200 
        })
      }

      // 未來可以擴充其他操作
      // case 'UPDATE_QUANTITY': { ... }
      // case 'REMOVE_ITEM': { ... }

      default:
        throw new Error(`Invalid action: ${action}`)
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})