// 檔案路徑: supabase/functions/recalculate-cart/index.ts (Serialization Guard - Final Version)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

async function handleRequest(req: Request): Promise<Response> {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { global: { fetch: fetch.bind(globalThis) } }
    )
    
    let cartId: string | null = null, actions: any[] = [], couponCode: string | null = null, shippingMethodId: string | null = null;

    try {
        const body = await req.json();
        cartId = body.cartId ?? null;
        actions = body.actions ?? [];
        couponCode = body.couponCode ?? null;
        shippingMethodId = body.shippingMethodId ?? null;
    } catch (_) {
        // Body 為空或格式錯誤，這是初始化時的正常情況
    }

    if (!cartId) {
        const emptySnapshot = { items: [], itemCount: 0, summary: { subtotal: 0, couponDiscount: 0, shippingFee: 0, total: 0 }, appliedCoupon: null };
        return new Response(JSON.stringify(emptySnapshot), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    if (actions && actions.length > 0) {
      for (const action of actions) {
        switch (action.type) {
          case 'ADD_ITEM': {
            const { variantId, quantity } = action.payload;
            const { data: variant, error: variantError } = await supabaseAdmin.from('product_variants').select('price, sale_price').eq('id', variantId).single();
            if(variantError) throw new Error('找不到指定的商品規格。');
            const price_snapshot = (variant.sale_price && variant.sale_price > 0) ? variant.sale_price : variant.price;
            await supabaseAdmin.from('cart_items').upsert({ cart_id: cartId, product_variant_id: variantId, quantity: quantity, price_snapshot: price_snapshot }, { onConflict: 'cart_id,product_variant_id' });
            break;
          }
          case 'UPDATE_ITEM_QUANTITY': {
            const { itemId, newQuantity } = action.payload;
            if (newQuantity > 0) {
              await supabaseAdmin.from('cart_items').update({ quantity: newQuantity }).eq('id', itemId);
            } else {
              await supabaseAdmin.from('cart_items').delete().eq('id', itemId);
            }
            break;
          }
          case 'REMOVE_ITEM': {
            const { itemId } = action.payload;
            await supabaseAdmin.from('cart_items').delete().eq('id', itemId);
            break;
          }
        }
      }
    }

    const { data: cartItems, error: cartItemsError } = await supabaseAdmin.from('cart_items').select(`*, product_variants (name, price, sale_price, products ( image_url ))`).eq('cart_id', cartId).order('added_at', { ascending: true });
    if (cartItemsError) throw cartItemsError;
    
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
      summary: { subtotal, couponDiscount, shippingFee, total: total < 0 ? 0 : total },
      appliedCoupon,
    };
    
    // ✅ 【後端偵測】在回傳 Response 之前，用 try...catch 安全地包裹 JSON.stringify
    try {
        const jsonResult = JSON.stringify(cartSnapshot);
        console.log("成功序列化 cartSnapshot，準備回傳。");
        return new Response(jsonResult, {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });
    } catch (e) {
        console.error('序列化 cartSnapshot 時發生致命錯誤:', e.message);
        return new Response(JSON.stringify({ 
            error: '後端 JSON 序列化錯誤', 
            detail: e.message 
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        });
    }
}

// Deno.serve 的結構維持不變
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  try {
    return await handleRequest(req);
  } catch (error) {
    console.error('在 recalculate-cart 中發生未捕捉的錯誤:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
})