// 檔案路徑: supabase/functions/create-order-from-cart/index.ts (Final Functional Version)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * [辅助函式]
 * 这是一个独立的计算函式，用于在后端权威地、独立地重新计算一次所有费用。
 * @param supabase - Supabase 的 Admin Client 实例
 * @param cartId - 要计算的购物车 ID
 * @param couponCode - 前端传入的折扣码
 * @param shippingMethodId - 前端传入的运送方式 ID
 * @returns {Promise<object>} - 一个包含所有费用明细的摘要物件
 */
async function calculateCartSummary(supabase, cartId, couponCode, shippingMethodId) {
    const { data: cartItems, error: cartItemsError } = await supabase.from('cart_items').select(`*, product_variants!inner(price, sale_price)`).eq('cart_id', cartId);
    if (cartItemsError) throw cartItemsError;

    const subtotal = cartItems.reduce((sum, item) => {
        const price = item.product_variants.sale_price ?? item.product_variants.price;
        return sum + Math.round(price * item.quantity);
    }, 0);
    
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
  // 處理 CORS 预检请求
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    
    const { cartId, selectedAddressId, selectedShippingMethodId, selectedPaymentMethodId, frontendValidationSummary } = await req.json();
    if (!cartId || !selectedAddressId || !selectedShippingMethodId || !frontendValidationSummary || !selectedPaymentMethodId) {
        throw new Error('缺少必要的下单资讯。');
    }
    
    const { data: { user } } = await supabaseAdmin.auth.getUser(req.headers.get('Authorization')!.replace('Bearer ', ''))
    if (!user) throw new Error('使用者未登入或授权无效。')

    // === 核心事务逻辑开始 ===
    // 1. 【安全校验】在后端权威地重算一次费用
    const backendSummary = await calculateCartSummary(supabaseAdmin, cartId, frontendValidationSummary.couponCode, selectedShippingMethodId);

    // 2. 【安全校验】严格比对前后端计算的总金额
    if (backendSummary.total !== frontendValidationSummary.total) {
      console.error('价格校验失败:', { frontend: frontendValidationSummary.total, backend: backendSummary.total });
      return new Response(JSON.stringify({
        error: { code: 'PRICE_MISMATCH', message: '订单金额与当前优惠不符，请返回购物车重新整理后，再进行结帐。' }
      }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 3. 【资料快照】获取完整的地址资讯，准备制作快照
    const { data: address, error: addressError } = await supabaseAdmin.from('addresses').select('*').eq('id', selectedAddressId).eq('user_id', user.id).single();
    if (addressError) throw new Error('找不到指定的收货地址。');

    // 4. 获取购物车内容
    const { data: cartItems, error: cartItemsError } = await supabaseAdmin.from('cart_items').select('*, product_variants(id, name)').eq('cart_id', cartId);
    if (cartItemsError || !cartItems || cartItems.length === 0) throw new Error('购物车为空或读取失败。');
    
    // 5. 【建立订单】在 `orders` 表中插入主订单记录
    const { data: paymentMethod } = await supabaseAdmin.from('payment_methods').select('method_name').eq('id', selectedPaymentMethodId).single();

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
    }).select().single();
    if (orderError) throw orderError;
    
    // 6. 【复制商品】将购物车项目复制到 `order_items` 表
    const orderItemsToInsert = cartItems.map(item => ({
        order_id: newOrder.id,
        product_variant_id: item.product_variant_id,
        quantity: item.quantity,
        price_at_order: item.price_snapshot,
    }));
    const { error: orderItemsError } = await supabaseAdmin.from('order_items').insert(orderItemsToInsert);
    if (orderItemsError) throw orderItemsError;
    
    // 7. 【清理购物车】将 `carts` 表的状态更新为 'completed'
    await supabaseAdmin.from('carts').update({ status: 'completed' }).eq('id', cartId);

    // 8. 【成功回应】回传新建立的订单号码
    return new Response(JSON.stringify({ orderNumber: newOrder.order_number }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
})