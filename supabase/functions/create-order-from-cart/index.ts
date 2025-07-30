// 檔案路徑: supabase/functions/create-order-from-cart/index.ts (Final Robust Version)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'https://esm.sh/resend@3.2.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function calculateCartSummary(cartItems, couponCode, shippingMethod, supabase) {
    const subtotal = cartItems.reduce((sum, item) => sum + Math.round(item.price_snapshot * item.quantity), 0);
    let couponDiscount = 0;
    if (couponCode) {
        const { data: coupon } = await supabase.from('coupons').select('*').eq('code', couponCode).single();
        if (coupon && subtotal >= coupon.min_purchase_amount) {
            if (coupon.discount_type === 'PERCENTAGE') couponDiscount = Math.round(subtotal * (coupon.discount_percentage / 100));
            else if (coupon.discount_type === 'FIXED_AMOUNT') couponDiscount = Math.round(coupon.discount_amount);
        }
    }
    let shippingFee = 0;
    const subtotalAfterDiscount = subtotal - couponDiscount;
    if (shippingMethod && (!shippingMethod.free_shipping_threshold || subtotalAfterDiscount < shippingMethod.free_shipping_threshold)) {
        shippingFee = Math.round(shippingMethod.rate);
    }
    const total = subtotal - couponDiscount + shippingFee;
    return { subtotal, couponDiscount, shippingFee, total: total < 0 ? 0 : total };
}

function createOrderEmailHtml(order, orderItems, address, shippingMethod, paymentMethod) {
    const formatCurrency = (num) => new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(num);
    const itemsHtml = orderItems.map(item => `...`).join(''); // 省略邮件模板细节
    return `<div style="font-family: Arial, sans-serif; ...">...</div>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') { return new Response('ok', { headers: corsHeaders }); }
  try {
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const resend = new Resend(Deno.env.get('RESEND_API_KEY')!);

    const { cartId, selectedAddressId, selectedShippingMethodId, selectedPaymentMethodId, frontendValidationSummary } = await req.json();
    if (!cartId || !selectedAddressId || !selectedShippingMethodId || !selectedPaymentMethodId || !frontendValidationSummary) throw new Error('缺少必要的下單資訊。');
    
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('缺少授權標頭。');
    const { data: { user } } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''));
    if (!user) throw new Error('使用者未登入或授權無效。');

    // ✅ 【关键修正】在所有操作前，先一次性地、并行地获取所有需要的外部资料
    const [addressRes, shippingMethodRes, paymentMethodRes, cartItemsRes] = await Promise.all([
        supabaseAdmin.from('addresses').select('*').eq('id', selectedAddressId).eq('user_id', user.id).single(),
        supabaseAdmin.from('shipping_rates').select('*').eq('id', selectedShippingMethodId).single(),
        supabaseAdmin.from('payment_methods').select('*').eq('id', selectedPaymentMethodId).single(),
        supabaseAdmin.from('cart_items').select('*, product_variants!inner(id, name, price, sale_price)').eq('cart_id', cartId)
    ]);

    if (addressRes.error || shippingMethodRes.error || paymentMethodRes.error || cartItemsRes.error) {
        console.error({ addressError: addressRes.error, shippingError: shippingMethodRes.error, paymentError: paymentMethodRes.error, cartItemsError: cartItemsRes.error });
        throw new Error('無法獲取完整的結帳資料，請重試。');
    }
    const address = addressRes.data;
    const shippingMethod = shippingMethodRes.data;
    const paymentMethod = paymentMethodRes.data;
    const cartItems = cartItemsRes.data;

    // --- 核心事务逻辑开始 ---
    const backendSummary = await calculateCartSummary(cartItems, frontendValidationSummary.couponCode, shippingMethod, supabaseAdmin);
    if (backendSummary.total !== frontendValidationSummary.total) {
      return new Response(JSON.stringify({ error: { code: 'PRICE_MISMATCH', message: '訂單金額與當前優惠不符，請重新確認。' } }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    
    const { data: newOrder, error: orderError } = await supabaseAdmin.from('orders').insert({
        user_id: user.id, status: 'pending_payment', total_amount: backendSummary.total,
        subtotal_amount: backendSummary.subtotal, coupon_discount: backendSummary.couponDiscount,
        shipping_fee: backendSummary.shippingFee, shipping_address_snapshot: address,
        payment_method: paymentMethod.method_name, shipping_method_id: selectedShippingMethodId,
        payment_status: 'pending'
    }).select().single();
    if (orderError) throw orderError;

    const orderItemsToInsert = cartItems.map(item => ({
        order_id: newOrder.id, product_variant_id: item.product_variant_id,
        quantity: item.quantity, price_at_order: item.price_snapshot,
    }));
    await supabaseAdmin.from('order_items').insert(orderItemsToInsert).throwOnError();
    await supabaseAdmin.from('carts').update({ status: 'completed' }).eq('id', cartId).throwOnError();
    
    try {
        const emailHtml = createOrderEmailHtml(newOrder, cartItems, address, shippingMethod, paymentMethod);
        await resend.emails.send({
          from: 'Green Health 訂單中心 <sales@greenhealthtw.com.tw>',
          to: [user.email], bcc: ['a896214@gmail.com'],
          reply_to: 'service@greenhealthtw.com.tw',
          subject: `您的 Green Health 訂單 ${newOrder.order_number} 已確認`,
          html: emailHtml,
        });
    } catch (emailError) {
        console.error(`[CRITICAL] 訂單 ${newOrder.order_number} 的郵件發送失敗:`, emailError);
    }
    
    return new Response(JSON.stringify({
        success: true,
        orderNumber: newOrder.order_number,
        orderDetails: { order: newOrder, items: cartItems, address, shippingMethod, paymentMethod }
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    
  } catch (error) {
    console.error('[create-order-from-cart] 函式內部錯誤:', error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
})