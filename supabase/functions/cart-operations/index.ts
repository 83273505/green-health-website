// supabase/functions/cart-operations/index.ts (Debug Version)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ✅ 【除錯修改】同樣地，直接在函式內部定義 corsHeaders。
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    
    // 後續邏輯維持不變...
    const { cartId, action, payload } = await req.json()
    if (!cartId || !action) throw new Error('Cart ID and action are required.')

    switch (action) {
      case 'ADD_ITEM': {
        const { variantId, quantity } = payload
        if (!variantId || !quantity) throw new Error('Variant ID and quantity are required.')

        const { data: variant, error: variantError } = await supabaseAdmin
          .from('product_variants')
          .select('price, sale_price')
          .eq('id', variantId)
          .single()
        if (variantError) throw variantError
        
        const price_snapshot = variant.sale_price || variant.price

        const { data, error } = await supabaseAdmin
          .from('cart_items')
          .upsert({
              cart_id: cartId,
              product_variant_id: variantId,
              quantity: quantity,
              price_snapshot: price_snapshot,
          }, { 
              onConflict: 'cart_id,product_variant_id',
              ignoreDuplicates: false 
          })
          .select()
        
        if (error) throw error
        return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
      }
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