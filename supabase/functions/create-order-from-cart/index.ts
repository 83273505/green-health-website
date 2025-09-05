// 檔案路徑: supabase/functions/create-order-from-cart/index.ts
/**
 * 檔案名稱：index.ts
 * 檔案職責：統一智慧型訂單建立函式，整合了交易級庫存控制。
<<<<<<< Updated upstream
 * 版本：49.2
 * SOP 條款對應：
 * - [2.1.4.1] 內容規範與來源鐵律 (🔴L1)
 * - [2.1.4.3] 絕對路徑錨定原則 (🔴L1)
 * - [0.1] 全域執行與情境鎖定原則
 * - [1.1] 操作同理心
 * - [2.1.1] 語言一致性
 * - [2.1.4] 標準化檔案標頭
 * - [2.3.2] 統一日誌策略 (包含 AI 日誌協作核心指令集 v1.0)
 * - [2.3.3] 錯誤處理策略
 * - [3.1.4] AI 交付協定：零省略、絕對輸出與自我修正原則
 * 依賴清單 (Dependencies)：
 * - 共享服務: ../_shared/services/loggingService.ts (v2.1)
 * - 共享服務: ../_shared/services/InvoiceService.ts (v1.2)
=======
 * 版本：49.3
 * SOP 條款對應：
 * - [2.2.2] 非破壞性整合
 * - [1.1] 操作同理心
 * - [2.1.4.1] 內容規範與來源鐵律 (🔴L1)
 * - [2.1.4.3] 絕對路徑錨定原則 (🔴L1)
 * 依賴清單 (Dependencies)：
 * - 共享服務: ../_shared/services/loggingService.ts (v2.2)
 * - 共享服務: ../_shared/services/InvoiceService.ts
>>>>>>> Stashed changes
 * - 共享工具: ../_shared/cors.ts
 * - 共享工具: ../_shared/utils/NumberToTextHelper.ts
 * - 外部函式庫: supabase-js, resend (via ../_shared/deps.ts)
 * AI 註記：
<<<<<<< Updated upstream
 * - 此版本已遵循 SOP v7.1 的第二次修訂版，確保檔案名稱的字面一致性。
 * 更新日誌 (Changelog)：
 * - v49.2 (2025-09-05)：[SOP v7.1 合規] 遵循 [2.1.4.1] 來源鐵律，修正 `檔案名稱` 欄位與實際檔名 `index.ts` 一致。
 * - v49.1 (2025-09-05)：[SOP v7.1 合規] 新增 [2.1.4.3] 絕對路徑錨定原則。
 * - v49.0 (2025-09-05)：[SOP v7.1 合規重構] 引入稽核日誌、新錯誤格式與端到端追蹤 ID。
 * - v48.0 (2025-09-04)：[庫存控制整合] 引入庫存兌現與樂觀鎖機制。
 * - v47.1 (2025-09-03)：[依賴注入修正] 修正 InvoiceService 的實例化方式。
=======
 * - 此版本為修正版，修正了對 `loggingService.ts` 的錯誤引用方式，使其完全遵循既有的設計模式。
 * 更新日誌 (Changelog)：
 * - v49.3 (2025-09-06)：[BUG FIX] 修正對 LoggingService 的引用與實例化方式，解決函式啟動失敗的根本問題。
 * - v49.2 (2025-09-06)：[SOP v7.1 合規] 修正檔案標頭。
 * - v49.1 (2025-09-05)：[SOP v7.1 合規] 新增絕對路徑錨定。
>>>>>>> Stashed changes
 */

import { createClient, Resend } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { NumberToTextHelper } from '../_shared/utils/NumberToTextHelper.ts';
import { InvoiceService } from '../_shared/services/InvoiceService.ts';
<<<<<<< Updated upstream
import LoggingService, { withErrorLogging, generateCorrelationId } from '../_shared/services/loggingService.ts';

