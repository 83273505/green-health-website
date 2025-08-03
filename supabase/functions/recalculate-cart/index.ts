// 檔案路徑: supabase/functions/recalculate-cart/index.ts
// ----------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ----------------------------------------------------

// 【核心修正】從 import_map.json 引入依賴
import { createClient } from 'supabase-js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const handler = {
  /**
   * [私有方法] 購物車計算核心引擎 - 與 create-order-from-cart 完全一致
   */
  async _calculateCartSummary(supabase, cartId, couponCode, shippingMethodId) {
    const { data: cartItems, error: cartItemsError } = await supabase
      .from('cart_items')
      .select(`*, product_variants(name, price, sale_price, products(image_url))`)
      .eq('cart_id', cartId);
    
    if (cartItemsError) throw cartItemsError;

    if (!cartItems || cartItems.length === 0) {
      return { 
        items: [], 
        itemCount: 0, 
        summary: { subtotal: 0, couponDiscount: 0, shippingFee: 0, total: 0 }, 
        appliedCoupon: null 
      };
    }

    const subtotal = cartItems.reduce((sum, item) => 
      sum + Math.round((item.product_variants.sale_price ?? item.product_variants.price) * item.quantity), 0
    );

    let couponDiscount = 0;
    let appliedCoupon = null;
    
    if (couponCode) {
      const { data: coupon } = await supabase
        .from('coupons')
        .select('*')
        .eq('code', couponCode)
        .eq('is_active', true)
        .single();
      
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
      const { data: shippingRate } = await supabase
        .from('shipping_rates')
        .select('*')
        .eq('id', shippingMethodId)
        .eq('is_active', true)
        .single();
      
      if (shippingRate && (!shippingRate.free_shipping_threshold || subtotalAfterDiscount < shippingRate.free_shipping_threshold)) {
        shippingFee = Math.round(shippingRate.rate);
      }
    }

    const total = subtotal - couponDiscount + shippingFee;
    
    return {
      items: cartItems,
      itemCount: cartItems.reduce((sum, item) => sum + item.quantity, 0),
      summary: { 
        subtotal, 
        couponDiscount, 
        shippingFee, 
        total: total < 0 ? 0 : total 
      },
      appliedCoupon,
    };
  },

  /**
   * [主處理函式] 處理購物車操作和重新計算
   */
  async handleRequest(req) {
    const { cartId, couponCode, shippingMethodId, actions } = await req.json();
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!, 
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, 
      { auth: { persistSession: false } }
    );
    
    // 如果有 actions，則先執行資料庫操作
    if (actions && actions.length > 0) {
      if (!cartId) throw new Error("執行購物車操作時需要 cartId。");
      
      for (const action of actions) {
        switch (action.type) {
          case 'ADD_ITEM': {
            const { variantId, quantity } = action.payload;
            const { data: variant, error: vError } = await supabaseAdmin
              .from('product_variants')
              .select('price, sale_price')
              .eq('id', variantId)
              .single();
            
            if(vError) throw new Error('找不到指定的商品規格。');
            
            const price_snapshot = (variant.sale_price && variant.sale_price > 0) ? variant.sale_price : variant.price;
            
            await supabaseAdmin.from('cart_items').upsert({
              cart_id: cartId, 
              product_variant_id: variantId, 
              quantity: quantity, 
              price_snapshot: price_snapshot,
            }, { onConflict: 'cart_id,product_variant_id' }).throwOnError();
            break;
          }
          case 'UPDATE_ITEM_QUANTITY': {
            const { itemId, newQuantity } = action.payload;
            if (newQuantity > 0) {
              await supabaseAdmin.from('cart_items')
                .update({ quantity: newQuantity })
                .eq('id', itemId)
                .throwOnError();
            } else {
              await supabaseAdmin.from('cart_items')
                .delete()
                .eq('id', itemId)
                .throwOnError();
            }
            break;
          }
          case 'REMOVE_ITEM': {
            const { itemId } = action.payload;
            await supabaseAdmin.from('cart_items')
              .delete()
              .eq('id', itemId)
              .throwOnError();
            break;
          }
        }
      }
    }
    
    // 在所有操作完成後，計算並回傳最新的購物車快照
    const cartSnapshot = await this._calculateCartSummary(supabaseAdmin, cartId, couponCode, shippingMethodId);

    return new Response(JSON.stringify(cartSnapshot), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  
  try {
    return await handler.handleRequest(req);
  } catch (e) {
    console.error('[recalculate-cart] 函式錯誤:', e.message, e.stack);
    return new Response(JSON.stringify({ error: `[recalculate-cart]: ${e.message}` }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});