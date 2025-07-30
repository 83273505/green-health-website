// 檔案路徑: supabase/functions/create-order-from-cart/index.ts (Parameter Order Final Fix)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'https://esm.sh/resend@3.2.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * [輔助函式] 在伺服器端獨立地、權威地重新計算購物車的總費用。
 * @param supabase - Supabase 的管理員權限客戶端
 * @param cartId - 要計算的購物車 ID
 * @param couponCode - 使用者嘗試套用的折扣碼
 * @param shippingMethodId - 使用者選擇的運送方式 ID
 * @returns {Promise<object>} 一個包含費用明細的物件
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

/**
 * [輔助函式] 建立訂單確認信的 HTML 內容
 */
function createOrderEmailHtml(order, orderItems, address, shippingMethod, paymentMethod) {
    const formatCurrency = (num) => new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(num);
    const itemsHtml = orderItems.map(item => `
        <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 12px; vertical-align: top;">
                <p style="margin: 0; font-weight: bold;">${item.product_variants.name}</p>
                <p style="margin: 4px 0 0; color: #666; font-size: 14px;">數量: ${item.quantity}</p>
            </td>
            <td style="padding: 12px; text-align: right; vertical-align: top;">${formatCurrency(item.price_at_order * item.quantity)}</td>
        </tr>
    `).join('');
    return `<div style="font-family: Arial, sans-serif; ...">...邮件内容...</div>`;
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
    
    // --- 核心事務邏輯開始 ---

    // ✅ 【關鍵修正】以正確的順序，將正確的變數傳遞給輔助函式
    const backendSummary = await calculateCartSummary(
        supabaseAdmin, // 第一個參數：Supabase client
        cartId,        // 第二個參數：購物車 ID
        frontendValidationSummary.couponCode, // 第三個參數：折扣碼
        selectedShippingMethodId // 第四個參數：運送方式 ID
    );

    if (backendSummary.total !== frontendValidationSummary.total) {
      return new Response(JSON.stringify({ error: { code: 'PRICE_MISMATCH', message: '訂單金額與當前優惠不符，請重新確認。' } }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    
    const { data: address } = await supabaseAdmin.from('addresses').select('*').eq('id', selectedAddressId).single();
    const { data: shippingMethod } = await supabaseAdmin.from('shipping_rates').select('*').eq('id', selectedShippingMethodId).single();
    const { data: paymentMethod } = await supabaseAdmin.from('payment_methods').select('*').eq('id', selectedPaymentMethodId).single();
    const { data: cartItems } = await supabaseAdmin.from('cart_items').select('*, product_variants!inner(id, name, price, sale_price)').eq('cart_id', cartId);
    if (!address || !shippingMethod || !paymentMethod || !cartItems || cartItems.length === 0) throw new Error('結帳所需資料不完整。');
    
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