// 檔案路徑: supabase/functions/create-order-from-cart/index.ts (Final Formatting Version)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'https://esm.sh/resend@3.2.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// 建立一個可在多處共用的價格格式化工具
const formatCurrency = (num) => {
    const numberValue = Number(num);
    if (isNaN(numberValue)) return '$ 金額錯誤';
    return new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(numberValue);
};

async function calculateCartSummary(supabase, cartId, couponCode, shippingMethodId) {
    // ... (此辅助函式的内部逻辑维持不变)
}

function createOrderEmailHtml(order, orderItems, address, shippingMethod, paymentMethod) {
    // ... (此辅助函式的内部逻辑维持不变, 它使用自己的 formatCurrency)
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
    
    // --- 核心事務邏輯 ---
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
    
    // ✅ 【關鍵修正】在回傳給前端之前，預先格式化所有金額
    const formattedOrder = {
        ...newOrder,
        display_subtotal_amount: formatCurrency(newOrder.subtotal_amount),
        display_coupon_discount: `- ${formatCurrency(newOrder.coupon_discount)}`,
        display_shipping_fee: formatCurrency(newOrder.shipping_fee),
        display_total_amount: formatCurrency(newOrder.total_amount),
    };
    const formattedItems = cartItems.map(item => {
        const priceAtOrder = parseFloat(item.price_at_order);
        return {
            ...item,
            display_price_at_order: formatCurrency(priceAtOrder),
            display_item_total: formatCurrency(priceAtOrder * item.quantity),
        }
    });

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
        orderDetails: { 
            order: formattedOrder,      // 回傳已格式化的訂單
            items: formattedItems,      // 回傳已格式化的項目
            address, 
            shippingMethod, 
            paymentMethod 
        }
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    
  } catch (error) {
    console.error('[create-order-from-cart] 函式最外層錯誤:', error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
})