// 檔案路徑: supabase/functions/create-order-from-cart/index.ts (Final Debug Version)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'https://esm.sh/resend@3.2.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * [輔助函式] 在伺服器端獨立地、權威地重新計算購物車的總費用。
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
    // ✅ 【增加】防御性程式码，确保 orderItems 是一个有效的阵列
    if (!Array.isArray(orderItems) || orderItems.length === 0) {
        console.error("[createOrderEmailHtml] 错误: 传入的 orderItems 为空或非阵列。");
        return "<p>您的訂單已確認，但商品項目清單在產生時發生錯誤。</p>";
    }

    try {
        const formatCurrency = (num) => new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(num);
        
        const itemsHtml = orderItems.map(item => {
            // 增加对 product_variants 的安全检查
            const variantName = item.product_variants?.name || '商品名稱未知';
            return `
                <tr style="border-bottom: 1px solid #eee;">
                    <td style="padding: 12px; vertical-align: top;">
                        <p style="margin: 0; font-weight: bold;">${variantName}</p>
                        <p style="margin: 4px 0 0; color: #666; font-size: 14px;">數量: ${item.quantity}</p>
                    </td>
                    <td style="padding: 12px; text-align: right; vertical-align: top;">${formatCurrency(item.price_at_order * item.quantity)}</td>
                </tr>
            `;
        }).join('');

        return `
            <div style="font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
                <div style="background-color: #5E8C61; color: white; padding: 24px; text-align: center;">
                    <h1 style="margin: 0; color: white; font-size: 24px;">Green Health 綠健</h1>
                </div>
                <div style="padding: 24px;">
                    <h2 style="color: #333; font-size: 20px;">您好，${address.recipient_name}！</h2>
                    <p>感謝您的訂購。您的訂單 <strong>${order.order_number}</strong> 已經成功建立，我們將會盡快為您處理。</p>
                    <hr style="border: 0; border-top: 1px solid #eee; margin: 24px 0;">
                    
                    <h3 style="font-size: 18px; margin-bottom: 16px;">訂單商品</h3>
                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
                        <thead>
                            <tr style="background-color: #f7f7f7;">
                                <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; font-size: 14px;">品項</th>
                                <th style="padding: 12px; text-align: right; border-bottom: 1px solid #ddd; font-size: 14px;">小計</th>
                            </tr>
                        </thead>
                        <tbody>${itemsHtml}</tbody>
                    </table>

                    <h3 style="font-size: 18px; margin-bottom: 16px;">費用明細</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr><td style="padding: 6px 0;">商品小計</td><td style="padding: 6px 0; text-align: right;">${formatCurrency(order.subtotal_amount)}</td></tr>
                        ${order.coupon_discount > 0 ? `<tr><td style="padding: 6px 0; color: #D9534F;">折扣優惠</td><td style="padding: 6px 0; text-align: right; color: #D9534F;">- ${formatCurrency(order.coupon_discount)}</td></tr>` : ''}
                        <tr><td style="padding: 6px 0;">運費</td><td style="padding: 6px 0; text-align: right;">${formatCurrency(order.shipping_fee)}</td></tr>
                        <tr style="font-weight: bold; border-top: 1px solid #ccc; font-size: 1.2em;">
                            <td style="padding: 12px 0;">總金額</td><td style="padding: 12px 0; text-align: right;">${formatCurrency(order.total_amount)}</td>
                        </tr>
                    </table>

                    <hr style="border: 0; border-top: 1px solid #eee; margin: 24px 0;">

                    <h3 style="font-size: 18px; margin-bottom: 16px;">收件人資訊</h3>
                    <div style="background-color: #f7f7f7; padding: 16px; border-radius: 6px;">
                        <p style="margin: 0;">${address.recipient_name}</p>
                        <p style="margin: 4px 0;">${address.phone_number}</p>
                        <p style="margin: 4px 0 0;">${address.postal_code} ${address.city}${address.district}${address.street_address}</p>
                    </div>

                    <h3 style="font-size: 18px; margin-top: 24px; margin-bottom: 16px;">運送與付款資訊</h3>
                    <div style="background-color: #f7f7f7; padding: 16px; border-radius: 6px;">
                        <p style="margin: 0;"><strong>運送方式：</strong> ${shippingMethod?.method_name || '未指定'}</p>
                        <p style="margin: 4px 0 0;"><strong>付款方式：</strong> ${order.payment_method}</p>
                        ${paymentMethod?.instructions ? `<p style="margin: 12px 0 0; border-top: 1px dashed #ccc; padding-top: 12px;"><strong>付款資訊：</strong><br>${paymentMethod.instructions.replace(/\n/g, '<br>')}</p>` : ''}
                    </div>
                </div>
                <div style="background-color: #f0f0f0; padding: 20px; text-align: center; font-size: 12px; color: #888;">
                    <p style="margin:0;">如有任何問題，請直接回覆此郵件或透過官網客服中心與我們聯繫。</p>
                    <p style="margin:5px 0 0;">Green Health 綠健 感謝您的支持！</p>
                </div>
            </div>
        `;
    } catch (e) {
        console.error("建立郵件 HTML 時發生严重错误:", e);
        return "<p>您的訂單已確認，但郵件內容在產生時發生了预期外的错误。</p>";
    }
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

    const orderItemsToInsert = cartItems.map(item => ({
        order_id: newOrder.id, product_variant_id: item.product_variant_id,
        quantity: item.quantity, price_at_order: item.price_snapshot,
    }));
    await supabaseAdmin.from('order_items').insert(orderItemsToInsert).throwOnError();
    await supabaseAdmin.from('carts').update({ status: 'completed' }).eq('id', cartId).throwOnError();
    
    try {
        const emailHtml = createOrderEmailHtml(newOrder, cartItems, address, shippingMethod, paymentMethod);
        
        // ✅ 【核心除錯步驟】將產生的 HTML 內容打印到伺服器日誌中
        console.log('[DEBUG] 準備發送郵件。HTML 內容長度:', emailHtml.length);
        console.log('[DEBUG] 郵件 HTML 內容預覽:', emailHtml.substring(0, 500)); // 打印前 500 個字元預覽

        await resend.emails.send({
          from: 'Green Health 訂單中心 <sales@greenhealthtw.com.tw>',
          to: [user.email], 
          bcc: ['a896214@gmail.com'],
          reply_to: 'service@greenhealthtw.com.tw',
          subject: `您的 Green Health 訂單 ${newOrder.order_number} 已確認`,
          html: emailHtml,
        });
        console.log(`訂單 ${newOrder.order_number} 的確認郵件已成功發送。`);
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