const FUNCTION_NAME = 'create-order-from-cart';
const FUNCTION_VERSION = 'v49.2';
=======
import LoggingService, { withErrorLogging } from '../_shared/services/loggingService.ts';

const FUNCTION_NAME = 'create-order-from-cart';
const FUNCTION_VERSION = 'v49.3';
>>>>>>> Stashed changes

class CreateUnifiedOrderHandler {
  private supabaseAdmin: ReturnType<typeof createClient>;
  private resend: Resend;
  private logger: LoggingService;
<<<<<<< Updated upstream
  private correlationId: string;

  constructor(logger: LoggingService, correlationId: string) {
    this.logger = logger;
    this.correlationId = correlationId;
=======
  
  constructor(logger: LoggingService) {
    this.logger = logger;
>>>>>>> Stashed changes
    this.supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );
    this.resend = new Resend(Deno.env.get('RESEND_API_KEY')!);
  }
<<<<<<< Updated upstream

  private async _commitStockAndFinalizeInventory(cartId: string, cartItems: any[]) {
    this.logger.info('啟動庫存兌現與最終扣減流程', { cartId });
=======
  
  private async _commitStockAndFinalizeInventory(cartId: string, cartItems: any[], correlationId: string) {
    this.logger.info('啟動庫存兌現與最終扣減流程', correlationId, { cartId });
>>>>>>> Stashed changes

    const itemIds = cartItems.map(item => item.id);
    const { data: reservations, error: reservationError } = await this.supabaseAdmin
        .from('cart_stock_reservations')
        .select('cart_item_id, expires_at')
        .in('cart_item_id', itemIds)
        .eq('status', 'active');

    if (reservationError) {
<<<<<<< Updated upstream
        this.logger.error('資料庫操作失敗：查詢庫存預留', reservationError, { cartId });
=======
        this.logger.error('資料庫操作失敗：查詢庫存預留', correlationId, reservationError, { cartId });
>>>>>>> Stashed changes
        throw new Error(`查詢庫存預留失敗: ${reservationError.message}`);
    }
    
    const now = new Date();
    if (reservations.length !== itemIds.length || reservations.some(r => new Date(r.expires_at) < now)) {
        throw {
            name: 'ReservationExpiredError',
            message: '您的購物車部分商品預留已過期，為確保庫存正確，請返回購物車刷新後重新結帳。'
        };
    }

<<<<<<< Updated upstream
    this.logger.info('所有庫存預留驗證通過', { cartId });
=======
    this.logger.info('所有庫存預留驗證通過', correlationId, { cartId });
>>>>>>> Stashed changes

    for (const item of cartItems) {
        const variantId = item.product_variant_id;
        const quantity = item.quantity;

        const { data: variant, error: fetchError } = await this.supabaseAdmin
            .from('product_variants')
<<<<<<< Updated upstream
            .select('stock, version')
=======
            .select('stock, version, name')
>>>>>>> Stashed changes
            .eq('id', variantId)
            .single();

        if (fetchError || !variant) {
            throw new Error(`無法獲取商品版本號: ${variantId}`);
        }
        
        if (variant.stock < quantity) {
<<<<<<< Updated upstream
            throw { name: 'InsufficientStockError', message: `最終確認時發現商品 ${item.product_variants.name} 庫存不足` };
=======
            throw { name: 'InsufficientStockError', message: `最終確認時發現商品 ${variant.name} 庫存不足` };
>>>>>>> Stashed changes
        }
        
        const { error: updateError } = await this.supabaseAdmin
            .from('product_variants')
            .update({
                stock: variant.stock - quantity,
                version: variant.version + 1
            })
            .eq('id', variantId)
            .eq('version', variant.version);

        if (updateError) {
<<<<<<< Updated upstream
            this.logger.warn('庫存扣減失敗 (樂觀鎖衝突或DB錯誤)', { error: updateError, variantId, expectedVersion: variant.version });
            throw new Error(`商品 ${item.product_variants.name} 庫存更新失敗，可能其他顧客剛好結帳，請重試。`);
        }
    }

    this.logger.info('所有商品庫存扣減成功', { cartId });
=======
            this.logger.warn('庫存扣減失敗 (樂觀鎖衝突或DB錯誤)', correlationId, { error: updateError, variantId, expectedVersion: variant.version });
            throw new Error(`商品 ${variant.name} 庫存更新失敗，可能其他顧客剛好結帳，請重試。`);
        }
    }

