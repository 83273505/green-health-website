// ==============================================================================
// 檔案路徑: supabase/functions/create-order-from-cart/index.ts
// 版本: v47.1 - 依賴注入修正 (最終穩定版)
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Unified Intelligent Order Creation Function (統一智慧型訂單建立函式)
 * @description 最終版訂單建立函式。
 * @version v47.1
 *
 * @update v47.1 - [DEPENDENCY INJECTION FIX]
 * 1. [核心修正] 修正了 `_handleInvoiceCreation` 方法中對 `InvoiceService` 的
 *          實例化方式。現在會將 `logger` 和 `correlationId` 正確地注入
 *          到 `InvoiceService` 的建構函式中。
 * 2. [錯誤解決] 此修改解決了因依賴注入鏈路中斷，導致在 `SmilePay...` 層級
 *          發生 `TypeError` 的根本問題，修復了 500 錯誤。
 * 3. [專案閉環] 這是本次大規模重構的最後一個已知業務邏輯錯誤。
 *
 * @update v47.0 - [ENTERPRISE LOGGING FRAMEWORK INTEGRATION]
 * 1. [核心架構] 引入全新的 `LoggingService` v2.0，並整合企業級日誌框架。
 */

import { createClient, Resend } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { NumberToTextHelper } from '../_shared/utils/NumberToTextHelper.ts';
import { InvoiceService } from '../_shared/services/InvoiceService.ts';
import LoggingService from '../_shared/services/loggingService.ts';
import { withErrorLogging } from '../_shared/services/loggingService.ts';

const FUNCTION_NAME = 'create-order-from-cart';
const FUNCTION_VERSION = 'v47.1';

class CreateUnifiedOrderHandler {
  private supabaseAdmin: ReturnType<typeof createClient>;
  private resend: Resend;
  private logger: LoggingService;

