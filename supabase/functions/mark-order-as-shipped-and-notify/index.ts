// ==============================================================================
// 檔案路徑: supabase/functions/mark-order-as-shipped-and-notify/index.ts
// 版本: v48.0 - 企業級日誌框架整合與結構標準化
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Mark as Shipped & Notify Function (標記出貨並通知函式)
 * @description 處理訂單出貨的核心後端邏輯。具備 RBAC 權限檢查，
 *              透過 RPC 函式確保「更新訂單」與「寫入日誌」的原子性，
 *              並非同步地發送出貨通知 Email。
 * @version v48.0
 *
 * @update v48.0 - [ENTERPRISE LOGGING & REFACTOR]
 * 1. [核心架構] 引入 `LoggingService` v2.0，完全取代原有的本地 `log()` 函式。
 * 2. [結構標準化] 將原有的 Class-based 結構重構為與平台一致的 Function-based
 *          `mainHandler` 模式，提升了可維護性。
 * 3. [日誌追蹤] `correlationId` 現在會被傳遞到非同步執行的郵件通知函式中，
 *          實現了對背景任務的端到端日誌追蹤。
 * 4. [安全稽核] 對每一次出貨操作都留下了詳細的 `audit` 級別日誌。
 *
 * @update v47.0 - [AUDIT & RBAC]
 * 1. [安全性] 新增 RBAC 權限檢查，僅允許 'warehouse_staff' 或 'super_admin' 執行。
 */

import { createClient, Resend } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { NumberToTextHelper } from '../_shared/utils/NumberToTextHelper.ts';
import LoggingService, { withErrorLogging } from '../_shared/services/loggingService.ts';

const FUNCTION_NAME = 'mark-order-as-shipped-and-notify';
const FUNCTION_VERSION = 'v48.0';

const ALLOWED_ROLES = ['warehouse_staff', 'super_admin'];

function _createShippedEmailText(order: any): string {
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

async function _sendNotificationEmail(
    { orderId, supabaseAdmin, resend, logger, correlationId }: 
    { orderId: string, supabaseAdmin: ReturnType<typeof createClient>, resend: Resend, logger: LoggingService, correlationId: string }
) {
    const { data: orderDetails, error: detailsError } = await supabaseAdmin
      .from('orders')
      .select(`*, profiles (email), order_items(quantity, price_at_order, product_variants(name, products(name)))`)
      .eq('id', orderId)
      .single();

    if (detailsError) {
      logger.error(`訂單已出貨，但為發送郵件獲取訂單詳情時失敗`, correlationId, detailsError, { orderId });
      return;
    }

    const recipientEmail = orderDetails.profiles?.email || orderDetails.customer_email;
    if (recipientEmail) {
      try {
        await resend.emails.send({
          from: 'Green Health 出貨中心 <service@greenhealthtw.com.tw>',
          to: [recipientEmail],
          bcc: ['a896214@gmail.com'],
          reply_to: 'service@greenhealthtw.com.tw',
          subject: `您的 Green Health 訂單 ${orderDetails.order_number} 已出貨`,
          text: _createShippedEmailText(orderDetails),
        });
        logger.info('出貨通知郵件已成功發送', correlationId, { orderId, recipient: recipientEmail });
      } catch (emailError: any) {
        logger.warn('出貨通知郵件發送失敗 (非阻斷性)', correlationId, { orderId, emailErrorName: emailError.name, emailErrorMessage: emailError.message });
      }
    } else {
      logger.warn('找不到顧客 Email，無法發送出貨通知', correlationId, { orderId });
    }
}

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
    const { orderId, shippingTrackingCode, selectedCarrierMethodName } = await req.json().catch(() => ({}));
    if (!orderId || !shippingTrackingCode || !selectedCarrierMethodName) {
        logger.warn('缺少必要的出貨參數', correlationId, { operatorId: user.id, payload: { orderId, shippingTrackingCode, selectedCarrierMethodName }});
        return new Response(JSON.stringify({ error: '缺少必要的出貨參數。' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
    }

    logger.info('授權成功，準備標記訂單為已出貨', correlationId, { operatorId: user.id, orderId });

    // --- 3. 執行核心邏輯 (RPC) ---
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    );
    const resend = new Resend(Deno.env.get('RESEND_API_KEY')!);

    const rpcParams = {
        p_order_id: orderId,
        p_operator_id: user.id,
        p_carrier: selectedCarrierMethodName,
        p_tracking_code: shippingTrackingCode
    };
    const { data, error: rpcError } = await supabaseAdmin.rpc('ship_order_and_log', rpcParams).single();
    
    if (rpcError) throw rpcError;

    const result = data as { success: boolean, message: string, updated_order: any };
    if (!result.success) {
        logger.warn('RPC 函式回傳業務邏輯失敗', correlationId, { operatorId: user.id, orderId, rpcResultMessage: result.message });
        const status = result.message.includes('找不到') ? 404 : result.message.includes('狀態不符') || result.message.includes('已出貨') ? 409 : 400;
        return new Response(JSON.stringify({ error: result.message }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    
    // --- 4. 記錄稽核日誌並非阻塞式發送郵件 ---
    logger.audit('訂單已成功標記為已出貨', correlationId, { operatorId: user.id, orderId, details: rpcParams });
    setTimeout(() => _sendNotificationEmail({ orderId, supabaseAdmin, resend, logger, correlationId }), 0);
    
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

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }
    const logger = new LoggingService(FUNCTION_NAME, FUNCTION_VERSION);
    const wrappedHandler = withErrorLogging(mainHandler, logger);
    return await wrappedHandler(req);
});