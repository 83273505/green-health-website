// 檔案路徑: supabase/functions/recalculate-cart/index.ts (Final Authority Calculator)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * [輔助函式] 這是此函式的核心計算引擎
 */
async function calculateCartSummary(supabase, cartId, couponCode, shippingMethodId) {
    const { data: cartItems, error: cartItemsError } = await supabase.from('cart_items').select(`*, product_variants(price, sale_price)`).eq('cart_id', cartId);
    if (cartItemsError) throw cartItemsError;
    
    // 如果購物車是空的，直接回傳初始狀態
    if (!cartItems || cartItems.length === 0) {
        return {
            items: [], itemCount: 0,
            summary: { subtotal: 0, couponDiscount: 0, shippingFee: 0, total: 0 },
            appliedCoupon: null,
        };
    }

    const subtotal = cartItems.reduce((sum, item) => sum + Math.round((item.product_variants.sale_price ?? item.product_variants.price) * item.quantity), 0);
    
    let couponDiscount = 0;
    let appliedCoupon = null;
    if (couponCode) {
        const { data: coupon } = await supabase.from('coupons').select('*').eq('code', couponCode).eq('is_active', true).single();
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
        const { data: shippingRate } = await supabase.from('shipping_rates').select('*').eq('id', shippingMethodId).eq('is_active', true).single();
        if (shippingRate && (!shippingRate.free_shipping_threshold || subtotalAfterDiscount < shippingRate.free_shipping_threshold)) {
            shippingFee = Math.round(shippingRate.rate);
        }
    }
    const total = subtotal - couponDiscount + shippingFee;
    
    return {
        items: cartItems,
        itemCount: cartItems.reduce((sum, item) => sum + item.quantity, 0),
        summary: { subtotal, couponDiscount, shippingFee, total: total < 0 ? 0 : total },
        appliedCoupon,
    };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { cartId, couponCode, shippingMethodId } = await req.json();
    if (!cartId) throw new Error("缺少 cartId");

    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    
    // 直接呼叫輔助函式來完成所有計算
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