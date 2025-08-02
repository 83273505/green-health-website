import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'https://esm.sh/resend@3.2.0'
import { corsHeaders } from '../_shared/cors.ts'

console.log(`函式 "mark-order-as-shipped-and-notify" 已啟動`)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 從請求中獲取參數
    const { orderId, shippingTrackingCode, selectedCarrierMethodName } = await req.json()

    // 參數驗證
    if (!orderId || !shippingTrackingCode || !selectedCarrierMethodName) {
      return new Response(JSON.stringify({ error: '缺少必要的參數: orderId, shippingTrackingCode, 或 selectedCarrierMethodName' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 建立 Admin Supabase Client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 建立 Resend Client
    const resend = new Resend(Deno.env.get('RESEND_API_KEY'))

    // 1. **核心修改：檢查支付狀態**
    const { data: orderToCheck, error: checkError } = await supabaseClient
      .from('orders')
      .select('status, payment_status, user_id, order_number')
      .eq('id', orderId)
      .single()

    if (checkError || !orderToCheck) {
      return new Response(JSON.stringify({ error: '找不到指定的訂單' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }})
    }
    
    // **最重要的控管機制**
    if (orderToCheck.payment_status !== 'paid') {
      return new Response(JSON.stringify({ error: '此訂單尚未完成付款，無法出貨。' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }})
    }
    
    if (orderToCheck.status === 'shipped') {
       return new Response(JSON.stringify({ error: '此訂單已經出貨，請勿重複操作。' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }})
    }

    // 2. 更新訂單狀態為 'shipped'
    const { data: updatedOrder, error: updateError } = await supabaseClient
      .from('orders')
      .update({
        status: 'shipped',
        shipping_tracking_code: shippingTrackingCode,
        carrier: selectedCarrierMethodName,
        shipped_at: new Date().toISOString(),
      })
      .eq('id', orderId)
      .select() // 確保回傳更新後的資料
      .single()

    if (updateError) {
      console.error('更新訂單狀態時發生錯誤:', updateError)
      throw updateError
    }

    // 3. 獲取發送郵件所需的完整資訊
    const { data: orderDetails, error: detailsError } = await supabaseClient
      .from('orders')
      .select(`
        order_number,
        shipped_at,
        carrier,
        shipping_tracking_code,
        users:profiles(email),
        order_items(
          quantity,
          product_variants(name, sku, products(name))
        )
      `)
      .eq('id', orderId)
      .single()

    if (detailsError) {
      // 即使郵件資訊獲取失敗，訂單狀態已更新，所以只記錄錯誤，不終止流程
      console.error('獲取郵件詳細資訊時發生錯誤:', detailsError)
    } else if (orderDetails) {
      // 4. 發送出貨通知郵件
      const userEmail = orderDetails.users?.email
      if (userEmail) {
        // 建立商品明細的 HTML
        const itemsHtml = orderDetails.order_items.map(item => 
          `<li>${item.product_variants.products.name} (${item.product_variants.name}) - SKU: ${item.product_variants.sku} x ${item.quantity}</li>`
        ).join('')

        await resend.emails.send({
          from: 'Green Health <noreply@yourdomain.com>', // 請替換成您在 Resend 驗證過的網域
          to: userEmail,
          subject: `您的 Green Health 訂單 #${orderDetails.order_number} 已出貨！`,
          html: `
            <h1>您的訂單已啟程！</h1>
            <p>親愛的顧客，您好：</p>
            <p>感謝您的訂購，您在 Green Health 的訂單 #${orderDetails.order_number} 已經打包完成並於 ${new Date(orderDetails.shipped_at).toLocaleString('zh-TW')} 交由物流寄出。</p>
            <h3>出貨詳情</h3>
            <ul>
              <li><strong>配送服務：</strong> ${orderDetails.carrier}</li>
              <li><strong>物流追蹤單號：</strong> ${orderDetails.shipping_tracking_code}</li>
            </ul>
            <h3>商品明細</h3>
            <ul>
              ${itemsHtml}
            </ul>
            <p>感謝您的支持！</p>
            <p>Green Health 團隊</p>
          `,
        })
      }
    }

    // 5. 回傳最終成功響應
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