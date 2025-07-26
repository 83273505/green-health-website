// 檔案路徑: supabase/functions/cart-operations/index.ts (Upgraded Version)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// 在函式內部直接定義 CORS 標頭，維持穩定性
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
    if (!action) throw new Error('Action is required.') // cartId 在更新/刪除時非必需，但在新增時是

    switch (action) {
      // 【維持不變】原有的新增商品邏輯
      case 'ADD_ITEM': {
        if (!cartId || !payload.variantId || !payload.quantity) {
            throw new Error('Cart ID, Variant ID and quantity are required for ADD_ITEM.')
        }
        const { variantId, quantity } = payload

        const { data: variant, error: variantError } = await supabaseAdmin
          .from('product_variants')
          .select('price, sale_price')
          .eq('id', variantId)
          .single()
        
        if (variantError) throw new Error(`Product variant not found: ${variantError.message}`)
        
        const price_snapshot = variant.sale_price || variant.price

        const { data: cartItem, error } = await supabaseAdmin
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
          .single()
        
        if (error) throw error
        
        return new Response(JSON.stringify(cartItem), { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
            status: 200 
        })
      }

      // ✅ 【增加】處理更新商品數量的邏輯
      case 'UPDATE_ITEM_QUANTITY': {
        const { itemId, newQuantity } = payload
        if (!itemId || typeof newQuantity !== 'number') {
          throw new Error('Item ID and a valid new quantity are required.')
        }

        let result;
        if (newQuantity > 0) {
          // 如果新數量大於 0，則更新該項目的數量
          const { data, error } = await supabaseAdmin
            .from('cart_items')
            .update({ quantity: newQuantity })
            .eq('id', itemId)
            .select()
            .single()
          if (error) throw error
          result = data
        } else {
          // 如果新數量為 0 或更少，則將該項目從購物車中刪除
          const { data, error } = await supabaseAdmin
            .from('cart_items')
            .delete()
            .eq('id', itemId)
            .select()
            .single()
          if (error) throw error
          result = data
        }
        
        return new Response(JSON.stringify(result), { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
            status: 200 
        })
      }

      // ✅ 【增加】處理直接移除商品的邏輯
      case 'REMOVE_ITEM': {
        const { itemId } = payload
        if (!itemId) {
          throw new Error('Item ID is required.')
        }

        const { data, error } = await supabaseAdmin
            .from('cart_items')
            .delete()
            .eq('id', itemId)
            .select()
            .single()

        if (error) throw error
        
        return new Response(JSON.stringify(data), { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
            status: 200 
        })
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