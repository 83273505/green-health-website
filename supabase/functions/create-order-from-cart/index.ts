// 檔案路徑: supabase/functions/create-order-from-cart/index.ts (Final Email Fix Version)

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

/**
 * [輔助函式] 建立訂單確認信的 HTML 內容
 */
function createOrderEmailHtml(order, orderItems, address, shippingMethod, paymentMethod) {
    try {
        const formatCurrency = (num) => {
            const numberValue = Number(num);
            if (isNaN(numberValue)) return '$ 金額錯誤';
            return new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(numberValue);
        };

        // ✅ 【關鍵修正】郵件範本中的商品列表，現在只顯示品名、數量、單價
        const itemsHtml = orderItems.map(item => {
            const priceAtOrder = parseFloat(item.price_at_order);
            const variantName = item.product_variants?.name || '商品名稱未知';
            return `
                <tr style="border-bottom: 1px solid #eee;">
                    <td style="padding: 12px; vertical-align: top;">${variantName}</td>
                    <td style="padding: 12px; text-align: center; vertical-align: top;">${item.quantity}</td>
                    <td style="padding: 12px; text-align: right; vertical-align: top;">${formatCurrency(priceAtOrder)}</td>
                </tr>
            `;
        }).join('');

        // 回傳完整的 HTML 郵件範本
        return `
            <div style="font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; ...">
                <!-- ... 郵件頭部和問候語 ... -->
                <h3 style="font-size: 18px; margin-bottom: 16px;">訂單商品</h3>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
                    <thead>
                        <tr style="background-color: #f7f7f7;">
                            <th style="padding: 12px; text-align: left; ...">品名</th>
                            <th style="padding: 12px; text-align: center; ...">數量</th>
                            <th style="padding: 12px; text-align: right; ...">單價</th>
                        </tr>
                    </thead>
                    <tbody>${itemsHtml}</tbody>
                </table>
                <!-- ... 後續的費用明細、收件人資訊等 ... -->
            </div>
        `;
    } catch (e) {
        console.error("建立郵件 HTML 時發生錯誤:", e);
        return "<p>您的訂單已確認，但郵件內容在產生時發生了錯誤。</p>";
    }
}


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') { return new Response('ok', { headers: corsHeaders }); }
  try {
    // ... (所有核心的下單邏輯，從初始化到資料庫寫入，都維持不變) ...

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