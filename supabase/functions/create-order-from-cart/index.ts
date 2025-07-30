// 檔案路徑: supabase/functions/create-order-from-cart/index.ts (Final Robust Version)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'https://esm.sh/resend@3.2.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * [辅助函式] 这是一个纯计算函式，不再自行查询资料库
 * @param {Array} cartItems - 预先查询好的购物车项目
 * @param {string | null} couponCode - 使用者尝试套用的折扣码
 * @param {object} shippingMethod - 预先查询好的运送方式物件
 * @param {object} supabase - Supabase client (仅用于查询 coupon)
 * @returns {Promise<object>} 一個包含费用明细的物件
 */
async function calculateCartSummary(cartItems, couponCode, shippingMethod, supabase) {
    const subtotal = cartItems.reduce((sum, item) => sum + Math.round(item.price_snapshot * item.quantity), 0);
    
    let couponDiscount = 0;
    // ✅ 【关键修正】只有在 couponCode 真实存在 (非空字串) 时才查询
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
    if (shippingMethod && (!shippingMethod.free_shipping_threshold || subtotalAfterDiscount < shippingMethod.free_shipping_threshold)) {
        shippingFee = Math.round(shippingMethod.rate);
    }
    
    const total = subtotal - couponDiscount + shippingFee;
    return { subtotal, couponDiscount, shippingFee, total: total < 0 ? 0 : total };
}

/**
 * [辅助函式] 建立订单确认信的 HTML 内容
 */
function createOrderEmailHtml(order, orderItems, address, shippingMethod, paymentMethod) {
    const formatCurrency = (num) => new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(num);
    const itemsHtml = orderItems.map(item => `
        <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 10px;">${item.product_variants.name} &times; ${item.quantity}</td>
            <td style="padding: 10px; text-align: right;">${formatCurrency(item.price_at_order * item.quantity)}</td>
        </tr>`).join('');
    // 为了简洁，邮件的完整 HTML 结构在此省略，实际程式码中应包含完整的 HTML
    return `<div>...邮件内容...</div>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') { return new Response('ok', { headers: corsHeaders }); }
  
  try {
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const resend = new Resend(Deno.env.get('RESEND_API_KEY')!);

    const { cartId, selectedAddressId, selectedShippingMethodId, selectedPaymentMethodId, frontendValidationSummary } = await req.json();
    if (!cartId || !selectedAddressId || !selectedShippingMethodId || !selectedPaymentMethodId || !frontendValidationSummary) throw new Error('缺少必要的下单资讯。');
    
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('缺少授权标头。');
    const { data: { user } } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''));
    if (!user) throw new Error('使用者未登入或授权无效。');

    // ✅ 【关键修正】在所有操作前，先一次性地、并行地获取所有需要的外部资料
    const [addressRes, shippingMethodRes, paymentMethodRes, cartItemsRes] = await Promise.all([
        supabaseAdmin.from('addresses').select('*').eq('id', selectedAddressId).eq('user_id', user.id).single(),
        supabaseAdmin.from('shipping_rates').select('*').eq('id', selectedShippingMethodId).single(),
        supabaseAdmin.from('payment_methods').select('*').eq('id', selectedPaymentMethodId).single(),
        supabaseAdmin.from('cart_items').select('*, product_variants!inner(id, name, price, sale_price)').eq('cart_id', cartId)
    ]);

    // 严谨地检查每一项查询是否成功
    if (addressRes.error || !addressRes.data) throw new Error(`找不到地址: ${addressRes.error?.message}`);
    if (shippingMethodRes.error || !shippingMethodRes.data) throw new Error(`找不到运送方式: ${shippingMethodRes.error?.message}`);
    if (paymentMethodRes.error || !paymentMethodRes.data) throw new Error(`找不到付款方式: ${paymentMethodRes.error?.message}`);
    if (cartItemsRes.error || !cartItemsRes.data || cartItemsRes.data.length === 0) throw new Error(`购物车为空或读取失败: ${cartItemsRes.error?.message}`);
    
    const address = addressRes.data;
    const shippingMethod = shippingMethodRes.data;
    const paymentMethod = paymentMethodRes.data;
    const cartItems = cartItemsRes.data;

    // --- 核心事务逻辑开始 ---
    const backendSummary = await calculateCartSummary(cartItems, frontendValidationSummary.couponCode, shippingMethod, supabaseAdmin);
    if (backendSummary.total !== frontendValidationSummary.total) {
      return new Response(JSON.stringify({ error: { code: 'PRICE_MISMATCH', message: '订单金额与当前优惠不符，请重新确认。' } }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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