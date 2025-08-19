// ==============================================================================
// 檔案路徑: supabase/functions/create-order-from-cart/index.ts
// 版本: v39.0 - 真正的智慧型統一結帳流程 (最終版)
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// 需求重點：
// 1) 有 Authorization Bearer <JWT> → 視為已登入會員，驗證後以 user.id 建立訂單。
// 2) 無 JWT → 以 shippingDetails.email 後端智慧查詢：
//    - 若 email 已存在於會員 → 仍建立訂單並將 user_id 掛回該會員 (自動歸戶)。
//    - 若 email 不存在 → 建立 user_id = null 的訪客訂單。
// 3) 若偵測到「忘記登入的會員」，會在確認信中附上「Magic Link」登入連結，協助快速登入。
// ==============================================================================

import { createClient, Resend } from '../_shared/deps.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { NumberToTextHelper } from '../_shared/utils/NumberToTextHelper.ts'
import { InvoiceService } from '../_shared/services/InvoiceService.ts'

/**
 * 重要：若要允許匿名下單 (沒有 Authorization header)，請在 supabase/functions/supabase.toml
 * 對此函式設定：verify_jwt = false
 *
 * [[functions]]
 * name = "create-order-from-cart"
 * verify_jwt = false
 */

class CreateUnifiedOrderHandler {
  private supabaseAdmin: ReturnType<typeof createClient>;
  private resend: Resend;

