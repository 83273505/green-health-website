// 檔案路徑: supabase/functions/recalculate-cart/index.ts (Final Query Fix Version)

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
    
    const { cartId, actions, couponCode, shippingMethodId } = await req.json();
    if (!cartId) throw new Error('購物車 ID 為必需項。');

    // --- 步驟 1: 執行操作 ---
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
    // ✅ 【關鍵修正】移除 `!inner`，改回使用 Supabase 預設的、更寬容的左連接 (Left Join)。
    // 這能確保即使關聯的 products/product_variants 資料有問題，cart_items 本身還是能被查詢出來。
    const { data: cartItems, error: cartItemsError } = await supabaseAdmin
      .from('cart_items')
      .select(`
        *,
        product_variants (
          name,
          price,
          sale_price,
          products (
            image_url
          )
        )
      `)
      .eq('cart_id', cartId)
      .order('added_at', { ascending: true });

    if (cartItemsError) throw cartItemsError;

    // --- 後續的計算邏輯維持不變 ---
    const subtotal = cartItems.reduce((sum, item) => {
        // 增加一個安全檢查，以防 product_variants 因為某些原因沒有被成功關聯
        const variant = item.product_variants || { price: item.price_snapshot, sale_price: null };
        const price = variant.sale_price ?? variant.price;
        return sum + Math.round(price * item.quantity);
    }, 0);
    
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
        if (shippingRate && (!shippingRate.free_shipping_threshold || subtotalAfterDiscount < shippingRate.free_shipping_threshold)) {
            shippingFee = Math.round(shippingRate.rate);
        }
    }
    const total = subtotal - couponDiscount + shippingFee;

    const cartSnapshot = {
      items: cartItems,
      itemCount: cartItems.reduce((sum, item) => sum + item.quantity, 0),
      summary: { subtotal, couponDiscount, shippingFee, total: total < 0 ? 0 : total },
      appliedCoupon,
    };

    return new Response(JSON.stringify(cartSnapshot), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
  } catch (error) {
    console.error('[recalculate-cart] 函式內部錯誤:', error.message);
    return new Response(JSON.stringify({ error: error.message }), { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
})