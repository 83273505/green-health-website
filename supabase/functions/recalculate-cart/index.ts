// 檔案路徑: supabase/functions/recalculate-cart/index.ts (Query Fix Final Version)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
    
    const { cartId, actions, couponCode, shippingMethodId } = await req.json()
    if (!cartId) throw new Error('購物車 ID 為必需項。')

    if (actions && actions.length > 0) {
      for (const action of actions) {
        switch (action.type) {
          case 'ADD_ITEM': {
            const { variantId, quantity } = action.payload;
            const { data: variant, error: variantError } = await supabaseAdmin.from('product_variants').select('price, sale_price').eq('id', variantId).single();
            if(variantError) throw new Error('找不到指定的商品規格。');
            
            const price_snapshot = (variant.sale_price && variant.sale_price > 0) ? variant.sale_price : variant.price;
            
            // ✅ 【關鍵修正】改回使用 upsert，這是處理新增或更新最穩健的方式
            await supabaseAdmin.from('cart_items').upsert({
                cart_id: cartId,
                product_variant_id: variantId,
                quantity: quantity,
                price_snapshot: price_snapshot,
            }, { 
                onConflict: 'cart_id,product_variant_id',
                ignoreDuplicates: false 
            }).throwOnError();
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

    // ✅ 【關鍵修正】使用 `!inner` 來強制內連接，確保關聯的明確性，避免查詢錯誤
    const { data: cartItems, error: cartItemsError } = await supabaseAdmin
      .from('cart_items')
      .select(`
        *,
        product_variants!inner (
          name,
          price,
          sale_price,
          products!inner (
            image_url
          )
        )
      `)
      .eq('cart_id', cartId)
      .order('added_at', { ascending: true });
    if (cartItemsError) throw cartItemsError;

    // --- 後續的計算邏輯維持不變 ---
    const subtotal = cartItems.reduce((sum, item) => sum + Math.round(item.price_snapshot * item.quantity), 0);
    
    let couponDiscount = 0;
    let appliedCoupon = null;
    if (couponCode) {
      const { data: coupon } = await supabaseAdmin.from('coupons').select('*').eq('code', couponCode).eq('is_active', true).single();
      if (coupon && subtotal >= coupon.min_purchase_amount) {
          if (coupon.discount_type === 'PERCENTAGE' && coupon.discount_percentage) {
            couponDiscount = Math.round(subtotal * (coupon.discount_percentage / 100));
          } else if (coupon.discount_type === 'FIXED_AMOUNT' && coupon.discount_amount) {
            couponDiscount = Math.round(coupon.discount_amount);
          }
          appliedCoupon = { code: coupon.code, discountAmount: couponDiscount };
      }
    }

    let shippingFee = 0;
    const subtotalAfterDiscount = subtotal - couponDiscount;
    if (shippingMethodId) {
        const { data: shippingRate } = await supabaseAdmin.from('shipping_rates').select('*').eq('id', shippingMethodId).eq('is_active', true).single();
        if (shippingRate) {
            if (shippingRate.free_shipping_threshold && subtotalAfterDiscount >= shippingRate.free_shipping_threshold) {
                shippingFee = 0;
            } else {
                shippingFee = Math.round(shippingRate.rate);
            }
        }
    }
    const total = subtotal - couponDiscount + shippingFee;

    const cartSnapshot = {
      items: cartItems,
      itemCount: cartItems.reduce((sum, item) => sum + item.quantity, 0),
      summary: {
        subtotal,
        couponDiscount,
        shippingFee,
        total: total < 0 ? 0 : total,
      },
      appliedCoupon,
    };

    return new Response(JSON.stringify(cartSnapshot), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { 
        status: 400, // 為了方便前端除錯，我們將大部分可預期的錯誤都回傳 400
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
})