  constructor(logger: LoggingService) {
    this.logger = logger;
    this.supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );
    this.resend = new Resend(Deno.env.get('RESEND_API_KEY')!);
  }

  private async _calculateCartSummary(
    req: Request,
    cartId: string,
    correlationId: string,
    couponCode?: string,
    shippingMethodId?: string
  ) {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase URL 或 Anon Key 未在環境變數中設定。');
    }

    const authHeader = req.headers.get('Authorization');
    const clientOptions: { global?: { headers: { [key: string]: string } } } = {};
    if (authHeader) {
      clientOptions.global = { headers: { Authorization: authHeader } };
    }

    const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, clientOptions);

    const { data: cartItems, error: cartItemsError } = await supabaseUserClient
      .from('cart_items')
      .select(`*, product_variants(name, price, sale_price, products(image_url))`)
      .eq('cart_id', cartId);

    if (cartItemsError) {
      this.logger.error(
        '[RLS 檢查] _calculateCartSummary 查詢失敗',
        correlationId,
        cartItemsError,
        { cartId }
      );
      throw new Error(`無法讀取購物車項目，請檢查權限：${cartItemsError.message}`);
    }

    if (!cartItems || cartItems.length === 0) {
      return {
        items: [],
        itemCount: 0,
        summary: { subtotal: 0, couponDiscount: 0, shippingFee: 0, total: 0 },
        appliedCoupon: null,
      };
    }

    const subtotal = cartItems.reduce(
      (sum, item) =>
        sum +
        Math.round(
          (item.product_variants.sale_price ?? item.product_variants.price) *
            item.quantity
        ),
      0
    );

    let couponDiscount = 0;
    let appliedCoupon = null;
    if (couponCode) {
      const { data: coupon } = await this.supabaseAdmin
        .from('coupons')
        .select('*')
        .eq('code', couponCode)
        .eq('is_active', true)
        .single();
      if (coupon && subtotal >= coupon.min_purchase_amount) {
        if (coupon.discount_type === 'PERCENTAGE' && coupon.discount_percentage) {
          couponDiscount = Math.round(
            subtotal * (coupon.discount_percentage / 100)
          );
        } else if (
          coupon.discount_type === 'FIXED_AMOUNT' &&
          coupon.discount_amount
        ) {
          couponDiscount = Math.round(coupon.discount_amount);
        }
        appliedCoupon = { code: coupon.code, discountAmount: couponDiscount };
      }
    }

    let shippingFee = 0;
    const subtotalAfterDiscount = subtotal - couponDiscount;
    if (shippingMethodId) {
      const { data: shippingRate } = await this.supabaseAdmin
        .from('shipping_rates')
        .select('*')
        .eq('id', shippingMethodId)
        .eq('is_active', true)
        .single();
      if (
        shippingRate &&
        (!shippingRate.free_shipping_threshold ||
          subtotalAfterDiscount < shippingRate.free_shipping_threshold)
      ) {
        shippingFee = Math.round(shippingRate.rate);
      }
    }

    const total = subtotal - couponDiscount + shippingFee;

    return {
      items: cartItems,
      itemCount: cartItems.reduce((sum, item) => sum + item.quantity, 0),
      summary: {
        subtotal,
        couponDiscount,
        shippingFee,
        total: total < 0 ? 0 : total,
      },
      appliedCoupon,
    };
  }

  private _createOrderEmailHtml(
    order: any,
    orderItems: any[],
    address: any,
    shippingMethod: any,
    paymentMethod: any,
    isAnonymous: boolean,
    magicLink?: string | null
  ): string {
    const fullAddress =
      `${address.postal_code || ''} ${address.city || ''}${
        address.district || ''
      }${address.street_address || ''}`.trim();
    const itemsHtml = (orderItems || []).map((item: any) => {
        const priceAtOrder = Number(item.price_at_order);
        const quantity = Number(item.quantity);
        const variantName = item.product_variants?.name || '未知品項';
        if (Number.isNaN(priceAtOrder) || Number.isNaN(quantity)) {
          return `<li style="padding-bottom: 10px;">${variantName} (數量: ${item.quantity}) - 金額計算錯誤</li>`;
        }
        const itemTotal = priceAtOrder * quantity;
        return `<li style="padding-bottom: 10px;">${variantName}<br/><small style="color:#555;">數量: ${quantity} × 單價: ${NumberToTextHelper.formatMoney(
          priceAtOrder
        )} = 小計: ${NumberToTextHelper.formatMoney(itemTotal)}</small></li>`;
      })
      .join('');

    let signupCtaHtml = '';
    if (isAnonymous) {
      const signupUrl = `${Deno.env.get('SITE_URL')}/account-module/index.html?email=${encodeURIComponent(order.customer_email)}`;
      signupCtaHtml = `
        <tr><td style="padding: 20px 0; border-top:1px dashed #cccccc;">
            <h3 style="margin:0 0 10px 0; color:#5E8C61;">✨ 想讓下次購物更快速嗎？</h3>
            <p style="margin:0 0 15px 0; font-size:14px; color:#555555;">加入會員即可保存您的收件資訊，並隨時查詢訂單狀態！</p>
            <a href="${signupUrl}" target="_blank" style="background-color: #5E8C61; color: #ffffff; padding: 12px 25px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">立即加入會員</a>
        </td></tr>`;
    }

    const magicLinkHtml = magicLink
      ? `
      <tr><td style="padding: 20px 0; border-top:1px dashed #cccccc;">
          <h3 style="margin:0 0 10px 0; color:#5E8C61;">🔑 快速登入</h3>
          <p style="margin:0 0 15px 0; font-size:14px; color:#555555;">我們偵測到此 Email 為已註冊之會員。您本次雖未登入，但訂單已自動歸戶。您可以點擊以下安全連結快速登入，查看完整訂單歷史：</p>
          <a href="${magicLink}" target="_blank" style="background-color: #6c757d; color: #ffffff; padding: 12px 25px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">安全登入會員中心</a>
      </td></tr>`
      : '';

    return `
      <div style="font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; line-height: 1.6; color: #333333; max-width: 600px; margin: 0 auto; border: 1px solid #dddddd; padding: 20px;">
        <h2 style="color: #5E8C61; text-align: center;">Green Health 綠健 訂單確認</h2>
        <p>您好，${address.recipient_name}！ 您的訂單已成功建立，以下是訂單詳細資訊：</p>
        
        <div style="border-top: 1px solid #eeeeee; margin-top: 20px; padding-top: 20px;">
          <h3 style="margin-top: 0;">訂單資訊</h3>
          <p><strong>訂單編號：</strong> ${order.order_number}<br><strong>下單時間：</strong> ${new Date(order.created_at).toLocaleString('zh-TW')}</p>
        </div>

        <div style="border-top: 1px solid #eeeeee; margin-top: 20px; padding-top: 20px;">
          <h3 style="margin-top: 0;">訂購商品</h3>
          <ul style="list-style:none; padding:0;">${itemsHtml}</ul>
        </div>
        
        <div style="border-top: 1px solid #eeeeee; margin-top: 20px; padding-top: 20px;">
          <h3 style="margin-top: 0;">費用明細</h3>
          <p>商品小計： ${NumberToTextHelper.formatMoney(order.subtotal_amount)}<br>
          ${order.coupon_discount > 0 ? `優惠折扣： -${NumberToTextHelper.formatMoney(order.coupon_discount)}<br>` : ''}
          運送費用： ${NumberToTextHelper.formatMoney(order.shipping_fee)}<br>
          <strong style="font-size: 1.1em;">總計金額： ${NumberToTextHelper.formatMoney(order.total_amount)}</strong></p>
        </div>

        <div style="border-top: 1px solid #eeeeee; margin-top: 20px; padding-top: 20px;">
          <h3 style="margin-top: 0;">配送與付款資訊</h3>
          <p><strong>收件人：</strong> ${address.recipient_name}<br><strong>聯絡電話：</strong> ${address.phone_number}<br><strong>配送地址：</strong> ${fullAddress}<br><strong>配送方式：</strong> ${shippingMethod?.method_name || '未指定'}</p>
          <p><strong>付款方式：</strong> ${paymentMethod?.method_name || '未指定'}<br><strong>付款狀態：</strong> ${order.payment_status}<br>
          ${paymentMethod?.instructions ? `<strong>付款指示：</strong><br>${paymentMethod.instructions.replace(/\n/g, '<br>')}` : ''}</p>
        </div>
        
        <table width="100%" border="0" cellpadding="0" cellspacing="0">
          <tbody>
            ${magicLink ? magicLinkHtml : signupCtaHtml}
          </tbody>
        </table>
        
        <div style="font-size:12px; color:#999999; border-top:1px solid #eeeeee; padding-top:20px; margin-top: 20px;">
            <p style="margin:0; text-align:left;"><strong>防詐騙提醒：</strong>Green Health 絕對不會要求您操作 ATM 或提供信用卡資訊。若接到可疑來電，請聯繫我們或撥打 165。</p>
        </div>
      </div>
    `;
  }
  
  // [v47.1 核心修正]
  private async _handleInvoiceCreation(
    newOrder: any,
    invoiceOptions: any,
    correlationId: string
  ) {
    try {
      // [v47.1 核心修正] 將 logger 和 correlationId 正確地注入到 InvoiceService
      const invoiceService = new InvoiceService(this.supabaseAdmin, this.logger, correlationId);
      const finalInvoiceData = await invoiceService.determineInvoiceData(newOrder, invoiceOptions);
      await invoiceService.createInvoiceRecord(newOrder.id, newOrder.total_amount, finalInvoiceData);
    } catch (err: any) {
      this.logger.error(
        `訂單已建立，但發票記錄建立失敗`,
        correlationId,
        err,
        { orderId: newOrder.id }
      );
    }
  }

  private async _ensureProfileExists(
    userId: string,
    correlationId: string
  ): Promise<void> {
    const { data: existingProfile, error: selectError } =
      await this.supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .maybeSingle();

    if (selectError) {
      this.logger.error(
        '[_ensureProfileExists] 查詢 profiles 失敗',
        correlationId,
        selectError,
        { userId }
      );
      throw selectError;
    }

    if (!existingProfile) {
      this.logger.info(
        `profiles 記錄不存在，為 User ID 建立「空殼」記錄...`,
        correlationId,
        { userId }
      );
      const { error: upsertError } = await this.supabaseAdmin
        .from('profiles')
        .upsert({ id: userId, status: 'active' });

      if (upsertError) {
        this.logger.error(
          '[_ensureProfileExists] 建立「空殼」profiles 記錄失敗',
          correlationId,
          upsertError,
          { userId }
        );
        throw upsertError;
      }
      this.logger.info(
        `成功為 User ID 建立「空殼」profiles 記錄`,
        correlationId,
        { userId }
      );
    }
  }

  private async _findUserIdByEmail(
    email: string,
    correlationId: string
  ): Promise<string | null> {
    if (!email) return null;
    const lowerCaseEmail = email.toLowerCase();

    try {
      const { data, error } = await this.supabaseAdmin
        .from('users', { schema: 'auth' })
        .select('id')
        .eq('email', lowerCaseEmail)
        .single();
      if (data?.id) return data.id;
      if (error && error.code !== 'PGRST116') {
        this.logger.warn(
          '[_findUserIdByEmail] 直接查詢 auth.users 返回非預期錯誤',
          correlationId,
          { error }
        );
      }
    } catch (e: any) {
      this.logger.warn(
        '[_findUserIdByEmail] 直接查詢 auth.users 失敗',
        correlationId,
        { error: e?.message ?? e }
      );
    }
    return null;
  }

  private async _generateMagicLink(
    email: string,
    correlationId: string
  ): Promise<string | null> {
    try {
      const siteUrl = Deno.env.get('SITE_URL');
      if (!siteUrl) {
        this.logger.warn(
          '[MagicLink] SITE_URL 未設定, 無法產生連結。',
          correlationId
        );
        return null;
      }
      const redirectTo = `${siteUrl.replace(
        /\/+$/,
        ''
      )}/account-module/dashboard.html`;
      const { data, error } = await this.supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email,
        options: { redirectTo },
      });
      if (error) {
        this.logger.warn('[admin.generateLink] 失敗', correlationId, {
          error,
        });
        return null;
      }
      return data?.properties?.action_link ?? null;
    } catch (e: any) {
      this.logger.warn('[generateMagicLink] 未預期錯誤', correlationId, {
        error: e,
      });
      return null;
    }
  }

  private _getBccRecipients(): string[] {
    const primaryBcc = 'a896214@gmail.com';
    const additionalBcc = Deno.env.get('ORDER_MAIL_BCC');
    const recipients = [primaryBcc];
    if (additionalBcc) {
      recipients.push(additionalBcc);
    }
    return [...new Set(recipients)];
  }

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

  async handleRequest(
    req: Request,
    correlationId: string
  ): Promise<Response> {
    const requestData = await req.json().catch(() => ({}));
    const validation = this._validateRequest(requestData);
    if (!validation.valid) {
      this.logger.warn('Request validation failed', correlationId, {
        reason: validation.message ?? '無效請求',
        requestData,
      });
      return new Response(
        JSON.stringify({ error: { message: validation.message ?? '無效請求' } }),
        {
          status: 422,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const {
      cartId,
      shippingDetails,
      selectedShippingMethodId,
      selectedPaymentMethodId,
      frontendValidationSummary,
      invoiceOptions,
      couponCode,
    } = requestData;

    let userId: string | null = null;
    let wasAutoLinked = false;
    let isAnonymous = false;

    const authHeader = req.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      const {
        data: { user },
      } = await this.supabaseAdmin.auth.getUser(token);
      if (user) {
        userId = user.id;
        isAnonymous = !!user.is_anonymous;
        this.logger.info('Identity resolved via JWT', correlationId, {
          userId,
          isAnonymous,
        });
      } else {
        this.logger.warn('收到無效的 token', correlationId);
      }
    }

    if (!userId && shippingDetails?.email) {
      const maybeExistingUserId = await this._findUserIdByEmail(
        shippingDetails.email,
        correlationId
      );
      if (maybeExistingUserId) {
        userId = maybeExistingUserId;
        wasAutoLinked = true;
        isAnonymous = false;
        this.logger.info(
          'Identity resolved via email auto-linking',
          correlationId,
          { email: shippingDetails.email, linkedUserId: userId }
        );
      } else {
        isAnonymous = true;
        this.logger.info(
          'Identity treated as new anonymous visitor',
          correlationId,
          { email: shippingDetails.email }
        );
      }
    }

    if (userId) {
      await this._ensureProfileExists(userId, correlationId);
    }

    const backendSnapshot = await this._calculateCartSummary(
      req,
      cartId,
      correlationId,
      couponCode,
      selectedShippingMethodId
    );

    if (backendSnapshot.summary.total !== frontendValidationSummary.total) {
      this.logger.warn(
        'Price mismatch detected (409 Conflict)',
        correlationId,
        {
          frontend: frontendValidationSummary,
          backend: backendSnapshot.summary,
        }
      );
      return new Response(
        JSON.stringify({
          error: {
            code: 'PRICE_MISMATCH',
            message: '訂單金額與當前優惠不符，請重新確認。',
          },
        }),
        {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
    if (!backendSnapshot.items?.length) {
      this.logger.warn('無法建立訂單，購物車為空', correlationId, { cartId });
      return new Response(
        JSON.stringify({ error: { message: '無法建立訂單，購物車為空。' } }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

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
      this.logger.warn(
        '結帳所需資料不完整 (運送或付款方式)',
        correlationId,
        { selectedShippingMethodId, selectedPaymentMethodId }
      );
      return new Response(
        JSON.stringify({
          error: { message: '結帳所需資料不完整 (運送或付款方式)。' },
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { data: newOrder, error: orderError } = await this.supabaseAdmin
      .from('orders')
      .insert({
        user_id: userId,
        status: 'pending_payment',
        total_amount: backendSnapshot.summary.total,
        subtotal_amount: backendSnapshot.summary.subtotal,
        coupon_discount: backendSnapshot.summary.couponDiscount,
        shipping_fee: backendSnapshot.summary.shippingFee,
        shipping_address_snapshot: shippingDetails,
        payment_method: paymentMethod.method_name,
        shipping_method_id: selectedShippingMethodId,
        payment_status: 'pending',
        customer_email: shippingDetails.email,
        customer_name: shippingDetails.recipient_name,
      })
      .select()
      .single();

    if (orderError) {
      this.logger.critical(
        '建立訂單失敗 (orders.insert)',
        correlationId,
        orderError
      );
      return new Response(
        JSON.stringify({ error: { message: `建立訂單失敗: ${orderError.message}` } }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    this.logger.info('Order created successfully in "orders" table', correlationId, {
      orderId: newOrder.id,
      orderNumber: newOrder.order_number,
    });

    const orderItemsToInsert = backendSnapshot.items.map((item: any) => ({
      order_id: newOrder.id,
      product_variant_id: item.product_variant_id,
      quantity: item.quantity,
      price_at_order:
        item.product_variants.sale_price ?? item.product_variants.price,
    }));
    await this.supabaseAdmin
      .from('order_items')
      .insert(orderItemsToInsert)
      .throwOnError();

    const { data: finalOrderItems } = await this.supabaseAdmin
      .from('order_items')
      .select('*, product_variants(name)')
      .eq('order_id', newOrder.id);

    // [v47.1 核心修正] 將 correlationId 傳遞給 _handleInvoiceCreation
    await Promise.allSettled([
      this.supabaseAdmin
        .from('carts')
        .update({ status: 'completed' })
        .eq('id', cartId),
      this._handleInvoiceCreation(newOrder, invoiceOptions, correlationId),
    ]);

    let magicLinkForMail: string | null = null;
    if (wasAutoLinked) {
      magicLinkForMail = await this._generateMagicLink(
        shippingDetails.email,
        correlationId
      );
    }

    const bccRecipients = this._getBccRecipients();

    this.resend.emails.send({
        from: `${Deno.env.get('ORDER_MAIL_FROM_NAME') ?? 'Green Health 訂單中心'} <${
          Deno.env.get('ORDER_MAIL_FROM_ADDR') ?? 'sales@greenhealthtw.com.tw'
        }>`,
        to: [newOrder.customer_email],
        bcc: bccRecipients,
        reply_to:
          Deno.env.get('ORDER_MAIL_REPLY_TO') ??
          'service@greenhealthtw.com.tw',
        subject: `您的 Green Health 訂單 ${newOrder.order_number} 已確認`,
        html: this._createOrderEmailHtml(
          newOrder,
          finalOrderItems ?? [],
          shippingDetails,
          shippingMethod,
          paymentMethod,
          isAnonymous,
          magicLinkForMail
        ),
      })
      .catch((emailErr) => {
        this.logger.warn(
          `訂單確認信發送失敗`,
          correlationId,
          { orderNumber: newOrder.order_number, error: emailErr }
        );
      });

    this.logger.info(
      'Order processing complete, sending success response',
      correlationId,
      { orderNumber: newOrder.order_number }
    );

    return new Response(
      JSON.stringify({
        success: true,
        orderNumber: newOrder.order_number,
        orderDetails: {
          order: newOrder,
          items: finalOrderItems ?? [],
          address: shippingDetails,
          shippingMethod,
          paymentMethod,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const logger = new LoggingService(FUNCTION_NAME, FUNCTION_VERSION);

  const mainHandler = async (
    request: Request,
    logger: LoggingService,
    correlationId: string
  ): Promise<Response> => {
    const orderHandler = new CreateUnifiedOrderHandler(logger);
    return await orderHandler.handleRequest(request, correlationId);
  };

  // 使用 withErrorLogging 中介軟體包裹主要處理邏輯
  const wrappedHandler = withErrorLogging(mainHandler, logger);

  return await wrappedHandler(req);
});