    this.logger.info('所有商品庫存扣減成功', correlationId, { cartId });
>>>>>>> Stashed changes
  }

  private async _calculateCartSummary(
    req: Request,
    cartId: string,
<<<<<<< Updated upstream
=======
    correlationId: string,
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
      this.logger.error('[RLS 檢查] _calculateCartSummary 查詢失敗', cartItemsError, { cartId });
=======
      this.logger.error('[RLS 檢查] _calculateCartSummary 查詢失敗', correlationId, cartItemsError, { cartId });
>>>>>>> Stashed changes
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
      (sum, item) => sum + Math.round((item.product_variants.sale_price ?? item.product_variants.price) * item.quantity), 0
    );

    let couponDiscount = 0;
    let appliedCoupon = null;
    if (couponCode) {
      const { data: coupon } = await this.supabaseAdmin.from('coupons').select('*').eq('code', couponCode).eq('is_active', true).single();
      if (coupon && subtotal >= coupon.min_purchase_amount) {
        if (coupon.discount_type === 'PERCENTAGE' && coupon.discount_percentage) {
          couponDiscount = Math.round(subtotal * (coupon.discount_percentage / 100));
        } else if (coupon.discount_type === 'FIXED_AMOUNT' && coupon.discount_amount) {
          couponDiscount = Math.round(coupon.discount_amount);
        }
        appliedCoupon = { code: coupon.code, discountAmount: couponDiscount };
      }
    }

    let shippingFee = 0;
    const subtotalAfterDiscount = subtotal - couponDiscount;
    if (shippingMethodId) {
      const { data: shippingRate } = await this.supabaseAdmin.from('shipping_rates').select('*').eq('id', shippingMethodId).eq('is_active', true).single();
      if (shippingRate && (!shippingRate.free_shipping_threshold || subtotalAfterDiscount < shippingRate.free_shipping_threshold)) {
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
    order: any, orderItems: any[], address: any, shippingMethod: any, paymentMethod: any, isAnonymous: boolean, magicLink?: string | null
  ): string {
    const fullAddress = `${address.postal_code || ''} ${address.city || ''}${address.district || ''}${address.street_address || ''}`.trim();
    const itemsHtml = (orderItems || []).map((item: any) => {
        const priceAtOrder = Number(item.price_at_order);
        const quantity = Number(item.quantity);
        const variantName = item.product_variants?.name || '未知品項';
        if (Number.isNaN(priceAtOrder) || Number.isNaN(quantity)) {
          return `<li style="padding-bottom: 10px;">${variantName} (數量: ${item.quantity}) - 金額計算錯誤</li>`;
        }
        const itemTotal = priceAtOrder * quantity;
        return `<li style="padding-bottom: 10px;">${variantName}<br/><small style="color:#555;">數量: ${quantity} × 單價: ${NumberToTextHelper.formatMoney(priceAtOrder)} = 小計: ${NumberToTextHelper.formatMoney(itemTotal)}</small></li>`;
      }).join('');

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

    const magicLinkHtml = magicLink ? `
      <tr><td style="padding: 20px 0; border-top:1px dashed #cccccc;">
          <h3 style="margin:0 0 10px 0; color:#5E8C61;">🔑 快速登入</h3>
          <p style="margin:0 0 15px 0; font-size:14px; color:#555555;">我們偵測到此 Email 為已註冊之會員。您本次雖未登入，但訂單已自動歸戶。您可以點擊以下安全連結快速登入，查看完整訂單歷史：</p>
          <a href="${magicLink}" target="_blank" style="background-color: #6c757d; color: #ffffff; padding: 12px 25px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">安全登入會員中心</a>
      </td></tr>` : '';

    return `<div style="font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; line-height: 1.6; color: #333333; max-width: 600px; margin: 0 auto; border: 1px solid #dddddd; padding: 20px;">
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
      </div>`;
  }
  
  private async _handleInvoiceCreation(newOrder: any, invoiceOptions: any, correlationId: string) {
    try {
<<<<<<< Updated upstream
      const invoiceService = new InvoiceService(this.supabaseAdmin, this.logger, this.correlationId);
      const finalInvoiceData = await invoiceService.determineInvoiceData(newOrder, invoiceOptions);
      await invoiceService.createInvoiceRecord(newOrder.id, newOrder.total_amount, finalInvoiceData);
    } catch (err: any) {
      this.logger.error(`訂單已建立，但發票記錄建立失敗`, err, { orderId: newOrder.id });
    }
  }

  private async _ensureProfileExists(userId: string): Promise<void> {
    const { data: existingProfile, error: selectError } = await this.supabaseAdmin.from('profiles').select('id').eq('id', userId).maybeSingle();
    if (selectError) {
      this.logger.error('[_ensureProfileExists] 查詢 profiles 失敗', selectError, { userId });
      throw selectError;
    }
    if (!existingProfile) {
      this.logger.info(`profiles 記錄不存在，為 User ID 建立「空殼」記錄...`, { userId });
      const { error: upsertError } = await this.supabaseAdmin.from('profiles').upsert({ id: userId, status: 'active' });
      if (upsertError) {
        this.logger.error('[_ensureProfileExists] 建立「空殼」profiles 記錄失敗', upsertError, { userId });
        throw upsertError;
      }
      this.logger.info(`成功為 User ID 建立「空殼」profiles 記錄`, { userId });
    }
  }

  private async _findUserIdByEmail(email: string): Promise<string | null> {
=======
      const invoiceService = new InvoiceService(this.supabaseAdmin, this.logger);
      await invoiceService.createInvoiceRecord(newOrder.id, newOrder.total_amount, invoiceOptions);
    } catch (err: any) {
      this.logger.error(`訂單已建立，但發票記錄建立失敗`, correlationId, err, { orderId: newOrder.id });
    }
  }

  private async _ensureProfileExists(userId: string, correlationId: string): Promise<void> {
    const { data: existingProfile, error: selectError } = await this.supabaseAdmin.from('profiles').select('id').eq('id', userId).maybeSingle();
    if (selectError) {
      this.logger.error('[_ensureProfileExists] 查詢 profiles 失敗', correlationId, selectError, { userId });
      throw selectError;
    }
    if (!existingProfile) {
      this.logger.info(`profiles 記錄不存在，為 User ID 建立「空殼」記錄...`, correlationId, { userId });
      const { error: upsertError } = await this.supabaseAdmin.from('profiles').upsert({ id: userId, status: 'active' });
      if (upsertError) {
        this.logger.error('[_ensureProfileExists] 建立「空殼」profiles 記錄失敗', correlationId, upsertError, { userId });
        throw upsertError;
      }
      this.logger.info(`成功為 User ID 建立「空殼」profiles 記錄`, correlationId, { userId });
    }
  }

  private async _findUserIdByEmail(email: string, correlationId: string): Promise<string | null> {
>>>>>>> Stashed changes
    if (!email) return null;
    const lowerCaseEmail = email.toLowerCase();
    try {
      const { data, error } = await this.supabaseAdmin.from('users', { schema: 'auth' }).select('id').eq('email', lowerCaseEmail).single();
      if (data?.id) return data.id;
      if (error && error.code !== 'PGRST116') {
<<<<<<< Updated upstream
        this.logger.warn('[_findUserIdByEmail] 直接查詢 auth.users 返回非預期錯誤', { error });
      }
    } catch (e: any) {
      this.logger.warn('[_findUserIdByEmail] 直接查詢 auth.users 失敗', { error: e?.message ?? e });
=======
        this.logger.warn('[_findUserIdByEmail] 直接查詢 auth.users 返回非預期錯誤', correlationId, { error });
      }
    } catch (e: any) {
      this.logger.warn('[_findUserIdByEmail] 直接查詢 auth.users 失敗', correlationId, { error: e?.message ?? e });
>>>>>>> Stashed changes
    }
    return null;
  }

  private async _generateMagicLink(email: string, correlationId: string): Promise<string | null> {
    try {
      const siteUrl = Deno.env.get('SITE_URL');
      if (!siteUrl) {
<<<<<<< Updated upstream
        this.logger.warn('[MagicLink] SITE_URL 未設定, 無法產生連結。');
=======
        this.logger.warn('[MagicLink] SITE_URL 未設定, 無法產生連結。', correlationId);
>>>>>>> Stashed changes
        return null;
      }
      const redirectTo = `${siteUrl.replace(/\/+$/, '')}/account-module/dashboard.html`;
      const { data, error } = await this.supabaseAdmin.auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo } });
      if (error) {
<<<<<<< Updated upstream
        this.logger.warn('[admin.generateLink] 失敗', { error });
=======
        this.logger.warn('[admin.generateLink] 失敗', correlationId, { error });
>>>>>>> Stashed changes
        return null;
      }
      return data?.properties?.action_link ?? null;
    } catch (e: any) {
<<<<<<< Updated upstream
      this.logger.warn('[generateMagicLink] 未預期錯誤', { error: e });
=======
      this.logger.warn('[generateMagicLink] 未預期錯誤', correlationId, { error: e });
>>>>>>> Stashed changes
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
    const required = ['cartId', 'shippingDetails', 'selectedShippingMethodId', 'selectedPaymentMethodId', 'frontendValidationSummary'];
    for (const key of required) {
      if (!data?.[key]) return { valid: false, message: `缺少必要參數: ${key}` };
    }
    if (!data.shippingDetails.email) {
      return { valid: false, message: 'shippingDetails 中缺少 email' };
    }
    return { valid: true };
  }

