// ==============================================================================
// 檔案路徑: supabase/functions/mark-order-as-shipped-and-notify/index.ts
// 版本: v45.1 - 關聯查詢與流程健壯性修正
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Mark as Shipped & Notify Function (標記出貨並通知函式)
 * @description 將標記出貨、發送通知、觸發發票開立的所有相關邏輯封裝在一起。
 * @version v45.1
 * 
 * @update v45.1 - [RELATION QUERY & PROCESS RESILIENCE FIX]
 * 1. [核心修正] 修正了獲取訂單詳情時，對 profiles 的關聯查詢語法，並增加了
 *          對 orders.customer_email 的備援讀取，確保能可靠地獲取到顧客 Email。
 * 2. [健壯性升級] 重構了 _handleInvoiceIssuance 函式。現在，如果它找不到
 *          預先建立的發票記錄，它將不再失敗，而是會主動建立一筆新的發票記錄，
 *          然後再觸發開立流程。這徹底解決了因時序問題導致的自動開票失敗。
 * 3. [本地化] 檔案內所有註解及字串均已修正為正體中文。
 */

import { createClient, Resend } from '../_shared/deps.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { NumberToTextHelper } from '../_shared/utils/NumberToTextHelper.ts'
import { InvoiceService } from '../_shared/services/InvoiceService.ts'

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
   * [v45.1 健壯性升級] 確保發票能被成功建立並觸發開立
   */
  private async _handleInvoiceIssuance(orderId: string, orderDetails: any) {
    console.log(`[INFO] 訂單 ${orderId} 已出貨，開始觸發發票開立流程...`);
    try {
      const invoiceService = new InvoiceService(this.supabaseAdmin);

      // 1. 根據 orderId 找到對應的 invoice 記錄
      const { data: existingInvoice, error: findError } = await this.supabaseAdmin
        .from('invoices')
        .select('id, status')
        .eq('order_id', orderId)
        .maybeSingle(); // 使用 maybeSingle 避免找不到時報錯

      if (findError) {
        console.error(`[CRITICAL] 查詢發票記錄時發生資料庫錯誤:`, findError);
        return; // 提前退出以避免進一步錯誤
      }

      let invoiceToIssue = existingInvoice;

      // 2. [核心修正] 如果找不到發票記錄，則主動建立一筆
      if (!invoiceToIssue) {
        console.warn(`[WARNING] 訂單 ${orderId} 尚未建立發票記錄，將立即補建。`);
        // 我們需要從 orderDetails 中獲取必要的資訊來建立發票
        const invoiceOptions = { // 這裡我們使用訂單快照中的基本資訊
            type: 'cloud', // 預設類型
            carrier_type: 'member',
            carrier_number: orderDetails.customer_email,
            recipient_name: orderDetails.customer_name,
            recipient_email: orderDetails.customer_email
        };
        const finalInvoiceData = await invoiceService.determineInvoiceData(orderDetails.user_id, invoiceOptions);
        invoiceToIssue = await invoiceService.createInvoiceRecord(orderId, orderDetails.total_amount, finalInvoiceData);
      }
      
      // 3. 檢查發票狀態，避免重複開立
      if (invoiceToIssue.status !== 'pending') {
        console.warn(`[WARNING] 訂單 ${orderId} 的發票狀態為 ${invoiceToIssue.status}，無需開立。`);
        return;
      }
      
      // 4. 呼叫 InvoiceService 來執行真正的開立流程
      await invoiceService.issueInvoiceViaAPI(invoiceToIssue.id);
      
    } catch (error) {
      console.error(`[CRITICAL] 訂單 ${orderId} 的自動發票開立流程最終失敗:`, error.message);
    }
  }

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
      
    // [v45.1 核心修正] 使用更健壯的 select 語句
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
      console.error(`[CRITICAL] 訂單 ${orderId} 已出貨，但獲取郵件詳情失敗:`, detailsError);
    } else if (orderDetails) {
      // 優先使用 profile 關聯的 email，若無則使用訂單快照中的 customer_email
      const recipientEmail = orderDetails.profiles?.email || orderDetails.customer_email;
      if (recipientEmail) {
        try {
          const emailText = this._createShippedEmailText(orderDetails);
          await this.resend.emails.send({
            from: 'Green Health 出貨中心 <service@greenhealthtw.com.tw>',
            to: [recipientEmail], 
            bcc: ['a896214@gmail.com'],
            reply_to: 'service@greenhealthtw.com.tw',
            subject: `您的 Green Health 訂單 ${orderDetails.order_number} 已出貨`,
            text: emailText,
          });
        } catch (emailError) {
          console.error(`[WARNING] 訂單 ${orderDetails.order_number} 的出貨通知郵件發送失敗:`, emailError);
        }
      } else {
        console.warn(`[WARNING] 訂單 ${orderId} 找不到顧客 Email，無法發送通知。`);
      }
    }

    // 在所有主要流程都完成後，才觸發發票開立 (非阻塞)
    if (orderDetails) {
      this._handleInvoiceIssuance(orderId, orderDetails);
    }
    
    // 立即回傳成功響應給前端
    return new Response(JSON.stringify({ 
      success: true, 
      message: '訂單已成功標記為已出貨，並已觸發發票開立流程。' 
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