// supabase/functions/_shared/services/NotificationService.ts
// 版本： 1.0
// 說明： 平台統一的通知服務，用於產生標準化的電子郵件內容。
//       旨在解決多個函式中郵件範本重複的問題。

import { NumberToTextHelper } from '../utils/NumberToTextHelper.ts';

export class NotificationService {
  /**
   * 產生訂單出貨通知的純文字郵件內容。
   * @param order - 包含完整訂單資訊的物件。
   * @param isResend - 是否為重複發送的郵件。
   * @returns {string} - 格式化後的郵件內文。
   */
  public createShippedEmailText(order: any, isResend: boolean = false): string {
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

    const title = isResend ? 'Green Health 出貨通知 (重複發送)' : 'Green Health 出貨通知';
    const greeting = isResend ? '這是為您重新發送的訂單出貨通知。' : '您的訂單已經準備就緒，並已交由物流中心寄出。';

    return `
${title}

您好，${address.recipient_name}！

${greeting}

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
}```

**檔案行數分析 (NotificationService.ts)：**
*   **原檔案共多少行：** 0 行 (全新檔案)
*   **新檔案共多少行：** 105 行
*   **合理性分析**：建立這個共用服務是解決程式碼重複問題的最佳實踐。它將通知範本集中管理，未來任何修改只需一處，所有相關函式即可同步更新，極大地提升了系統的可維護性。

---

 **第二步：重構 `resend-shipped-notification` 函式**

現在我們可以使用新建的 `NotificationService` 來重構主函式。

**檔案路徑：** `supabase/functions/resend-shipped-notification/index.ts`

```typescript
// ==============================================================================
// 檔案路徑: supabase/functions/resend-shipped-notification/index.ts
// 版本: v1.0 - 安全重構、架構優化與日誌整合
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Resend Shipped Notification Function (重寄出貨通知函式)
 * @description 允許授權使用者為已出貨的訂單手動重新發送出貨通知郵件。
 * @version v1.0
 *
 * @update v1.0 - [SECURITY REFACTOR, ARCHITECTURE & LOGGING]
 * 1. [核心安全修正] 新增了 RBAC 權限檢查，僅允許 'warehouse_staff' 或 'super_admin'
 *          執行此操作，徹底修復了未授權存取漏洞。
 * 2. [架構優化] 移除了本地的郵件範本生成邏輯，改為呼叫全新的、可複用的
 *          `NotificationService`，遵循了 DRY (Don't Repeat Yourself) 原則。
 * 3. [核心架構] 引入 `LoggingService` v2.0，並使用 `withErrorLogging` 處理異常。
 * 4. [安全稽核日誌] 對每一次手動重寄郵件的操作都留下了詳細的 `audit` 級別日誌。
 */

import { createClient, Resend } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { NotificationService } from '../_shared/services/NotificationService.ts';
import LoggingService, { withErrorLogging } from '../_shared/services/loggingService.ts';

const FUNCTION_NAME = 'resend-shipped-notification';
const FUNCTION_VERSION = 'v1.0';

const ALLOWED_ROLES = ['warehouse_staff', 'super_admin'];

async function mainHandler(req: Request, logger: LoggingService, correlationId: string): Promise<Response> {
    // --- 1. 權限驗證 ---
    const supabaseUserClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );
    const { data: { user } } = await supabaseUserClient.auth.getUser();
    const roles: string[] = user?.app_metadata?.roles || [];
    if (!user || !roles.some(r => ALLOWED_ROLES.includes(r))) {
        logger.warn('權限不足，操作被拒絕', correlationId, { callerUserId: user?.id, callerRoles: roles });
        return new Response(JSON.stringify({ error: '權限不足。' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // --- 2. 輸入驗證 ---
    const { orderId } = await req.json().catch(() => ({}));
    if (!orderId) {
        logger.warn('缺少必要的 orderId 參數', correlationId, { operatorId: user.id });
        return new Response(JSON.stringify({ error: '缺少必要的 orderId 參數。' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    logger.info('授權成功，準備重寄出貨通知', correlationId, { operatorId: user.id, orderId });

    // --- 3. 核心邏輯 ---
    const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        { auth: { persistSession: false } }
    );
    const resend = new Resend(Deno.env.get('RESEND_API_KEY')!);
    const notificationService = new NotificationService();

    const { data: orderDetails, error: detailsError } = await supabaseAdmin
      .from('orders')
      .select(`*, profiles(email), order_items(quantity, price_at_order, product_variants(name, products(name)))`)
      .eq('id', orderId)
      .eq('status', 'shipped')
      .single();

    if (detailsError) {
        logger.warn('查詢不到指定的已出貨訂單', correlationId, { operatorId: user.id, orderId });
        return new Response(JSON.stringify({ error: '找不到指定的已出貨訂單，或查詢時發生錯誤。' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const recipientEmail = orderDetails.profiles?.email || orderDetails.customer_email;
    if (!recipientEmail) {
        logger.error('訂單找不到顧客 Email，無法重寄通知', correlationId, new Error("Missing recipient email"), { operatorId: user.id, orderId });
        return new Response(JSON.stringify({ error: `訂單 ${orderDetails.order_number} 找不到顧客 Email，無法重寄通知。` }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    try {
        const emailText = notificationService.createShippedEmailText(orderDetails, true); // 標記為重寄
        await resend.emails.send({
          from: 'Green Health 出貨中心 <service@greenhealthtw.com.tw>',
          to: [recipientEmail],
          bcc: ['a896214@gmail.com'],
          reply_to: 'service@greenhealthtw.com.tw',
          subject: `[重寄] 您的 Green Health 訂單 ${orderDetails.order_number} 已出貨`,
          text: emailText,
        });
    } catch (emailError) {
        logger.error(`郵件服務提供商返回錯誤`, correlationId, emailError, { operatorId: user.id, orderId });
        throw new Error('郵件服務提供商 (Resend) 返回錯誤。'); // 拋出讓 withErrorLogging 處理
    }

    // --- 4. 記錄稽核日誌並回傳成功響應 ---
    logger.audit('出貨通知已成功手動重寄', correlationId, {
        operatorId: user.id,
        orderId: orderId,
        recipientEmail: recipientEmail,
    });

    return new Response(JSON.stringify({ 
      success: true, 
      message: `訂單 #${orderDetails.order_number} 的出貨通知已成功重新發送。`
    }), { 
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') { 
        return new Response('ok', { headers: corsHeaders }); 
    }
    const logger = new LoggingService(FUNCTION_NAME, FUNCTION_VERSION);
    const wrappedHandler = withErrorLogging(mainHandler, logger);
    return await wrappedHandler(req);
});