<<<<<<< Updated upstream
  async handleRequest(req: Request): Promise<Response> {
    const requestData = await req.json().catch(() => ({}));
    const validation = this._validateRequest(requestData);
    if (!validation.valid) {
      this.logger.warn('無效請求：缺少必要參數', { reason: validation.message ?? '未知', requestData });
      return new Response(JSON.stringify({ success: false, error: { message: validation.message ?? '無效請求', code: 'INVALID_REQUEST', correlationId: this.correlationId } }), { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
=======
  async handleRequest(req: Request, correlationId: string): Promise<Response> {
    const requestData = await req.json().catch(() => ({}));
    const validation = this._validateRequest(requestData);
    if (!validation.valid) {
      this.logger.warn('無效請求：缺少必要參數', correlationId, { reason: validation.message ?? '未知', requestData });
      return new Response(JSON.stringify({ success: false, error: { message: validation.message ?? '無效請求', code: 'INVALID_REQUEST', correlationId: correlationId } }), { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
>>>>>>> Stashed changes
    }

    const { cartId, shippingDetails, selectedShippingMethodId, selectedPaymentMethodId, frontendValidationSummary, invoiceOptions, couponCode } = requestData;

    let userId: string | null = null;
    let wasAutoLinked = false;
    let isAnonymous = false;
    const authHeader = req.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await this.supabaseAdmin.auth.getUser(token);
      if (user) {
        userId = user.id;
        isAnonymous = !!user.is_anonymous;
<<<<<<< Updated upstream
        this.logger.info('身分已透過 JWT 解析', { userId, isAnonymous });
      } else {
        this.logger.warn('收到無效的 JWT 權杖');
=======
        this.logger.info('身分已透過 JWT 解析', correlationId, { userId, isAnonymous });
      } else {
        this.logger.warn('收到無效的 JWT 權杖', correlationId);
>>>>>>> Stashed changes
      }
    }

    if (!userId && shippingDetails?.email) {
      const maybeExistingUserId = await this._findUserIdByEmail(shippingDetails.email, correlationId);
      if (maybeExistingUserId) {
        userId = maybeExistingUserId;
        wasAutoLinked = true;
        isAnonymous = false;
<<<<<<< Updated upstream
        this.logger.info('身分已透過 Email 自動歸戶', { email: shippingDetails.email, linkedUserId: userId });
      } else {
        isAnonymous = true;
        this.logger.info('身分被視為新的匿名訪客', { email: shippingDetails.email });
=======
        this.logger.info('身分已透過 Email 自動歸戶', correlationId, { email: shippingDetails.email, linkedUserId: userId });
      } else {
        isAnonymous = true;
        this.logger.info('身分被視為新的匿名訪客', correlationId, { email: shippingDetails.email });
>>>>>>> Stashed changes
      }
    }

    if (userId) {
<<<<<<< Updated upstream
      await this._ensureProfileExists(userId);
=======
      await this._ensureProfileExists(userId, correlationId);
>>>>>>> Stashed changes
    }

    const backendSnapshot = await this._calculateCartSummary(req, cartId, correlationId, couponCode, selectedShippingMethodId);

    if (backendSnapshot.summary.total !== frontendValidationSummary.total) {
<<<<<<< Updated upstream
      this.logger.warn('價格不匹配，拒絕訂單建立', { frontend: frontendValidationSummary, backend: backendSnapshot.summary });
      return new Response(JSON.stringify({ success: false, error: { message: '訂單金額與當前優惠不符，請重新確認。', code: 'PRICE_MISMATCH', correlationId: this.correlationId } }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!backendSnapshot.items?.length) {
      this.logger.warn('無法建立訂單，因購物車為空', { cartId });
      return new Response(JSON.stringify({ success: false, error: { message: '無法建立訂單，購物車為空。', code: 'EMPTY_CART', correlationId: this.correlationId } }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    try {
        await this._commitStockAndFinalizeInventory(cartId, backendSnapshot.items);
    } catch (err) {
        const errorCode = err.name === 'ReservationExpiredError' ? 'RESERVATION_EXPIRED' : 'INSUFFICIENT_STOCK';
        this.logger.warn(`[庫存兌現失敗] ${err.message}`, { cartId, errorName: err.name });
        return new Response(JSON.stringify({ success: false, error: { message: err.message, code: errorCode, correlationId: this.correlationId } }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
=======
      this.logger.warn('價格不匹配，拒絕訂單建立', correlationId, { frontend: frontendValidationSummary, backend: backendSnapshot.summary });
      return new Response(JSON.stringify({ success: false, error: { message: '訂單金額與當前優惠不符，請重新確認。', code: 'PRICE_MISMATCH', correlationId: correlationId } }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!backendSnapshot.items?.length) {
      this.logger.warn('無法建立訂單，因購物車為空', correlationId, { cartId });
      return new Response(JSON.stringify({ success: false, error: { message: '無法建立訂單，購物車為空。', code: 'EMPTY_CART', correlationId: correlationId } }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    try {
        await this._commitStockAndFinalizeInventory(cartId, backendSnapshot.items, correlationId);
    } catch (err) {
        const errorCode = err.name === 'ReservationExpiredError' ? 'RESERVATION_EXPIRED' : 'INSUFFICIENT_STOCK';
        this.logger.warn(`[庫存兌現失敗] ${err.message}`, correlationId, { cartId, errorName: err.name });
        return new Response(JSON.stringify({ success: false, error: { message: err.message, code: errorCode, correlationId: correlationId } }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
>>>>>>> Stashed changes
    }

    const { data: shippingMethod } = await this.supabaseAdmin.from('shipping_rates').select('*').eq('id', selectedShippingMethodId).single();
    const { data: paymentMethod } = await this.supabaseAdmin.from('payment_methods').select('*').eq('id', selectedPaymentMethodId).single();
    if (!shippingMethod || !paymentMethod) {
<<<<<<< Updated upstream
      this.logger.warn('結帳所需資料不完整 (運送或付款方式)', { selectedShippingMethodId, selectedPaymentMethodId });
      return new Response(JSON.stringify({ success: false, error: { message: '結帳所需資料不完整 (運送或付款方式)。', code: 'INVALID_CHECKOUT_DATA', correlationId: this.correlationId } }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
=======
      this.logger.warn('結帳所需資料不完整 (運送或付款方式)', correlationId, { selectedShippingMethodId, selectedPaymentMethodId });
      return new Response(JSON.stringify({ success: false, error: { message: '結帳所需資料不完整 (運送或付款方式)。', code: 'INVALID_CHECKOUT_DATA', correlationId: correlationId } }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
>>>>>>> Stashed changes
    }

    const { data: newOrder, error: orderError } = await this.supabaseAdmin
      .from('orders')
      .insert({
        user_id: userId, status: 'pending_payment', total_amount: backendSnapshot.summary.total, subtotal_amount: backendSnapshot.summary.subtotal, coupon_discount: backendSnapshot.summary.couponDiscount, shipping_fee: backendSnapshot.summary.shippingFee, shipping_address_snapshot: shippingDetails, payment_method: paymentMethod.method_name, shipping_method_id: selectedShippingMethodId, payment_status: 'pending', customer_email: shippingDetails.email, customer_name: shippingDetails.recipient_name,
      }).select().single();

    if (orderError) {
<<<<<<< Updated upstream
      this.logger.critical('資料庫操作失敗：建立訂單主記錄', orderError, { userId });
      return new Response(JSON.stringify({ success: false, error: { message: `建立訂單失敗: ${orderError.message}`, code: 'ORDER_CREATION_FAILED', correlationId: this.correlationId } }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    this.logger.audit('訂單主記錄已成功建立', { operatorId: userId, orderId: newOrder.id, orderNumber: newOrder.order_number, totalAmount: newOrder.total_amount });
=======
      this.logger.critical('資料庫操作失敗：建立訂單主記錄', correlationId, orderError, { userId });
      return new Response(JSON.stringify({ success: false, error: { message: `建立訂單失敗: ${orderError.message}`, code: 'ORDER_CREATION_FAILED', correlationId: correlationId } }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    this.logger.audit('訂單主記錄已成功建立', correlationId, { operatorId: userId, orderId: newOrder.id, orderNumber: newOrder.order_number, totalAmount: newOrder.total_amount });
>>>>>>> Stashed changes

    const orderItemsToInsert = backendSnapshot.items.map((item: any) => ({
      order_id: newOrder.id, product_variant_id: item.product_variant_id, quantity: item.quantity, price_at_order: item.product_variants.sale_price ?? item.product_variants.price,
    }));
    const { error: itemsInsertError } = await this.supabaseAdmin.from('order_items').insert(orderItemsToInsert);
<<<<<<< Updated upstream
    if(itemsInsertError) { this.logger.critical('資料庫操作失敗：建立訂單項目', itemsInsertError, { orderId: newOrder.id }); throw itemsInsertError; }
    
    this.logger.audit('訂單項目已成功建立', { orderId: newOrder.id, itemCount: orderItemsToInsert.length });
=======
    if(itemsInsertError) { this.logger.critical('資料庫操作失敗：建立訂單項目', correlationId, itemsInsertError, { orderId: newOrder.id }); throw itemsInsertError; }
    
    this.logger.audit('訂單項目已成功建立', correlationId, { orderId: newOrder.id, itemCount: orderItemsToInsert.length });
>>>>>>> Stashed changes
    
    const inventoryLogs = backendSnapshot.items.map((item: any) => ({
        product_variant_id: item.product_variant_id, order_id: newOrder.id, change_quantity: -item.quantity, reason: 'order_placed', notes: `訂單 ${newOrder.order_number} 成立`
    }));
    const { error: logInsertError } = await this.supabaseAdmin.from('inventory_logs').insert(inventoryLogs);
<<<<<<< Updated upstream
    if(logInsertError) { this.logger.critical('資料庫操作失敗：寫入庫存日誌', logInsertError, { orderId: newOrder.id }); throw logInsertError; }

    this.logger.audit('庫存日誌已成功寫入', { orderId: newOrder.id, itemsChanged: inventoryLogs.length });
=======
    if(logInsertError) { this.logger.critical('資料庫操作失敗：寫入庫存日誌', correlationId, logInsertError, { orderId: newOrder.id }); throw logInsertError; }

    this.logger.audit('庫存日誌已成功寫入', correlationId, { orderId: newOrder.id, itemsChanged: inventoryLogs.length });
>>>>>>> Stashed changes

    const { data: finalOrderItems } = await this.supabaseAdmin.from('order_items').select('*, product_variants(name)').eq('order_id', newOrder.id);

    await Promise.allSettled([
      this.supabaseAdmin.from('carts').update({ status: 'completed' }).eq('id', cartId),
      this._handleInvoiceCreation(newOrder, invoiceOptions, correlationId),
    ]);

    let magicLinkForMail: string | null = null;
    if (wasAutoLinked) {
<<<<<<< Updated upstream
      magicLinkForMail = await this._generateMagicLink(shippingDetails.email);
=======
      magicLinkForMail = await this._generateMagicLink(shippingDetails.email, correlationId);
>>>>>>> Stashed changes
    }

    const bccRecipients = this._getBccRecipients();

    this.resend.emails.send({
        from: `${Deno.env.get('ORDER_MAIL_FROM_NAME') ?? 'Green Health 訂單中心'} <${Deno.env.get('ORDER_MAIL_FROM_ADDR') ?? 'sales@greenhealthtw.com.tw'}>`,
        to: [newOrder.customer_email], bcc: bccRecipients, reply_to: Deno.env.get('ORDER_MAIL_REPLY_TO') ?? 'service@greenhealthtw.com.tw',
        subject: `您的 Green Health 訂單 ${newOrder.order_number} 已確認`,
        html: this._createOrderEmailHtml(newOrder, finalOrderItems ?? [], shippingDetails, shippingMethod, paymentMethod, isAnonymous, magicLinkForMail),
      }).catch((emailErr) => {
<<<<<<< Updated upstream
        this.logger.warn(`訂單確認信發送失敗`, { orderNumber: newOrder.order_number, error: emailErr });
      });

    this.logger.info('訂單流程處理完成', { orderNumber: newOrder.order_number });
=======
        this.logger.warn(`訂單確認信發送失敗`, correlationId, { orderNumber: newOrder.order_number, error: emailErr });
      });

    this.logger.info('訂單流程處理完成', correlationId, { orderNumber: newOrder.order_number });
>>>>>>> Stashed changes

    return new Response(JSON.stringify({ success: true, data: { orderNumber: newOrder.order_number, orderDetails: { order: newOrder, items: finalOrderItems ?? [], address: shippingDetails, shippingMethod, paymentMethod } } }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
<<<<<<< Updated upstream
  const correlationId = generateCorrelationId();
  const logger = new LoggingService(FUNCTION_NAME, FUNCTION_VERSION, correlationId);
  const mainHandler = async (request: Request): Promise<Response> => {
    const orderHandler = new CreateUnifiedOrderHandler(logger, correlationId);
    return await orderHandler.handleRequest(request);
  };
=======
  
  const logger = new LoggingService(FUNCTION_NAME, FUNCTION_VERSION);
  
  const mainHandler = async (request: Request, logger: LoggingService, correlationId: string): Promise<Response> => {
    const orderHandler = new CreateUnifiedOrderHandler(logger);
    return await orderHandler.handleRequest(request, correlationId);
  };
  
>>>>>>> Stashed changes
  const wrappedHandler = withErrorLogging(mainHandler, logger);
  return await wrappedHandler(req);
});