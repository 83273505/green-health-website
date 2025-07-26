// 檔案路徑: supabase/functions/calculate-cart-v2/index.ts (The Absolute Final Version)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// 我們不再從 '../_shared/cors.ts' 導入，以確保部署的穩定性

Deno.serve(async (req) => {
  // ✅ 直接在函式作用域的頂部定義 CORS 標頭
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  // 處理 CORS 預檢請求
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { global: { fetch: fetch.bind(globalThis) } }
    );
    
    // ✅ 使用更安全、更具容錯性的方式來解析請求 body
    let cartId, actions, couponCode, shippingMethodId;
    try {
        const body = await req.json();
        cartId = body.cartId ?? null;
        actions = body.actions ?? [];
        couponCode = body.couponCode ?? null;
        shippingMethodId = body.shippingMethodId ?? null;
    } catch (_) {
        // Body 為空或格式錯誤，在初始化時這是正常情況，我們賦予安全的預設值
        cartId = null;
        actions = [];
        couponCode = null;
        shippingMethodId = null;
    }

    // ✅ 如果請求中沒有有效的 cartId，則安全地回傳一個標準的空購物車物件
    if (!cartId) {
        const emptySnapshot = { items: [], itemCount: 0, summary: { subtotal: 0, couponDiscount: 0, shippingFee: 0, total: 0 }, appliedCoupon: null };
        return new Response(JSON.stringify(emptySnapshot), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    // --- 步驟 1: 執行操作 (Actions) ---
    if (actions && actions.length > 0) {
      for (const action of actions) {
        switch (action.type) {
          case 'ADD_ITEM': {
            const { variantId, quantity } = action.payload;
            if (!variantId || !quantity) throw new Error('ADD_ITEM 需要 variantId 和 quantity。');
            const { data: variant, error: variantError } = await supabaseAdmin.from('product_variants').select('price, sale_price').eq('id', variantId).single();
            if(variantError) throw new Error('找不到指定的商品規格。');
            const price_snapshot = (variant.sale_price && variant.sale_price > 0) ? variant.sale_price : variant.price;
            await supabaseAdmin.from('cart_items').upsert({
                cart_id: cartId,
                product_variant_id: variantId,
                quantity: quantity,
                price_snapshot: price_snapshot,
            }, { onConflict: 'cart_id,product_variant_id' });
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
            const { itemId: idToRemove } = action.payload;
            await supabaseAdmin.from('cart_items').delete().eq('id', idToRemove);
            break;
          }
        }
      }
    }

    // --- 步驟 2: 重新查詢購物車的最新內容 ---
    const { data: cartItems } = await supabaseAdmin.from('cart_items').select(`*, product_variants (name, price, sale_price, products ( image_url ))`).eq('cart_id', cartId).order('added_at', { ascending: true });
    
    // --- 步驟 3: 計算商品小計 ---
    const subtotal = cartItems.reduce((sum, item) => sum + Math.round(item.price_snapshot * item.quantity), 0);
    
    // --- 步驟 4: 計算折扣 ---
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

    // --- 步驟 5: 計算運費 ---
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
    
    // --- 步驟 6: 計算最終總計 ---
    const total = subtotal - couponDiscount + shippingFee;

    // --- 步驟 7: 構建並回傳完整的「購物車快照」 ---
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
    console.error('在 calculate-cart-v2 中發生錯誤:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
})