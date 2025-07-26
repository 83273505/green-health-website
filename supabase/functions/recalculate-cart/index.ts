// 檔案路徑: supabase/functions/recalculate-cart/index.ts

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
    
    // 從請求 body 中解析出前端的「意圖」
    const { cartId, actions, couponCode, shippingMethodId } = await req.json()
    if (!cartId) throw new Error('Cart ID is required.')

    // --- 步驟 1: 執行操作 (Actions) ---
    // 如果前端傳來了操作指令（例如更新數量、移除商品），則先執行它們
    if (actions && actions.length > 0) {
      for (const action of actions) {
        switch (action.type) {
          case 'UPDATE_ITEM_QUANTITY': {
            const { itemId, newQuantity } = action.payload
            if (newQuantity > 0) {
              await supabaseAdmin.from('cart_items').update({ quantity: newQuantity }).eq('id', itemId).throwOnError();
            } else {
              await supabaseAdmin.from('cart_items').delete().eq('id', itemId).throwOnError();
            }
            break;
          }
          case 'REMOVE_ITEM': {
            const { itemId } = action.payload
            await supabaseAdmin.from('cart_items').delete().eq('id', itemId).throwOnError();
            break;
          }
        }
      }
    }

    // --- 步驟 2: 重新查詢購物車的最新內容 ---
    const { data: cartItems, error: cartItemsError } = await supabaseAdmin
      .from('cart_items')
      .select(`
        *,
        product_variants (
          name,
          price,
          sale_price,
          products ( image_url )
        )
      `)
      .eq('cart_id', cartId)
      .order('added_at', { ascending: true });

    if (cartItemsError) throw cartItemsError;

    // --- 步驟 3: 計算商品小計 (Subtotal) ---
    let subtotal = 0;
    for (const item of cartItems) {
      const variant = item.product_variants;
      const price = variant.sale_price ?? variant.price; // 優先使用特價，否則使用原價
      subtotal += price * item.quantity;
    }

    // --- 步驟 4: 計算折扣 (Discount) ---
    let couponDiscount = 0;
    let appliedCoupon = null;
    if (couponCode) {
      const { data: coupon, error: couponError } = await supabaseAdmin
        .from('coupons')
        .select('*')
        .eq('code', couponCode)
        .eq('is_active', true)
        .single();
      
      if (couponError) {
        console.warn(`Coupon code "${couponCode}" not found or error:`, couponError.message);
      } else if (coupon) {
        // 檢查是否符合低消門檻
        if (subtotal >= coupon.min_purchase_amount) {
          if (coupon.discount_type === 'PERCENTAGE' && coupon.discount_percentage) {
            couponDiscount = Math.round(subtotal * (coupon.discount_percentage / 100));
          } else if (coupon.discount_type === 'FIXED_AMOUNT' && coupon.discount_amount) {
            couponDiscount = coupon.discount_amount;
          }
          appliedCoupon = { code: coupon.code, discountAmount: couponDiscount };
        }
      }
    }

    // --- 步驟 5: 計算運費 (Shipping Fee) ---
    let shippingFee = 0;
    const subtotalAfterDiscount = subtotal - couponDiscount; // 運費計算應基於折扣後的金額
    if (shippingMethodId) {
        const { data: shippingRate, error: shippingError } = await supabaseAdmin
            .from('shipping_rates')
            .select('*')
            .eq('id', shippingMethodId)
            .eq('is_active', true)
            .single();

        if (shippingError) {
            console.warn(`Shipping method ID "${shippingMethodId}" not found or error:`, shippingError.message);
        } else if (shippingRate) {
            if (shippingRate.free_shipping_threshold && subtotalAfterDiscount >= shippingRate.free_shipping_threshold) {
                shippingFee = 0; // 達到免運門檻
            } else {
                shippingFee = shippingRate.rate;
            }
        }
    }

    // --- 步驟 6: 計算最終總計 (Total) ---
    const total = subtotal - couponDiscount + shippingFee;

    // --- 步驟 7: 構建並回傳完整的「購物車快照」 ---
    const cartSnapshot = {
      items: cartItems,
      itemCount: cartItems.reduce((sum, item) => sum + item.quantity, 0),
      summary: {
        subtotal: subtotal,
        couponDiscount: couponDiscount,
        shippingFee: shippingFee,
        total: total < 0 ? 0 : total, // 確保總金額不會是負數
      },
      appliedCoupon: appliedCoupon
    };

    return new Response(JSON.stringify(cartSnapshot), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});