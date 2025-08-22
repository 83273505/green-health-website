// ==============================================================================
// 檔案路徑: supabase/functions/mark-order-as-shipped-and-notify/index.ts
// 版本: v45.2 - 「資料來源」終局統一
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// =================================--------------------------------=============

/**
 * @file Mark as Shipped & Notify Function (標記出貨並通知函式)
 * @description 將標記出貨、發送通知、觸發發票開立的所有相關邏輯封裝在一起。
 * @version v45.2
 * 
 * @update v45.2 - [DATA SOURCE UNIFICATION]
 * 1. [核心重構] 彻底重构了 _handleInvoiceIssuance 函式。现在，当需要补建发票时，
 *          它不再自己拼凑 invoiceOptions，而是直接呼叫 InvoiceService 中为
 *          此情境量身打造的 `createAndIssueInvoiceFromOrder` 快捷方法。
 * 2. [原理] 此修正确保了“出货后自动开票”这一流程，使用的是最权威、最完整的
 *          订单资料 (`orderDetails`) 作为唯一资料来源，彻底解决了因资料来源
 *          不一致或二次查询失败导致的静默错误。
 * 3. [保留] 完整保留了 v45.1 的所有健壮性修正。
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
   * [v45.2 核心重構] 確保發票能被成功建立並觸發開立
   */
  private async _handleInvoiceIssuance(orderId: string, orderDetails: any) {
    console.log(`[INFO] 訂單 ${orderId} 已出貨，開始觸發發票開立流程...`);
    try {
      const invoiceService = new InvoiceService(this.supabaseAdmin);

      const { data: existingInvoice, error: findError } = await this.supabaseAdmin
        .from('invoices')
        .select('id, status')
        .eq('order_id', orderId)
        .maybeSingle();

      if (findError) {
        console.error(`[CRITICAL] 查詢發票記錄時發生資料庫錯誤:`, findError);
        return;
      }

      if (!existingInvoice) {
        // [v45.2 核心修正] 如果找不到發票記錄，直接呼叫快捷方法处理
        console.warn(`[WARNING] 訂單 ${orderId} 尚未建立發票記錄，將立即呼叫快捷流程補建並開立。`);
        await invoiceService.createAndIssueInvoiceFromOrder(orderDetails);
      } else if (existingInvoice.status === 'pending') {
        // 如果记录已存在且状态为 pending，则正常触发开立
        console.log(`[INFO] 找到待開立的發票記錄 ${existingInvoice.id}，觸發開立流程。`);
        await invoiceService.issueInvoiceViaAPI(existingInvoice.id);
      } else {
        // 如果记录已存在且状态不是 pending，则记录警告并跳过
        console.warn(`[WARNING] 訂單 ${orderId} 的發票狀態為 ${existingInvoice.status}，無需處理。`);
      }
      
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

    await this.supabaseAdmin.from('orders').update({
        status: 'shipped',
        shipping_tracking_code: shippingTrackingCode,
        carrier: selectedCarrierMethodName,
        shipped_at: new Date().toISOString(),
      }).eq('id', orderId).throwOnError();
      
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

    if (detailsError) {
      console.error(`[CRITICAL] 訂單 ${orderId} 已出貨，但獲取郵件與發票的詳細資料失敗:`, detailsError);
      // 即使获取失败，也要立即返回成功，因为核心的出货状态已经更新
    } else if (orderDetails) {
      // 将邮件发送和发票处理作为非阻塞的背景任务执行
      // (Deno.serve 会等待这些 Promise 完成，但不会阻塞对前端的回应)
      
      // 邮件通知
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
            console.error(`[WARNING] 訂單 ${orderDetails.order_number} 的出貨通知郵件發送失敗:`, emailError);
        });
      } else {
        console.warn(`[WARNING] 訂單 ${orderId} 找不到顧客 Email，無法發送通知。`);
      }

      // 自动开票
      this._handleInvoiceIssuance(orderId, orderDetails);
    }
    
    return new Response(JSON.stringify({ 
      success: true, 
      message: '訂單已成功標記為已出貨，並已觸發後續通知與發票流程。' 
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