// 檔案路徑: supabase/functions/recalculate-cart/index.ts (Empty Request Handling - Final Version)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

/**
 * [核心邏輯處理器]
 * 處理請求的核心業務邏輯，並確保所有非同步操作都被正確等待。
 * @param {Request} req - 傳入的請求物件
 * @returns {Promise<Response>} - 最終的回應物件
 */
async function handleRequest(req: Request): Promise<Response> {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { global: { fetch: fetch.bind(globalThis) } }
    )
    
    // ✅ 【關鍵修正】使用更安全、更具容錯性的方式來解析請求 body
    let cartId: string | null = null;
    let actions: any[] = [];
    let couponCode: string | null = null;
    let shippingMethodId: string | null = null;

    try {
        const body = await req.json();
        cartId = body.cartId ?? null;
        actions = body.actions ?? [];
        couponCode = body.couponCode ?? null;
        shippingMethodId = body.shippingMethodId ?? null;
    } catch (_) {
        // 如果 body 不是有效的 JSON (例如空的 POST 請求)，則忽略錯誤，
        // 讓所有變數保持預設值 (null 或 [])，程式會繼續往下走到 if (!cartId) 的安全回退邏輯。
    }

    // ✅ 【關鍵修正】如果請求中沒有有效的 cartId (例如在初始化時)，
    // 則安全地回傳一個標準的空購物車物件，而不是拋出錯誤。
    if (!cartId) {
        const emptySnapshot = {
            items: [],
            itemCount: 0,
            summary: { subtotal: 0, couponDiscount: 0, shippingFee: 0, total: 0 },
            appliedCoupon: null,
        };
        return new Response(JSON.stringify(emptySnapshot), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200, // 這是一個正常的、預期的情境，所以回傳 200 OK
        });
    }

    // --- 步驟 1: 只有在 actions 陣列存在且有內容時，才執行操作 ---
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
            }, { onConflict: 'cart_id,product_variant_id', ignoreDuplicates: false }).throwOnError();
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

    // --- 後續的查詢和計算邏輯維持不變 ---
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

    return new Response(JSON.stringify(cartSnapshot), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
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