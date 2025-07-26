// 檔案路徑: supabase/functions/recalculate-cart/index.ts (Price Snapshot Fix - Final Version)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
    if (!cartId) throw new Error('購物車 ID 為必需項。')

    // --- 步驟 1: 執行操作 (Actions) ---
    if (actions && actions.length > 0) {
      for (const action of actions) {
        switch (action.type) {
          case 'ADD_ITEM': {
            const { variantId, quantity } = action.payload;
            if (!variantId || !quantity) throw new Error('ADD_ITEM 需要 variantId 和 quantity。');
            
            // ✅ 【關鍵修正】在獲取價格快照時，同時獲取原價和特價
            const { data: variant, error: variantError } = await supabaseAdmin
              .from('product_variants')
              .select('price, sale_price') // 同時查詢兩個價格欄位
              .eq('id', variantId)
              .single();
              
            if(variantError) throw new Error('找不到指定的商品規格。');
            
            // ✅ 【關鍵修正】優先使用特價 (sale_price)，如果不存在或無效(例如為0)，則使用原價 (price)
            const price_snapshot = (variant.sale_price && variant.sale_price > 0) ? variant.sale_price : variant.price;

            // 使用 upsert，並傳入修正後的價格快照
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
            if (!itemId || typeof newQuantity !== 'number') throw new Error('UPDATE_ITEM_QUANTITY 需要 itemId 和 newQuantity。');
            if (newQuantity > 0) {
              await supabaseAdmin.from('cart_items').update({ quantity: newQuantity }).eq('id', itemId).throwOnError();
            } else {
              await supabaseAdmin.from('cart_items').delete().eq('id', itemId).throwOnError();
            }
            break;
          }
          case 'REMOVE_ITEM': {
            const { itemId } = action.payload;
            if (!itemId) throw new Error('REMOVE_ITEM 需要 itemId。');
            await supabaseAdmin.from('cart_items').delete().eq('id', itemId).throwOnError();
            break;
          }
        }
      }
    }

    // --- 步驟 2: 重新查詢購物車的最新內容 ---
    const { data: cartItems, error: cartItemsError } = await supabaseAdmin
      .from('cart_items')
      .select(`*, product_variants (name, price, sale_price, products ( image_url ))`)
      .eq('cart_id', cartId)
      .order('added_at', { ascending: true });

    if (cartItemsError) throw cartItemsError;

    // --- 步驟 3: 計算商品小計 (Subtotal) ---
    // ✅ 現在這個計算會自動基於正確的 price_snapshot，無需修改
    const subtotal = cartItems.reduce((sum, item) => sum + (item.price_snapshot * item.quantity), 0);

    // --- 步驟 4, 5, 6: 計算折扣、運費、總計 (維持不變) ---
    let couponDiscount = 0;
    let appliedCoupon = null;
    if (couponCode) {
      const { data: coupon } = await supabaseAdmin.from('coupons').select('*').eq('code', couponCode).eq('is_active', true).single();
      if (coupon && subtotal >= coupon.min_purchase_amount) {
          if (coupon.discount_type === 'PERCENTAGE' && coupon.discount_percentage) {
            couponDiscount = Math.round(subtotal * (coupon.discount_percentage / 100));
          } else if (coupon.discount_type === 'FIXED_AMOUNT' && coupon.discount_amount) {
            couponDiscount = coupon.discount_amount;
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
                shippingFee = shippingRate.rate;
            }
        }
    }
    const total = subtotal - couponDiscount + shippingFee;

    // --- 步驟 7: 構建並回傳完整的「購物車快照」 (維持不變) ---
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
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});