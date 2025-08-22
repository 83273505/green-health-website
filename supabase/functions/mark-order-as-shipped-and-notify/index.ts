// ==============================================================================
// 檔案路徑: supabase/functions/mark-order-as-shipped-and-notify/index.ts
// 版本: v46.0 - 「職責回歸」最終版
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Mark as Shipped & Notify Function (標記出貨並通知函式)
 * @description 處理訂單出貨的核心後端邏輯。職責單一：更新訂單狀態並發送出貨通知。
 * @version v46.0
 * 
 * @update v46.0 - [RESPONSIBILITY RESTORATION]
 * 1. [核心修正] 徹底移除了 _handleInvoiceIssuance 函式以及所有與自動開立發票
 *          相關的呼叫。
 * 2. [職責回歸] 此函式的職責已回歸純粹：僅負責將訂單狀態更新為 'shipped'，
 *          並向顧客發送出貨通知 Email。它不再負責任何發票相關的業務。
 * 3. [原理] 此修正遵循了您最初的、正確的業務流程設計，將「出貨」與「開票」
 *          這兩個獨立的業務流程進行了徹底的解耦，避免了因發票 API 問題
 *          而污染核心出貨流程的風險。
 * 4. [健壯性保留] 完整保留了先前版本中對關聯查詢的強化和對顧客 Email 的
 *          備援讀取邏輯，確保出貨通知能夠可靠地發送。
 */

import { createClient, Resend } from '../_shared/deps.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { NumberToTextHelper } from '../_shared/utils/NumberToTextHelper.ts'
// [v46.0] InvoiceService 已不再需要，故移除 import
// import { InvoiceService } from '../_shared/services/InvoiceService.ts'

class MarkAsShippedHandler {
  private supabaseAdmin: ReturnType<typeof createClient>;
  private resend: Resend;

  constructor() {
    this.supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    );
    this.resend = new Resend(Deno.env.get('RESEND_API_KEY')!);
  }

  // --- 私有輔助方法 ---

  private _createShippedEmailText(order: any): string {
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
      const itemTotal = priceAtOrder * quantity;
      return `• ${productName} (${variantName})\n  數量: ${quantity} × 單價: ${NumberToTextHelper.formatMoney(priceAtOrder)} = 小計: ${NumberToTextHelper.formatMoney(itemTotal)}`;
    }).join('\n\n');
    const antiFraudWarning = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ 防詐騙提醒
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Green Health 綠健 絕對不會以任何名義，透過電話、簡訊或 Email 要求您操作 ATM、提供信用卡資訊或點擊不明連結。我們不會要求您解除分期付款或更改訂單設定。

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
商品小計：${NumberToTextHelper.formatMoney(order.subtotal_amount)}${order.coupon_discount > 0 ? `
優惠折扣：-${NumberToTextHelper.formatMoney(order.coupon_discount)}` : ''}
運送費用：${NumberToTextHelper.formatMoney(order.shipping_fee)}
─────────────────────────────────
總計金額：${NumberToTextHelper.formatMoney(order.total_amount)}

${antiFraudWarning} 

感謝您的耐心等候！
您可以透過物流追蹤號碼查詢包裹的最新狀態。

此為系統自動發送郵件，請勿直接回覆。
如有任何問題，請至官網客服中心與我們聯繫。

Green Health 團隊 敬上
    `.trim();
  }

  /**
   * [v46.0 核心修正] _handleInvoiceIssuance 函式已被完全移除
   * 職責回歸單一化，此函式不再處理任何與發票相關的邏輯。
   */

  /**
   * [主方法] 處理整個出貨請求
   */
  async handleRequest(req: Request) {
    const { orderId, shippingTrackingCode, selectedCarrierMethodName } = await req.json();
    if (!orderId || !shippingTrackingCode || !selectedCarrierMethodName) {
      throw new Error('缺少必要的出貨參數。');
    }

    const { data: orderToCheck, error: checkError } = await this.supabaseAdmin.from('orders').select('status, payment_status').eq('id', orderId).single();
    if (checkError) throw new Error(`找不到訂單: ${checkError.message}`);
    if (orderToCheck.payment_status !== 'paid') throw new Error('此訂單尚未完成付款，無法出貨。');
    if (orderToCheck.status === 'shipped') throw new Error('此訂單已經出貨，請勿重複操作。');

    // --- 核心出貨流程 ---
    await this.supabaseAdmin.from('orders').update({
        status: 'shipped',
        shipping_tracking_code: shippingTrackingCode,
        carrier: selectedCarrierMethodName,
        shipped_at: new Date().toISOString(),
      }).eq('id', orderId).throwOnError();
      
    // 為了發送郵件，我們依然需要查詢訂單的詳細資料
    const { data: orderDetails, error: detailsError } = await this.supabaseAdmin
      .from('orders')
      .select(`
        *, 
        profiles (email), 
        order_items(
            quantity, 
            price_at_order, 
            product_variants(name, products(name))
        )
      `)
      .eq('id', orderId)
      .single();

    // 發送出貨通知郵件 (非阻塞)
    if (detailsError) {
      // 即使獲取郵件詳情失敗，出貨流程的核心（更新訂單狀態）也已完成。
      // 我們只記錄一個嚴重錯誤，但不應讓整個請求失敗。
      console.error(`[CRITICAL] 訂單 ${orderId} 已出貨，但獲取郵件詳情失敗:`, detailsError);
    } else if (orderDetails) {
      const recipientEmail = orderDetails.profiles?.email || orderDetails.customer_email;
      if (recipientEmail) {
        this.resend.emails.send({
          from: 'Green Health 出貨中心 <service@greenhealthtw.com.tw>',
          to: [recipientEmail], 
          bcc: ['a896214@gmail.com'],
          reply_to: 'service@greenhealthtw.com.tw',
          subject: `您的 Green Health 訂單 ${orderDetails.order_number} 已出貨`,
          text: this._createShippedEmailText(orderDetails),
        }).catch(emailError => {
            // 郵件發送失敗不應阻塞主流程，僅記錄警告。
            console.warn(`[WARNING] 訂單 ${orderDetails.order_number} 的出貨通知郵件發送失敗:`, emailError);
        });
      } else {
        console.warn(`[WARNING] 訂單 ${orderId} 找不到顧客 Email，無法發送通知。`);
      }
    }

    // [v46.0 核心修正] 移除對 _handleInvoiceIssuance 的呼叫
    
    // 立即回傳成功響應給前端
    return new Response(JSON.stringify({ 
      success: true, 
      message: '訂單已成功標記為已出貨，出貨通知已排入佇列。' 
    }), { 
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') { 
    return new Response('ok', { headers: corsHeaders }); 
  }
  try {
    const handler = new MarkAsShippedHandler();
    return await handler.handleRequest.bind(handler)(req);
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