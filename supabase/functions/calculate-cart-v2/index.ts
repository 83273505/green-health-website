// 檔案路径: supabase/functions/recalculate-cart/index.ts (The Absolute Final Version)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// 我们不再从 '../_shared/cors.ts' 导入

Deno.serve(async (req) => {
  // ✅ 直接在函式作用域的顶部定义 CORS 标头
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  // 處理 CORS 预检请求
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { global: { fetch: fetch.bind(globalThis) } }
    );
    
    // ✅ 使用更安全、更具容错性的方式来解析请求 body
    let cartId, actions, couponCode, shippingMethodId;
    try {
        const body = await req.json();
        cartId = body.cartId ?? null;
        actions = body.actions ?? [];
        couponCode = body.couponCode ?? null;
        shippingMethodId = body.shippingMethodId ?? null;
    } catch (_) {
        // Body 为空或格式错误，在初始化时这是正常情况，我们赋予预设值
        cartId = null;
        actions = [];
        couponCode = null;
        shippingMethodId = null;
    }

    // ✅ 如果请求中没有有效的 cartId，则安全地回传一个标准的空购物车物件
    if (!cartId) {
        const emptySnapshot = { items: [], itemCount: 0, summary: { subtotal: 0, couponDiscount: 0, shippingFee: 0, total: 0 }, appliedCoupon: null };
        return new Response(JSON.stringify(emptySnapshot), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    // ✅ 后续所有业务逻辑都放在这里
    if (actions && actions.length > 0) {
      for (const action of actions) {
        switch (action.type) {
          case 'ADD_ITEM':
            const { variantId, quantity } = action.payload;
            const { data: variant } = await supabaseAdmin.from('product_variants').select('price, sale_price').eq('id', variantId).single();
            const price_snapshot = (variant.sale_price && variant.sale_price > 0) ? variant.sale_price : variant.price;
            await supabaseAdmin.from('cart_items').upsert({ cart_id: cartId, product_variant_id: variantId, quantity: quantity, price_snapshot: price_snapshot }, { onConflict: 'cart_id,product_variant_id' });
            break;
          case 'UPDATE_ITEM_QUANTITY':
            const { itemId, newQuantity } = action.payload;
            if (newQuantity > 0) {
              await supabaseAdmin.from('cart_items').update({ quantity: newQuantity }).eq('id', itemId);
            } else {
              await supabaseAdmin.from('cart_items').delete().eq('id', itemId);
            }
            break;
          case 'REMOVE_ITEM':
            const { itemId: idToRemove } = action.payload;
            await supabaseAdmin.from('cart_items').delete().eq('id', idToRemove);
            break;
        }
      }
    }

    const { data: cartItems } = await supabaseAdmin.from('cart_items').select(`*, product_variants (name, price, sale_price, products ( image_url ))`).eq('cart_id', cartId).order('added_at', { ascending: true });
    const subtotal = cartItems.reduce((sum, item) => sum + Math.round(item.price_snapshot * item.quantity), 0);
    
    let couponDiscount = 0;
    let appliedCoupon = null;
    if (couponCode) {
        const { data: coupon } = await supabaseAdmin.from('coupons').select('*').eq('code', couponCode).eq('is_active', true).single();
        if (coupon && subtotal >= coupon.min_purchase_amount) {
            if (coupon.discount_type === 'PERCENTAGE') {
                couponDiscount = Math.round(subtotal * (coupon.discount_percentage / 100));
            } else if (coupon.discount_type === 'FIXED_AMOUNT') {
                couponDiscount = Math.round(coupon.discount_amount);
            }
            appliedCoupon = { code: coupon.code, discountAmount: couponDiscount };
        }
    }

    let shippingFee = 0;
    if (shippingMethodId) {
        const { data: shippingRate } = await supabaseAdmin.from('shipping_rates').select('*').eq('id', shippingMethodId).eq('is_active', true).single();
        if (shippingRate) {
            const subtotalAfterDiscount = subtotal - couponDiscount;
            if (!shippingRate.free_shipping_threshold || subtotalAfterDiscount < shippingRate.free_shipping_threshold) {
                shippingFee = Math.round(shippingRate.rate);
            }
        }
    }
    
    const total = subtotal - couponDiscount + shippingFee;

    const cartSnapshot = {
        items: cartItems,
        itemCount: cartItems.reduce((sum, item) => sum + item.quantity, 0),
        summary: { subtotal, couponDiscount, shippingFee, total: total < 0 ? 0 : total },
        appliedCoupon,
    };

    return new Response(JSON.stringify(cartSnapshot), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
    });

  } catch (error) {
    console.error('在 recalculate-cart 中发生错误:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
})