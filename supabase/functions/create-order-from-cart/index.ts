// 檔案路徑: supabase/functions/create-order-from-cart/index.ts (Final Email Template Restored Version)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'https://esm.sh/resend@3.2.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function calculateCartSummary(supabase, cartId, couponCode, shippingMethodId) {
    const { data: cartItems, error: cartItemsError } = await supabase.from('cart_items').select(`*, product_variants(price, sale_price)`).eq('cart_id', cartId);
    if (cartItemsError) throw cartItemsError;
    if (!cartItems || cartItems.length === 0) return { items: [], summary: { subtotal: 0, couponDiscount: 0, shippingFee: 0, total: 0 }, appliedCoupon: null };
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
    return { items: cartItems, summary: { subtotal, couponDiscount, shippingFee, total: total < 0 ? 0 : total }, appliedCoupon };
}

/**
 * ✅ 【关键修正】恢复完整的、内容丰富的纯文字邮件模板
 */
function createOrderEmailText(order, orderItems, address, shippingMethod, paymentMethod) {
    const formatNumber = (num) => {
      const numberValue = Number(num);
      if (isNaN(numberValue)) return '金額錯誤';
      return `NT$ ${numberValue.toLocaleString('zh-TW')}`;
    };

    const fullAddress = `${address.postal_code || ''} ${address.city || ''}${address.district || ''}${address.street_address || ''}`.trim();
    
    const itemsList = orderItems.map(item => 
      `• ${item.product_variants.name} x ${item.quantity} = ${formatNumber(item.price_snapshot * item.quantity)}`
    ).join('\n');

    return `
Green Health 訂單確認

您好，${address.recipient_name}！

您的訂單已成功建立，以下是訂單詳細資訊：

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 訂單資訊
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
訂單編號：${order.order_number}
下單時間：${new Date(order.created_at).toLocaleString('zh-TW')}
訂單狀態：${order.status}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🛒 訂購商品
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${itemsList}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 費用明細
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
商品小計：${formatNumber(order.subtotal_amount)}${order.coupon_discount > 0 ? `
優惠折扣：-${formatNumber(order.coupon_discount)}` : ''}
運送費用：${formatNumber(order.shipping_fee)}
─────────────────────────────────
總計金額：${formatNumber(order.total_amount)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚚 配送資訊
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
收件人：${address.recipient_name}
聯絡電話：${address.phone_number}
配送地址：${fullAddress}
配送方式：${shippingMethod.method_name}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💳 付款資訊
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
付款方式：${paymentMethod.method_name}
付款狀態：${order.payment_status}
${paymentMethod.instructions ? `付款指示：\n${paymentMethod.instructions}` : ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

感謝您選擇 Green Health！我們將盡快為您處理訂單。

此為系統自動發送郵件，請勿直接回覆。
如有任何問題，請至官網客服中心與我們聯繫。

Green Health 團隊 敬上
    `.trim();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') { return new Response('ok', { headers: corsHeaders }); }
  try {
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const resend = new Resend(Deno.env.get('RESEND_API_KEY')!);
    const { cartId, selectedAddressId, selectedShippingMethodId, selectedPaymentMethodId, frontendValidationSummary } = await req.json();
    if (!cartId || !selectedAddressId || !selectedShippingMethodId || !selectedPaymentMethodId || !frontendValidationSummary) throw new Error('缺少必要的下單資訊。');
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('缺少授權標頭。');
    const { data: { user } } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''));
    if (!user) throw new Error('使用者未登入或授權無效。');

    const backendSnapshot = await calculateCartSummary(supabaseAdmin, cartId, frontendValidationSummary.couponCode, selectedShippingMethodId);
    if (backendSnapshot.summary.total !== frontendValidationSummary.total) {
      return new Response(JSON.stringify({ error: { code: 'PRICE_MISMATCH', message: '訂單金額與當前優惠不符，請重新確認。' } }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    
    const { data: address } = await supabaseAdmin.from('addresses').select('*').eq('id', selectedAddressId).single();
    const { data: shippingMethod } = await supabaseAdmin.from('shipping_rates').select('*').eq('id', selectedShippingMethodId).single();
    const { data: paymentMethod } = await supabaseAdmin.from('payment_methods').select('*').eq('id', selectedPaymentMethodId).single();
    if (!address || !shippingMethod || !paymentMethod) throw new Error('結帳所需資料不完整。');
    
    const { data: newOrder, error: orderError } = await supabaseAdmin.from('orders').insert({
        user_id: user.id, status: 'pending_payment', total_amount: backendSnapshot.summary.total,
        subtotal_amount: backendSnapshot.summary.subtotal, coupon_discount: backendSnapshot.summary.couponDiscount,
        shipping_fee: backendSnapshot.summary.shippingFee, shipping_address_snapshot: address,
        payment_method: paymentMethod.method_name, shipping_method_id: selectedShippingMethodId,
        payment_status: 'pending'
    }).select().single();
    if (orderError) throw orderError;

    const orderItemsToInsert = backendSnapshot.items.map(item => ({
        order_id: newOrder.id, product_variant_id: item.product_variant_id,
        quantity: item.quantity, price_at_order: item.price_snapshot,
    }));
    await supabaseAdmin.from('order_items').insert(orderItemsToInsert).throwOnError();
    await supabaseAdmin.from('carts').update({ status: 'completed' }).eq('id', cartId).throwOnError();

    const { data: finalOrderItems, error: finalItemsError } = await supabaseAdmin
        .from('order_items')
        .select('*, product_variants(name)')
        .eq('order_id', newOrder.id);
    if (finalItemsError) {
        console.error(`無法重新查詢訂單 ${newOrder.order_number} 的項目詳情:`, finalItemsError);
    }
    
    try {
        const emailText = createOrderEmailText(newOrder, finalOrderItems || [], address, shippingMethod, paymentMethod);
        await resend.emails.send({
          from: 'Green Health 訂單中心 <sales@greenhealthtw.com.tw>',
          to: [user.email], bcc: ['a896214@gmail.com'],
          reply_to: 'service@greenhealthtw.com.tw',
          subject: `您的 Green Health 訂單 ${newOrder.order_number} 已確認`,
          text: emailText,
        });
    } catch (emailError) {
        console.error(`[CRITICAL] 訂單 ${newOrder.order_number} 的郵件發送失敗:`, emailError);
    }
    
    return new Response(JSON.stringify({
        success: true,
        orderNumber: newOrder.order_number,
        orderDetails: { 
            order: newOrder, 
            items: finalOrderItems || [],
            address, 
            shippingMethod, 
            paymentMethod 
        }
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    
  } catch (error) {
    console.error('[create-order-from-cart] 函式最外層錯誤:', error.message, error.stack);
    return new Response(JSON.stringify({ error: error.message, stack: error.stack }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
})