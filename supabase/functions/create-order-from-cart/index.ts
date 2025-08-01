// 檔案路徑: supabase/functions/create-order-from-cart/index.ts (Final Defensive Check Version)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'https://esm.sh/resend@3.2.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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

function createOrderEmailHtml(order, orderItems, address, shippingMethod, paymentMethod) {
    const formatCurrency = (num) => new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(num);
    const itemsHtml = orderItems.map(item => `...`).join('');
    return `<div>...郵件內容...</div>`;
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
    
    const [addressRes, shippingMethodRes, paymentMethodRes, cartItemsRes] = await Promise.all([
        supabaseAdmin.from('addresses').select('*').eq('id', selectedAddressId).eq('user_id', user.id).single(),
        supabaseAdmin.from('shipping_rates').select('*').eq('id', selectedShippingMethodId).single(),
        supabaseAdmin.from('payment_methods').select('*').eq('id', selectedPaymentMethodId).single(),
        supabaseAdmin.from('cart_items').select('*, product_variants!inner(id, name, price, sale_price)').eq('cart_id', cartId)
    ]);
    if (addressRes.error || !addressRes.data) throw new Error(`找不到地址: ${addressRes.error?.message}`);
    if (shippingMethodRes.error || !shippingMethodRes.data) throw new Error(`找不到運送方式: ${shippingMethodRes.error?.message}`);
    if (paymentMethodRes.error || !paymentMethodRes.data) throw new Error(`找不到付款方式: ${paymentMethodRes.error?.message}`);
    if (cartItemsRes.error || !cartItemsRes.data || cartItemsRes.data.length === 0) throw new Error(`購物車為空或讀取失敗: ${cartItemsRes.error?.message}`);
    
    const address = addressRes.data, shippingMethod = shippingMethodRes.data, paymentMethod = paymentMethodRes.data, cartItems = cartItemsRes.data;
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

    // ✅ 【關鍵修正】在將購物車項目複製到訂單項目之前，增加最終的防禦性檢查
    const orderItemsToInsert = cartItems.map(item => {
        // 確保 price_snapshot 絕對不是 null 或 undefined
        if (item.price_snapshot === null || item.price_snapshot === undefined) {
            // 如果發現無效值，立即拋出一個明確的錯誤，這會讓整個函式失敗並回傳 500，
            // 並且會在後端日誌中留下清晰的記錄。
            throw new Error(`購物車項目 (ID: ${item.id}) 缺少有效的 price_snapshot，無法建立訂單。`);
        }
        
        return {
            order_id: newOrder.id,
            product_variant_id: item.product_variant_id,
            quantity: item.quantity,
            price_at_order: item.price_snapshot, // 現在我們可以確定這個值是有效的
        };
    });

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
    console.error('[create-order-from-cart] 函式最外層錯誤:', error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
})