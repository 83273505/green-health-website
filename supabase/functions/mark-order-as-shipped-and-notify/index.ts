// ==============================================================================
// 檔案路徑: supabase/functions/mark-order-as-shipped-and-notify/index.ts
// 版本: v47.0 - 導入稽核日誌與 RBAC 權限
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Mark as Shipped & Notify Function (標記出貨並通知函式)
 * @description 處理訂單出貨的核心後端邏輯。具備 RBAC 權限檢查，
 *              透過 RPC 函式確保「更新訂單」與「寫入日誌」的原子性，
 *              並非同步地發送出貨通知 Email。
 * @version v47.0
 *
 * @update v47.0 - [AUDIT & RBAC]
 * 1. [安全性] 新增 RBAC 權限檢查，僅允許 'warehouse_staff' 或 'super_admin' 執行。
 * 2. [原子性] 將資料庫更新與日誌記錄移至 'ship_order_and_log' RPC 函式中，確保交易一致性。
 * 3. [稽核日誌] 成功出貨後，會自動在 'order_history_logs' 表中新增一筆詳細記錄。
 * 4. [架構統一] 程式碼結構與 'mark-order-as-paid' 函式保持一致，提升可維護性。
 */

import { createClient, Resend } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { NumberToTextHelper } from '../_shared/utils/NumberToTextHelper.ts';

const ALLOWED_ROLES = ['warehouse_staff', 'super_admin'];

function log(level: 'INFO' | 'WARN' | 'ERROR', message: string, context: object = {}) {
  console.log(
    JSON.stringify({
      level,
      timestamp: new Date().toISOString(),
      function: 'mark-order-as-shipped-and-notify',
      message,
      ...context,
    })
  );
}

class MarkAsShippedHandler {
  private supabaseAdmin: ReturnType<typeof createClient>;
  private resend: Resend;
  private userContext: { email: string; roles: string } = { email: 'unknown', roles: '[]' };

  constructor() {
    this.supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    );
    this.resend = new Resend(Deno.env.get('RESEND_API_KEY')!);
  }

  private _createShippedEmailText(order: any): string {
    // ... 此函式內部邏輯維持不變 ...
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
  
  private async _sendNotificationEmail(orderId: string) {
    // 為了發送郵件，需要查詢訂單的詳細資料
    const { data: orderDetails, error: detailsError } = await this.supabaseAdmin
      .from('orders')
      .select(
        `*, profiles (email), order_items(quantity, price_at_order, product_variants(name, products(name)))`
      )
      .eq('id', orderId)
      .single();

    if (detailsError) {
      log('ERROR', `訂單已出貨，但獲取郵件詳情失敗`, { ...this.userContext, orderId, dbError: detailsError.message });
      return;
    }

    const recipientEmail = orderDetails.profiles?.email || orderDetails.customer_email;
    if (recipientEmail) {
      try {
        await this.resend.emails.send({
          from: 'Green Health 出貨中心 <service@greenhealthtw.com.tw>',
          to: [recipientEmail],
          bcc: ['a896214@gmail.com'],
          reply_to: 'service@greenhealthtw.com.tw',
          subject: `您的 Green Health 訂單 ${orderDetails.order_number} 已出貨`,
          text: this._createShippedEmailText(orderDetails),
        });
        log('INFO', '出貨通知郵件已成功發送', { ...this.userContext, orderId, recipient: recipientEmail });
      } catch (emailError: any) {
        log('WARN', '出貨通知郵件發送失敗', { ...this.userContext, orderId, emailError: emailError.message });
      }
    } else {
      log('WARN', '找不到顧客 Email，無法發送出貨通知', { ...this.userContext, orderId });
    }
  }

  async handleRequest(req: Request) {
    // --- 1. 權限驗證 ---
    const supabaseUserClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );
    const { data: { user } } = await supabaseUserClient.auth.getUser();
    const roles: string[] = user?.app_metadata?.roles || [];
    if (!user || !roles.some(r => ALLOWED_ROLES.includes(r))) {
        log('WARN', '權限不足，操作被拒絕', { userId: user?.id, roles });
        throw new Error('FORBIDDEN: 權限不足。');
    }
    this.userContext = { email: user.email!, roles: JSON.stringify(roles) };
    log('INFO', '授權成功', this.userContext);

    // --- 2. 輸入驗證 ---
    const { orderId, shippingTrackingCode, selectedCarrierMethodName } = await req.json();
    if (!orderId || !shippingTrackingCode || !selectedCarrierMethodName) {
        log('WARN', '缺少必要參數', { ...this.userContext, orderId });
        throw new Error('BAD_REQUEST: 缺少必要的出貨參數。');
    }

    // --- 3. 執行核心邏輯 (RPC) ---
    const { data, error: rpcError } = await this.supabaseAdmin.rpc('ship_order_and_log', {
        p_order_id: orderId,
        p_operator_id: user.id,
        p_carrier: selectedCarrierMethodName,
        p_tracking_code: shippingTrackingCode
    }).single();
    
    if (rpcError) {
        log('ERROR', '資料庫 RPC 函式執行失敗', { ...this.userContext, dbError: rpcError.message });
        throw new Error(`DB_ERROR: ${rpcError.message}`);
    }

    const result = data as { success: boolean, message: string, updated_order: any };

    if (!result.success) {
        log('WARN', 'RPC 函式回傳業務邏輯失敗', { ...this.userContext, resultMessage: result.message });
        throw new Error(result.message);
    }
    
    log('INFO', '訂單出貨成功，已更新資料庫並寫入日誌', { ...this.userContext, orderId });

    // --- 4. 非阻塞式發送郵件 ---
    // 使用 setTimeout 確保立即回傳響應給前端，郵件在背景發送
    setTimeout(() => this._sendNotificationEmail(orderId), 0);
    
    // --- 5. 回傳成功響應 ---
    return new Response(JSON.stringify({
      success: true,
      message: '訂單已成功標記為已出貨，出貨通知已排入佇列。',
      updatedOrder: result.updated_order
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }
    try {
        const handler = new MarkAsShippedHandler();
        return await handler.handleRequest(req);
    } catch (err: any) {
        const message = err.message || 'UNEXPECTED_ERROR';
        const status = 
            message.startsWith('FORBIDDEN') ? 403 :
            message.startsWith('BAD_REQUEST') ? 400 :
            message.startsWith('DB_ERROR') ? 502 : 
            message.startsWith('ORDER_NOT_FOUND') ? 404 :
            message.startsWith('INVALID_STATUS') || message.startsWith('ALREADY_SHIPPED') ? 409 : 500;
        
        // 此處不記錄 userContext，因為 handler 實例化可能失敗
        log('ERROR', `函式最外層錯誤`, { error: message, status });

        return new Response(JSON.stringify({ error: message }), {
            status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});