  constructor() {
    this.supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );
    this.resend = new Resend(Deno.env.get('RESEND_API_KEY') ?? '');
  }

  // ========== 計算購物車金額 / 後端快照 ==========
  private async _calculateCartSnapshot(cartId: string, couponCode?: string, shippingMethodId?: string) {
    const { data: cartItems, error: cartItemsError } = await this.supabaseAdmin
      .from('cart_items')
      .select(`*, product_variants(name, price, sale_price, products(image_url))`)
      .eq('cart_id', cartId);

    if (cartItemsError) throw cartItemsError;

    if (!cartItems || cartItems.length === 0) {
      return {
        items: [],
        itemCount: 0,
        summary: { subtotal: 0, couponDiscount: 0, shippingFee: 0, total: 0 },
        appliedCoupon: null
      };
    }

    const subtotal = cartItems.reduce((sum: number, item: any) => {
      const unit = Math.round(item.product_variants.sale_price ?? item.product_variants.price);
      return sum + unit * item.quantity;
    }, 0);

    // 優惠券
    let couponDiscount = 0;
    let appliedCoupon: { code: string; discountAmount: number } | null = null;
    if (couponCode) {
      const { data: coupon } = await this.supabaseAdmin
        .from('coupons')
        .select('*')
        .eq('code', couponCode)
        .eq('is_active', true)
        .single();

      if (coupon && subtotal >= (coupon.min_purchase_amount ?? 0)) {
        if (coupon.discount_type === 'PERCENTAGE' && coupon.discount_percentage) {
          couponDiscount = Math.round(subtotal * (coupon.discount_percentage / 100));
        } else if (coupon.discount_type === 'FIXED_AMOUNT' && coupon.discount_amount) {
          couponDiscount = Math.round(coupon.discount_amount);
        }
        appliedCoupon = { code: coupon.code, discountAmount: couponDiscount };
      }
    }

    // 運費
    const subtotalAfterDiscount = subtotal - couponDiscount;
    let shippingFee = 0;
    if (shippingMethodId) {
      const { data: shippingRate } = await this.supabaseAdmin
        .from('shipping_rates')
        .select('*')
        .eq('id', shippingMethodId)
        .eq('is_active', true)
        .single();

      if (shippingRate) {
        const threshold = shippingRate.free_shipping_threshold;
        const shouldCharge = !threshold || subtotalAfterDiscount < threshold;
        if (shouldCharge) shippingFee = Math.round(shippingRate.rate ?? 0);
      }
    }

    const total = Math.max(0, subtotal - couponDiscount + shippingFee);

    return {
      items: cartItems,
      itemCount: cartItems.reduce((sum: number, it: any) => sum + it.quantity, 0),
      summary: { subtotal, couponDiscount, shippingFee, total },
      appliedCoupon
    };
  }

  // ========== Email 文本 ==========
  private _createOrderEmailText(
    order: any,
    orderItems: any[],
    address: any,
    shippingMethod: any,
    paymentMethod: any,
    magicLink?: string | null
  ): string {
    const fullAddress = `${address.postal_code || ''} ${address.city || ''}${address.district || ''}${address.street_address || ''}`.trim();
    const itemsList = (orderItems || []).map((item: any) => {
      const priceAtOrder = Number(item.price_at_order);
      const quantity = Number(item.quantity);
      const variantName = item.product_variants?.name || '未知品項';
      if (Number.isNaN(priceAtOrder) || Number.isNaN(quantity)) {
        return `• ${variantName} (數量: ${item.quantity}) - 金額計算錯誤`;
      }
      const itemTotal = priceAtOrder * quantity;
      return `• ${variantName}\n  數量: ${quantity} × 單價: ${NumberToTextHelper.formatMoney(priceAtOrder)} = 小計: ${NumberToTextHelper.formatMoney(itemTotal)}`;
    }).join('\n\n');

    const antiFraud = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ 防詐騙提醒
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Green Health 綠健 絕對不會以任何名義，透過電話、簡訊或 Email 要求您操作 ATM、提供信用卡資訊或點擊不明連結。我們不會要求您解除分期付款或更改訂單設定。

若您接到任何可疑來電或訊息，請不要理會，並可直接透過官網客服與我們聯繫，或撥打 165 反詐騙諮詢專線。
`.trim();

    const maybeMagic = magicLink
      ? `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔑 快速登入
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
我們偵測到此 Email 為已註冊之會員。若您剛剛未登入即可完成下單，您可以點擊以下安全連結快速登入，查看完整訂單歷史：
${magicLink}
`
      : '';

    return `
Green Health 綠健 訂單確認

您好，${address.recipient_name}！

您的訂單已成功建立，以下是訂單詳細資訊：

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 訂單資訊
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
訂單編號：${order.order_number}
下單時間：${new Date(order.created_at).toLocaleString('zh-TW')}
訂單狀態：${order.status}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🛒 訂購商品
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${itemsList}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 費用明細
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
商品小計：${NumberToTextHelper.formatMoney(order.subtotal_amount)}${
order.coupon_discount > 0 ? `\n優惠折扣：-${NumberToTextHelper.formatMoney(order.coupon_discount)}` : ''
}
運送費用：${NumberToTextHelper.formatMoney(order.shipping_fee)}
─────────────────────────────────
總計金額：${NumberToTextHelper.formatMoney(order.total_amount)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚚 配送資訊
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
收件人：${address.recipient_name}
聯絡電話：${address.phone_number}
配送地址：${fullAddress}
配送方式：${shippingMethod.method_name}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💳 付款資訊
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
付款方式：${paymentMethod.method_name}
付款狀態：${order.payment_status}
${paymentMethod.instructions ? `付款指示：\n${paymentMethod.instructions}` : ''}

${maybeMagic}
${antiFraud}

感謝您選擇 Green Health
`.trim();
  }

  // ========== 發票處理 ==========
  private async _handleInvoiceCreation(orderId: string, userId: string | null, totalAmount: number, invoiceOptions: any) {
    try {
      const invoiceService = new InvoiceService(this.supabaseAdmin);
      const finalInvoiceData = await invoiceService.determineInvoiceData(userId, invoiceOptions);
      await invoiceService.createInvoiceRecord(orderId, totalAmount, finalInvoiceData);
      console.log(`[INFO] 訂單 ${orderId} 的發票記錄已成功排入佇列。`);
    } catch (err: any) {
      console.error(`[CRITICAL] 訂單 ${orderId} 已建立，但發票記錄建立失敗:`, err?.message ?? err);
    }
  }

  // ========== 後端智慧辨識：用 Email 找會員 ==========
  private async _findUserIdByEmail(email: string): Promise<string | null> {
    try {
      const { data, error } = await this.supabaseAdmin.auth.admin.getUserByEmail(email);
      if (error) {
        // 若 email 不存在，GoTrue 會回 404；這裡一律視為找不到即可
        if (error.status === 404) return null;
        console.error('[admin.getUserByEmail] error:', error);
        return null;
      }
      return data?.user?.id ?? null;
    } catch (e) {
      console.error('[findUserIdByEmail] unexpected error:', e);
      return null;
    }
  }

  // 產生 Magic Link（不寄送，回傳 action_link 以便自行夾帶在確認信）
  private async _maybeGenerateMagicLink(email: string): Promise<string | null> {
    try {
      const redirectTo =
        Deno.env.get('SITE_URL')?.replace(/\/+$/, '') + '/account/orders';
      const { data, error } = await this.supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email,
        options: { redirectTo }
      });
      if (error) {
        console.warn('[admin.generateLink] failed:', error);
        return null;
      }
      return data?.properties?.action_link ?? null;
    } catch (e) {
      console.warn('[maybeGenerateMagicLink] unexpected:', e);
      return null;
    }
  }

  // ========== 基本請求驗證 (不含註冊欄位) ==========
  private _validateRequest(data: any): { valid: boolean; message?: string } {
    const required = [
      'cartId',
      'shippingDetails',
      'selectedShippingMethodId',
      'selectedPaymentMethodId',
      'frontendValidationSummary',
    ];
    for (const key of required) {
      if (!data?.[key]) return { valid: false, message: `缺少必要參數: ${key}` };
    }
    if (!data.shippingDetails.email) {
      return { valid: false, message: 'shippingDetails 中缺少 email' };
    }
    return { valid: true };
  }

  // ========== 主流程 ==========
  async handleRequest(req: Request): Promise<Response> {
    // CORS preflight 在外層 Deno.serve 已處理，這裡專注主流程
    const requestData = await req.json().catch(() => ({}));
    const ok = this._validateRequest(requestData);
    if (!ok.valid) {
      return new Response(
        JSON.stringify({ error: { message: ok.message ?? '無效請求' } }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const {
      cartId,
      shippingDetails,
      selectedShippingMethodId,
      selectedPaymentMethodId,
      frontendValidationSummary,
      invoiceOptions
    } = requestData;

    // ========== 會員/訪客 智慧分支 ==========
    let userId: string | null = null;
    let treatAsLoggedMember = false; // 僅供紀錄

    const authHeader = req.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      // 有帶 JWT → 先嘗試驗證
      const token = authHeader.replace('Bearer ', '');
      const { data: userRes, error: userErr } = await this.supabaseAdmin.auth.getUser(token);
      if (userErr) {
        // 帶了壞的 JWT → 401
        return new Response(
          JSON.stringify({ error: { message: '無效的授權憑證。' } }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (userRes?.user) {
        userId = userRes.user.id;
        treatAsLoggedMember = true;
        // 同步最新收件人姓名到 profile（容錯不影響主流程）
        await this.supabaseAdmin.from('profiles')
          .update({ name: shippingDetails.recipient_name ?? null })
          .eq('id', userId);
      }
    }

    // 無 JWT 或上面沒取到 user → 用 email 後端智慧查
    let magicLinkForMail: string | null = null;
    if (!userId && shippingDetails?.email) {
      const maybeExistingUserId = await this._findUserIdByEmail(shippingDetails.email);
      if (maybeExistingUserId) {
        userId = maybeExistingUserId; // 自動歸戶
        // 產生 Magic Link，放到確認信中（讓「忘記登入」的會員能一鍵登入）
        magicLinkForMail = await this._maybeGenerateMagicLink(shippingDetails.email);
      }
    }

    // ========== 後端金額快照與防範價格竄改 ==========
    const backendSnapshot = await this._calculateCartSnapshot(
      cartId,
      frontendValidationSummary.couponCode,
      selectedShippingMethodId
    );

    if (backendSnapshot.summary.total !== frontendValidationSummary.total) {
      return new Response(
        JSON.stringify({
          error: { code: 'PRICE_MISMATCH', message: '訂單金額與當前優惠不符，請重新確認。' }
        }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (!backendSnapshot.items?.length) {
      return new Response(
        JSON.stringify({ error: { message: '無法建立訂單，購物車為空。' } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 取運送 / 付款方式
    const { data: shippingMethod } = await this.supabaseAdmin
      .from('shipping_rates')
      .select('*')
      .eq('id', selectedShippingMethodId)
      .single();

    const { data: paymentMethod } = await this.supabaseAdmin
      .from('payment_methods')
      .select('*')
      .eq('id', selectedPaymentMethodId)
      .single();

    if (!shippingMethod || !paymentMethod) {
      return new Response(
        JSON.stringify({ error: { message: '結帳所需資料不完整 (運送或付款方式)。' } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========== 建立訂單 ==========
    const address = shippingDetails;
    const { data: newOrder, error: orderError } = await this.supabaseAdmin
      .from('orders')
      .insert({
        user_id: userId, // 若為訪客 → null；若為會員或自動歸戶 → 對應 user_id
        status: 'pending_payment',
        total_amount: backendSnapshot.summary.total,
        subtotal_amount: backendSnapshot.summary.subtotal,
        coupon_discount: backendSnapshot.summary.couponDiscount,
        shipping_fee: backendSnapshot.summary.shippingFee,
        shipping_address_snapshot: address,
        payment_method: paymentMethod.method_name,
        shipping_method_id: selectedShippingMethodId,
        payment_status: 'pending',
        customer_email: address.email,
        customer_name: address.recipient_name,
      })
      .select()
      .single();

    if (orderError) {
      console.error('[orders.insert] error:', orderError);
      return new Response(
        JSON.stringify({ error: { message: '建立訂單失敗。' } }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 訂單品項
    const orderItemsToInsert = backendSnapshot.items.map((item: any) => ({
      order_id: newOrder.id,
      product_variant_id: item.product_variant_id,
      quantity: item.quantity,
      price_at_order: item.product_variants.sale_price ?? item.product_variants.price,
    }));
    const { error: orderItemsErr } = await this.supabaseAdmin
      .from('order_items')
      .insert(orderItemsToInsert);

    if (orderItemsErr) {
      console.error('[order_items.insert] error:', orderItemsErr);
    }

    const { data: finalOrderItems } = await this.supabaseAdmin
      .from('order_items')
      .select('*, product_variants(name)')
      .eq('order_id', newOrder.id);

    // 併發：關閉購物車、建立發票紀錄
    await Promise.allSettled([
      this.supabaseAdmin.from('carts').update({ status: 'completed' }).eq('id', cartId),
      this._handleInvoiceCreation(newOrder.id, userId, backendSnapshot.summary.total, invoiceOptions),
    ]);

    // ========== 發送確認信 (夾帶 Magic Link: 若為「忘記登入的會員」) ==========
    try {
      const emailText = this._createOrderEmailText(
        newOrder,
        finalOrderItems ?? [],
        address,
        shippingMethod,
        paymentMethod,
        !treatAsLoggedMember ? magicLinkForMail : null
      );

      const fromName = Deno.env.get('ORDER_MAIL_FROM_NAME') ?? 'Green Health 訂單中心';
      const fromAddr = Deno.env.get('ORDER_MAIL_FROM_ADDR') ?? 'sales@greenhealthtw.com.tw';
      const bccAddr = Deno.env.get('ORDER_MAIL_BCC') ?? '';
      const replyTo = Deno.env.get('ORDER_MAIL_REPLY_TO') ?? 'service@greenhealthtw.com.tw';

      await this.resend.emails.send({
        from: `${fromName} <${fromAddr}>`,
        to: [newOrder.customer_email],
        ...(bccAddr ? { bcc: [bccAddr] } : {}),
        reply_to: replyTo,
        subject: `您的 Green Health 訂單 ${newOrder.order_number} 已確認`,
        text: emailText,
      });
    } catch (emailErr) {
      console.error(`[WARNING] 訂單 ${newOrder.order_number} 確認信發送失敗:`, emailErr);
    }

    // ========== 成功回應 ==========
    return new Response(
      JSON.stringify({
        success: true,
        orderNumber: newOrder.order_number,
        orderDetails: {
          order: newOrder,
          items: finalOrderItems ?? [],
          address,
          shippingMethod,
          paymentMethod,
          // 僅供除錯或後續擴充，不建議前端顯示：
          // autoLinked: Boolean(userId && !treatAsLoggedMember)
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const handler = new CreateUnifiedOrderHandler();
    return await handler.handleRequest(req);
  } catch (error: any) {
    console.error('[create-order-from-cart] 未攔截錯誤:', error?.message, error?.stack);
    return new Response(
      JSON.stringify({ error: { message: `[create-order-from-cart] ${error?.message ?? 'Unknown error'}` } }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
