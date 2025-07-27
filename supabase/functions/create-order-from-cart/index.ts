// 檔案路徑: supabase/functions/create-order-from-cart/index.ts (Shipping Method Link Final Version)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * 輔助函式，用於在伺服器端獨立地、權威地重新計算購物車的總費用。
 */
async function calculateCartSummary(supabase, cartId, couponCode, shippingMethodId) {
    const { data: cartItems, error: cartItemsError } = await supabase.from('cart_items').select(`*, product_variants(price, sale_price)`).eq('cart_id', cartId);
    if (cartItemsError) throw cartItemsError;

    const subtotal = cartItems.reduce((sum, item) => sum + Math.round((item.product_variants.sale_price ?? item.product_variants.price) * item.quantity), 0);
    
    let couponDiscount = 0;
    if (couponCode) {
        const { data: coupon } = await supabase.from('coupons').select('*').eq('code', couponCode).single();
        if (coupon && subtotal >= coupon.min_purchase_amount) {
            if (coupon.discount_type === 'PERCENTAGE' && coupon.discount_percentage) {
                couponDiscount = Math.round(subtotal * (coupon.discount_percentage / 100));
            } else if (coupon.discount_type === 'FIXED_AMOUNT' && coupon.discount_amount) {
                couponDiscount = Math.round(coupon.discount_amount);
            }
        }
    }

    let shippingFee = 0;
    const subtotalAfterDiscount = subtotal - couponDiscount;
    if (shippingMethodId) {
        const { data: rate } = await supabase.from('shipping_rates').select('*').eq('id', shippingMethodId).single();
        if (rate && (!rate.free_shipping_threshold || subtotalAfterDiscount < rate.free_shipping_threshold)) {
            shippingFee = Math.round(rate.rate);
        }
    }
    
    const total = subtotal - couponDiscount + shippingFee;
    return { subtotal, couponDiscount, shippingFee, total: total < 0 ? 0 : total };
}

Deno.serve(async (req) => {
  // 處理瀏覽器的 CORS 預檢請求
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    
    const { cartId, selectedAddressId, selectedShippingMethodId, selectedPaymentMethodId, frontendValidationSummary } = await req.json();
    if (!cartId || !selectedAddressId || !selectedShippingMethodId || !selectedPaymentMethodId || !frontendValidationSummary) {
        throw new Error('缺少必要的下單資訊。');
    }
    
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('缺少授權標頭。');
    
    const { data: { user } } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''))
    if (!user) throw new Error('使用者未登入或授權無效。')

    // === 核心事務邏輯開始 ===
    const backendSummary = await calculateCartSummary(supabaseAdmin, cartId, frontendValidationSummary.couponCode, selectedShippingMethodId);

    if (backendSummary.total !== frontendValidationSummary.total) {
      return new Response(JSON.stringify({
        error: { code: 'PRICE_MISMATCH', message: '訂單金額與當前優惠不符，請返回購物車重新確認。' }
      }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: address, error: addressError } = await supabaseAdmin.from('addresses').select('*').eq('id', selectedAddressId).eq('user_id', user.id).single();
    if (addressError) throw new Error('找不到指定的收貨地址。');

    const { data: cartItems, error: cartItemsError } = await supabaseAdmin.from('cart_items').select('*, product_variants(id, name)').eq('cart_id', cartId);
    if (cartItemsError || !cartItems || cartItems.length === 0) throw new Error('購物車為空或讀取失敗。');
    
    const { data: paymentMethod } = await supabaseAdmin.from('payment_methods').select('method_name').eq('id', selectedPaymentMethodId).single();
    
    // 5. 【建立訂單】
    const { data: newOrder, error: orderError } = await supabaseAdmin.from('orders').insert({
        user_id: user.id,
        status: 'pending_payment',
        total_amount: backendSummary.total,
        subtotal_amount: backendSummary.subtotal,
        coupon_discount: backendSummary.couponDiscount,
        shipping_fee: backendSummary.shippingFee,
        shipping_address_snapshot: address,
        payment_method: paymentMethod?.method_name || '未知',
        payment_status: 'pending',
        // ✅ 【關鍵新增】將使用者選擇的運送方式 ID 寫入我們在資料庫新增的欄位
        shipping_method_id: selectedShippingMethodId
    }).select().single();
    if (orderError) throw orderError;
    
    // 6. 【複製商品】
    const orderItemsToInsert = cartItems.map(item => ({
        order_id: newOrder.id,
        product_variant_id: item.product_variant_id,
        quantity: item.quantity,
        price_at_order: item.price_snapshot,
    }));
    const { error: orderItemsError } = await supabaseAdmin.from('order_items').insert(orderItemsToInsert);
    if (orderItemsError) throw orderItemsError;
    
    // 7. 【清理購物車】
    await supabaseAdmin.from('carts').update({ status: 'completed' }).eq('id', cartId);

    // 8. 【成功回應】
    return new Response(JSON.stringify({ orderNumber: newOrder.order_number }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
})