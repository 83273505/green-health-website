// 檔案路徑: supabase/functions/recalculate-cart/index.ts (Final Refactored Version)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { calculateCartSummary } from '../_shared/summary-calculator.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { cartId, couponCode, shippingMethodId, actions } = await req.json();
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    
    if (actions && actions.length > 0) {
      if (!cartId) throw new Error("執行購物車操作時需要 cartId。");
      for (const action of actions) {
        switch (action.type) {
          case 'ADD_ITEM': {
            const { variantId, quantity } = action.payload;
            const { data: variant, error: vError } = await supabaseAdmin.from('product_variants').select('price, sale_price').eq('id', variantId).single();
            if(vError) throw new Error('找不到指定的商品規格。');
            const price_snapshot = (variant.sale_price && variant.sale_price > 0) ? variant.sale_price : variant.price;
            await supabaseAdmin.from('cart_items').upsert({
                cart_id: cartId, product_variant_id: variantId, quantity: quantity, price_snapshot: price_snapshot,
            }, { onConflict: 'cart_id,product_variant_id' }).throwOnError();
            break;
          }
          case 'UPDATE_ITEM_QUANTITY': {
            const { itemId, newQuantity } = action.payload;
            if (newQuantity > 0) {
              await supabaseAdmin.from('cart_items').update({ quantity: newQuantity }).eq('id', itemId).throwOnError();
            } else {
              await supabaseAdmin.from('cart_items').delete().eq('id', itemId).throwOnError();
            }
            break;
          }
          case 'REMOVE_ITEM': {
            const { itemId } = action.payload;
            await supabaseAdmin.from('cart_items').delete().eq('id', itemId).throwOnError();
            break;
          }
        }
      }
    }
    
    const cartSnapshot = await calculateCartSummary(supabaseAdmin, cartId, couponCode, shippingMethodId);

    return new Response(JSON.stringify(cartSnapshot), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (e) {
    console.error('[recalculate-cart] 函式錯誤:', e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});