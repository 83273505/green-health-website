// supabase/functions/cart-operations/index.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 從請求中解析出購物車 ID, 操作類型, 和具體資料
    const { cartId, action, payload } = await req.json()
    if (!cartId || !action) throw new Error('Cart ID and action are required.')

    switch (action) {
      case 'ADD_ITEM': {
        const { variantId, quantity } = payload
        if (!variantId || !quantity) throw new Error('Variant ID and quantity are required.')

        // 1. 獲取商品價格，製作價格快照 (Price Snapshot)
        const { data: variant, error: variantError } = await supabaseAdmin
          .from('product_variants')
          .select('price, sale_price')
          .eq('id', variantId)
          .single()
        if (variantError) throw variantError
        
        const price_snapshot = variant.sale_price || variant.price

        // 2. 使用 upsert 將商品加入或更新購物車
        const { data, error } = await supabaseAdmin
          .from('cart_items')
          .upsert(
            {
              cart_id: cartId,
              product_variant_id: variantId,
              quantity: quantity,
              price_snapshot: price_snapshot,
            },
            { onConflict: 'cart_id,product_variant_id' } // 如果商品已存在，則更新
          )
          .select()
        
        if (error) throw error
        return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
      }

      // 您可以未來在此處增加 'UPDATE_ITEM_QUANTITY', 'REMOVE_ITEM' 等 case

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