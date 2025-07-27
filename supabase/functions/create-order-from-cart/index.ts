// 檔案路徑: supabase/functions/create-order-from-cart/index.ts (Final Typo Fix Version)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * 辅助函式，用於在伺服器端獨立地、權威地重新計算購物車的總費用。
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

Deno.serve(async (req) => {
  // 處理瀏覽器的 CORS 預檢請求
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 建立一個具有服務角色的 Supabase client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    
    // 從請求 body 中解析出前端傳來的結帳資訊
    const { cartId, selectedAddressId, selectedShippingMethodId, selectedPaymentMethodId, frontendValidationSummary } = await req.json();
    if (!cartId || !selectedAddressId || !selectedShippingMethodId || !selectedPaymentMethodId || !frontendValidationSummary) {
        throw new Error('缺少必要的下單資訊。');
    }
    
    // 獲取並驗證使用者身份
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('缺少授權標頭。');
    
    const { data: { user } } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''))
    if (!user) throw new Error('使用者未登入或授權無效。')

    // === 核心事務邏輯開始 ===

    // 1. 【安全校驗】在後端權威地重算一次費用
    const backendSummary = await calculateCartSummary(supabaseAdmin, cartId, frontendValidationSummary.couponCode, selectedShippingMethodId);

    // 2. 【安全校驗】嚴格比對前後端計算結果
    if (backendSummary.total !== frontendValidationSummary.total) {
      return new Response(JSON.stringify({
        error: { code: 'PRICE_MISMATCH', message: '訂單金額與當前優惠不符，請返回購物車重新確認。' }
      }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 3. 【資料快照】獲取完整的地址資訊，準備製作快照
    const { data: address, error: addressError } = await supabaseAdmin.from('addresses').select('*').eq('id', selectedAddressId).eq('user_id', user.id).single();
    if (addressError) throw new Error('找不到指定的收貨地址。');

    // 4. 獲取購物車內容
    const { data: cartItems, error: cartItemsError } = await supabaseAdmin.from('cart_items').select('*, product_variants(id, name)').eq('cart_id', cartId);
    if (cartItemsError || !cartItems || cartItems.length === 0) throw new Error('購物車為空或讀取失敗。');
    
    // 5. 【建立訂單】
    // ✅ 【關鍵修正】使用正確的 selectedPaymentMethodId 來查詢付款方式名稱
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
    
    // 6. 【複製商品】將購物車項目複製到 `order_items` 表
    const orderItemsToInsert = cartItems.map(item => ({
        order_id: newOrder.id,
        product_variant_id: item.product_variant_id,
        quantity: item.quantity,
        price_at_order: item.price_snapshot,
    }));
    const { error: orderItemsError } = await supabaseAdmin.from('order_items').insert(orderItemsToInsert);
    if (orderItemsError) throw orderItemsError;
    
    // 7. 【清理購物車】將 `carts` 表的狀態更新為 'completed'
    await supabaseAdmin.from('carts').update({ status: 'completed' }).eq('id', cartId);

    // 8. 【成功回應】回傳新建立的訂單編號
    return new Response(JSON.stringify({ orderNumber: newOrder.order_number }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    // 捕捉所有預期外的錯誤，並回傳 500 伺服器內部錯誤
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
})