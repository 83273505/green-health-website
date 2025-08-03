// 檔案路徑: supabase/functions/mark-order-as-shipped-and-notify/index.ts
// ----------------------------------------------------
// 【此為真正 100% 完整檔案，可直接覆蓋】
// ----------------------------------------------------

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'https://esm.sh/resend@3.2.0';
import { corsHeaders } from '../_shared/cors.ts'

// 將所有邏輯封裝在 handler 物件中，以匹配 create-order-from-cart 的風格
const handler = {
  /**
   * [私有方法] 格式化數字為台幣貨幣字串
   */
  _formatPrice(num: number | string | null | undefined): string {
    const numberValue = Number(num);
    if (isNaN(numberValue)) return 'N/A';
    return `NT$ ${numberValue.toLocaleString('zh-TW', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    })}`;
  },

  /**
   * [私有方法] 建立純文字格式的出貨通知郵件內容
   */
  _createShippedEmailText(order: any): string {
    const address = order.shipping_address_snapshot;
    const fullAddress = address ? `${address.postal_code || ''} ${address.city || ''}${address.district || ''}${address.street_address || ''}`.trim() : '無地址資訊';
    
    const itemsList = order.order_items.map((item: any) => {
      const priceAtOrder = parseFloat(item.price_at_order);
      const quantity = parseInt(item.quantity, 10);
      const productName = item.product_variants?.products?.name || '未知商品';
      const variantName = item.product_variants?.name || '未知規格';
      if (isNaN(priceAtOrder) || isNaN(quantity)) {
        return `• ${productName} (${variantName}) - 金額計算錯誤`;
      }
      return `• ${productName} (${variantName})\n  數量: ${quantity} × 單價: ${this._formatPrice(priceAtOrder)} = 小計: ${this._formatPrice(priceAtOrder * quantity)}`;
    }).join('\n\n');

    // 定義防詐騙宣導文字
    const antiFraudWarning = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ 防詐騙提醒
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Green Health 絕對不會以任何名義，透過電話、簡訊或 Email 要求您操作 ATM、提供信用卡資訊或點擊不明連結。我們不會要求您解除分期付款或更改訂單設定。

若您接到任何可疑來電或訊息，請不要理會，並可直接透過官網客服管道與我們聯繫確認，或撥打 165 反詐騙諮詢專線。
    `.trim();

    return `
Green Health 出貨通知

您好，${address.recipient_name}！

您的訂單已經準備就緒，並已交由物流中心寄出。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📦 出貨資訊
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
訂單編號：${order.order_number}
出貨時間：${new Date(order.shipped_at).toLocaleString('zh-TW')}
配送服務：${order.carrier}
物流追蹤號碼：${order.shipping_tracking_code}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚚 配送詳情
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
收件人：${address.recipient_name}
聯絡電話：${address.phone_number}
配送地址：${fullAddress}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🛒 訂購商品
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${itemsList}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 費用明細
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
商品小計：${this._formatPrice(order.subtotal_amount)}${order.coupon_discount > 0 ? `
優惠折扣：-${this._formatPrice(order.coupon_discount)}` : ''}
運送費用：${this._formatPrice(order.shipping_fee)}
─────────────────────────────────
總計金額：${this._formatPrice(order.total_amount)}

${antiFraudWarning} 

感謝您的耐心等候！
您可以透過物流追蹤號碼查詢包裹的最新狀態。

此為系統自動發送郵件，請勿直接回覆。
如有任何問題，請至官網客服中心與我們聯繫。

Green Health 團隊 敬上
    `.trim();
  },

  /**
   * [主方法] 處理整個出貨請求
   */
  async handleRequest(req: Request) {
    const { orderId, shippingTrackingCode, selectedCarrierMethodName } = await req.json();
    if (!orderId || !shippingTrackingCode || !selectedCarrierMethodName) {
      throw new Error('缺少必要的出貨參數。');
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    );
    
    const resend = new Resend(Deno.env.get('RESEND_API_KEY')!);

    const { data: orderToCheck, error: checkError } = await supabaseAdmin.from('orders').select('status, payment_status').eq('id', orderId).single();
    if (checkError) throw new Error(`找不到訂單: ${checkError.message}`);
    if (orderToCheck.payment_status !== 'paid') throw new Error('此訂單尚未完成付款，無法出貨。');
    if (orderToCheck.status === 'shipped') throw new Error('此訂單已經出貨，請勿重複操作。');

    await supabaseAdmin.from('orders').update({
        status: 'shipped',
        shipping_tracking_code: shippingTrackingCode,
        carrier: selectedCarrierMethodName,
        shipped_at: new Date().toISOString(),
      }).eq('id', orderId).throwOnError();
      
    const { data: orderDetails, error: detailsError } = await supabaseAdmin
      .from('orders')
      .select(`
        *,
        users:profiles(email),
        order_items(
          quantity,
          price_at_order,
          product_variants(name, products(name))
        )
      `)
      .eq('id', orderId)
      .single();

    if (detailsError) {
      console.error(`[CRITICAL] 訂單 ${orderDetails?.order_number || orderId} 已出貨，但獲取郵件詳情失敗:`, detailsError);
      return new Response(JSON.stringify({ success: true, message: '訂單已出貨，但通知郵件發送失敗(查詢詳情出錯)。' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (orderDetails && orderDetails.users?.email) {
      try {
        const emailText = this._createShippedEmailText(orderDetails);
        await resend.emails.send({
          from: 'Green Health 出貨中心 <service@greenhealthtw.com.tw>',
          to: [orderDetails.users.email], 
          bcc: ['a896214@gmail.com'],
          reply_to: 'service@greenhealthtw.com.tw',
          subject: `您的 Green Health 訂單 ${orderDetails.order_number} 已出貨`,
          text: emailText,
        });
      } catch (emailError) {
        console.error(`[CRITICAL] 訂單 ${orderDetails.order_number} 的郵件發送失敗:`, emailError);
        return new Response(JSON.stringify({ success: true, message: '訂單已出貨，但通知郵件發送失敗(Resend錯誤)。' }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else {
      console.warn(`[WARNING] 訂單 ${orderDetails.order_number} 找不到顧客 Email，無法發送通知。`);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: '訂單已成功標記為已出貨，並已發送通知。' 
    }), { 
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
};

// Deno 服務的入口點
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') { 
    return new Response('ok', { headers: corsHeaders }); 
  }
  try {
    return await handler.handleRequest(req);
  } catch (error) {
    console.error(`[mark-order-as-shipped] 函式最外層錯誤:`, error.message, error.stack);
    return new Response(JSON.stringify({ 
      error: error.message 
    }), { 
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});