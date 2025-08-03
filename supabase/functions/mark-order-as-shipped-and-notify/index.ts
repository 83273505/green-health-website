// 檔案路徑: supabase/functions/mark-order-as-shipped-and-notify/index.ts
// ----------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ----------------------------------------------------

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'https://esm.sh/resend@3.2.0'
import { corsHeaders } from '../_shared/cors.ts'

console.log(`函式 "mark-order-as-shipped-and-notify" (v2) 已啟動`)

// 價格格式化輔助函式
const formatPrice = (price: number) => {
    return new Intl.NumberFormat('zh-TW', {
        style: 'currency',
        currency: 'TWD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(price || 0);
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { orderId, shippingTrackingCode, selectedCarrierMethodName } = await req.json()
    if (!orderId || !shippingTrackingCode || !selectedCarrierMethodName) {
      return new Response(JSON.stringify({ error: '缺少必要的參數' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }})
    }

    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const resend = new Resend(Deno.env.get('RESEND_API_KEY'))

    const { data: orderToCheck, error: checkError } = await supabaseClient.from('orders').select('status, payment_status').eq('id', orderId).single()
    if (checkError || !orderToCheck) {
      return new Response(JSON.stringify({ error: '找不到指定的訂單' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }})
    }
    if (orderToCheck.payment_status !== 'paid') {
      return new Response(JSON.stringify({ error: '此訂單尚未完成付款，無法出貨。' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }})
    }
    if (orderToCheck.status === 'shipped') {
       return new Response(JSON.stringify({ error: '此訂單已經出貨，請勿重複操作。' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }})
    }

    await supabaseClient.from('orders').update({
        status: 'shipped',
        shipping_tracking_code: shippingTrackingCode,
        carrier: selectedCarrierMethodName,
        shipped_at: new Date().toISOString(),
      }).eq('id', orderId)

    // 【修改部分】擴充查詢，獲取所有通知所需的詳細資訊
    const { data: orderDetails, error: detailsError } = await supabaseClient
      .from('orders')
      .select(`
        order_number,
        shipped_at,
        carrier,
        shipping_tracking_code,
        subtotal_amount,
        shipping_fee,
        coupon_discount,
        total_amount,
        shipping_address_snapshot,
        users:profiles(email),
        order_items(
          quantity,
          price_at_order,
          product_variants(name, products(name))
        )
      `)
      .eq('id', orderId)
      .single()

    if (detailsError) {
      console.error('獲取郵件詳細資訊時發生錯誤:', detailsError)
    } else if (orderDetails) {
      const userEmail = orderDetails.users?.email
      if (userEmail) {
        // 【修改部分】重構郵件 HTML 內容
        const address = orderDetails.shipping_address_snapshot;
        const shippingAddressHtml = address ? `
          <p><strong>姓名:</strong> ${address.recipient_name}</p>
          <p><strong>電話:</strong> ${address.phone_number}</p>
          <p><strong>地址:</strong> ${address.postal_code} ${address.city}${address.district}${address.street_address}</p>
        ` : '<p>無收件資訊</p>';

        const itemsHtml = orderDetails.order_items.map(item => `
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.product_variants.products.name} (${item.product_variants.name})</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${formatPrice(item.price_at_order)}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${formatPrice(item.price_at_order * item.quantity)}</td>
          </tr>`
        ).join('');

        const emailHtml = `
          <div style="font-family: Arial, sans-serif; line-height: 1.6;">
            <h2>您的訂單 #${orderDetails.order_number} 已出貨！</h2>
            <p>親愛的顧客，您好：</p>
            <p>感謝您的訂購，您的訂單已經打包完成並於 ${new Date(orderDetails.shipped_at).toLocaleString('zh-TW')} 交由物流寄出。</p>
            
            <h3 style="border-bottom: 1px solid #ccc; padding-bottom: 5px;">出貨資訊</h3>
            <p><strong>配送服務：</strong> ${orderDetails.carrier}</p>
            <p><strong>物流追蹤單號：</strong> ${orderDetails.shipping_tracking_code}</p>

            <h3 style="border-bottom: 1px solid #ccc; padding-bottom: 5px; margin-top: 20px;">收件資訊</h3>
            ${shippingAddressHtml}

            <h3 style="border-bottom: 1px solid #ccc; padding-bottom: 5px; margin-top: 20px;">商品明細</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr>
                  <th style="text-align: left; padding: 8px; color: #666;">品名</th>
                  <th style="text-align: center; padding: 8px; color: #666;">數量</th>
                  <th style="text-align: right; padding: 8px; color: #666;">單價</th>
                  <th style="text-align: right; padding: 8px; color: #666;">小計</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>

            <h3 style="border-bottom: 1px solid #ccc; padding-bottom: 5px; margin-top: 20px;">訂單金額</h3>
            <p style="display: flex; justify-content: space-between;"><span>商品小計:</span> <span>${formatPrice(orderDetails.subtotal_amount)}</span></p>
            <p style="display: flex; justify-content: space-between;"><span>運費:</span> <span>${formatPrice(orderDetails.shipping_fee)}</span></p>
            ${orderDetails.coupon_discount > 0 ? `<p style="display: flex; justify-content: space-between;"><span>折扣金額:</span> <span>- ${formatPrice(orderDetails.coupon_discount)}</span></p>` : ''}
            <p style="display: flex; justify-content: space-between; font-weight: bold; font-size: 1.2em;"><span>總計:</span> <span>${formatPrice(orderDetails.total_amount)}</span></p>
            
            <p style="margin-top: 30px;">感謝您的支持！</p>
            <p>Green Health 團隊</p>
          </div>
        `;
        
        await resend.emails.send({
          from: 'Green Health <noreply@yourdomain.com>', // 請替換成您在 Resend 驗證過的網域
          to: userEmail,
          subject: `您的 Green Health 訂單 #${orderDetails.order_number} 已出貨！`,
          html: emailHtml,
        })
      }
    }

    return new Response(JSON.stringify({ success: true, message: '訂單已成功標記為已出貨，並已發送通知。' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('未預期的錯誤:', error.message)
    return new Response(JSON.stringify({ error: '伺服器內部錯誤' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})