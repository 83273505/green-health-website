// 檔案路径: supabase/functions/create-order-from-cart/index.ts (Final Plain Text Email Restored Version)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'https://esm.sh/resend@3.2.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const handler = {
  /**
   * [私有方法] 格式化數字為簡單的台幣字串
   */
  _formatNumber(num) {
    const numberValue = Number(num);
    if (isNaN(numberValue)) return '金額錯誤';
    return `NT$ ${numberValue.toLocaleString('zh-TW')}`;
  },

  /**
   * [私有方法] 購物車計算核心引擎
   */
  async _calculateCartSummary(supabase, cartId, couponCode, shippingMethodId) {
    const { data: cartItems, error: cartItemsError } = await supabase.from('cart_items').select(`*, product_variants(name, price, sale_price, products(image_url))`).eq('cart_id', cartId);
    if (cartItemsError) throw cartItemsError;
    if (!cartItems || cartItems.length === 0) {
      return { items: [], itemCount: 0, summary: { subtotal: 0, couponDiscount: 0, shippingFee: 0, total: 0 }, appliedCoupon: null };
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
  },

  /**
   * ✅ 【关键修正】[私有方法] 建立订单确认邮件的纯文字版本
   */
  _createOrderEmailText(order, orderItems, address, shippingMethod, paymentMethod) {
    const fullAddress = `${address.postal_code || ''} ${address.city || ''}${address.district || ''}${address.street_address || ''}`.trim();
    
    const itemsList = orderItems.map(item => {
      const priceAtOrder = parseFloat(item.price_snapshot);
      const quantity = parseInt(item.quantity, 10);
      const variantName = item.product_variants?.name || '未知品项';
      if (isNaN(priceAtOrder) || isNaN(quantity)) {
        return `• ${variantName} (数量: ${item.quantity}) - 金额计算错误`;
      }
      return `• ${variantName}\n  数量: ${quantity} × 单价: ${this._formatNumber(priceAtOrder)} = 小计: ${this._formatNumber(priceAtOrder * quantity)}`;
    }).join('\n\n');

    return `
Green Health 訂單確認

您好，${address.recipient_name}！

您的订单已成功建立，以下是订单详细资讯：

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
商品小計：${this._formatNumber(order.subtotal_amount)}${order.coupon_discount > 0 ? `
優惠折扣：-${this._formatNumber(order.coupon_discount)}` : ''}
運送費用：${this._formatNumber(order.shipping_fee)}
─────────────────────────────────
總計金額：${this._formatNumber(order.total_amount)}

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
  },

  async handleRequest(req) {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '', 
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', 
      { auth: { persistSession: false } }
    );
    const resend = new Resend(Deno.env.get('RESEND_API_KEY')!);
    const { cartId, selectedAddressId, selectedShippingMethodId, selectedPaymentMethodId, frontendValidationSummary } = await req.json();
    if (!cartId || !selectedAddressId || !selectedShippingMethodId || !selectedPaymentMethodId || !frontendValidationSummary) {
      throw new Error('缺少必要的下单资讯。');
    }
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('缺少授权标头。');
    const { data: { user } } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''));
    if (!user) throw new Error('使用者未登入或授权无效。');
    const backendSnapshot = await this._calculateCartSummary(supabaseAdmin, cartId, frontendValidationSummary.couponCode, selectedShippingMethodId);
    const backendSummary = backendSnapshot.summary;
    if (backendSummary.total !== frontendValidationSummary.total) {
      return new Response(JSON.stringify({ 
        error: { code: 'PRICE_MISMATCH', message: '订单金额与当前优惠不符，请重新确认。' } 
      }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const cartItems = backendSnapshot.items;
    if (!cartItems || cartItems.length === 0) throw new Error('无法建立订单，因为购物车是空的。');
    const { data: address } = await supabaseAdmin.from('addresses').select('*').eq('id', selectedAddressId).single();
    const { data: shippingMethod } = await supabaseAdmin.from('shipping_rates').select('*').eq('id', selectedShippingMethodId).single();
    const { data: paymentMethod } = await supabaseAdmin.from('payment_methods').select('*').eq('id', selectedPaymentMethodId).single();
    if (!address || !shippingMethod || !paymentMethod) throw new Error('结帐所需资料不完整。');
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
      const emailText = this._createOrderEmailText(newOrder, cartItems, address, shippingMethod, paymentMethod);
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
      orderDetails: { order: newOrder, items: cartItems, address, shippingMethod, paymentMethod }
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') { 
    return new Response('ok', { headers: corsHeaders }); 
  }
  try {
    return await handler.handleRequest(req);
  } catch (error) {
    console.error('[create-order-from-cart] 函式最外層錯誤:', error.message, error.stack);
    return new Response(JSON.stringify({ 
      error: `[create-order-from-cart]: ${error.message}` 
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
})