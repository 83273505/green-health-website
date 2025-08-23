// ==============================================================================
// 檔案路徑: supabase/functions/create-order-from-cart/index.ts
// 版本: v46.2 - 新增訂單通知副本與正體化
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Unified Intelligent Order Creation Function (統一智慧型訂單建立函式)
 * @description 最終版訂單建立函式。能智慧處理三種情境：
 *              1. 已登入會員 (透過 JWT)
 *              2. 忘記登入的會員 (透過 Email 後端查詢自動歸戶)
 *              3. 全新訪客 (建立純訪客訂單)
 *              並採用「權限透傳」模式優雅地處理 RLS，整合 Resend 寄送郵件。
 * @version v46.2
 * 
 * @update v46.2 - [ADD ORDER NOTIFICATION BCC & LOCALIZATION]
 * 1. [核心功能] 新增了訂單通知副本功能。現在，每一封寄給顧客的訂單確認信，
 *          都會自動密件副本 (BCC) 一封至 'a896214@gmail.com'，以便即時掌握訂單資訊。
 * 2. [架構優化] 新增了 `_getBccRecipients` 私有輔助函式，專門處理密件副本收件者
 *          列表的組合邏輯，使程式碼更清晰且易於維護。
 * 3. [正體化] 根據約定，對檔案內所有註解、日誌及函式內的簡體中文進行了全面的
 *          標準化校訂。
 * 
 * @update v46.1 - 「守衛回歸」終局修正
 */

import { createClient, Resend } from '../_shared/deps.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { NumberToTextHelper } from '../_shared/utils/NumberToTextHelper.ts'
import { InvoiceService } from '../_shared/services/InvoiceService.ts'

class CreateUnifiedOrderHandler {
  private supabaseAdmin: ReturnType<typeof createClient>;
  private resend: Resend;

  constructor() {
    this.supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '', 
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', 
      { auth: { persistSession: false } }
    );
    this.resend = new Resend(Deno.env.get('RESEND_API_KEY')!);
  }
  
  private async _calculateCartSummary(req: Request, cartId: string, couponCode?: string, shippingMethodId?: string) {
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
        console.error('[RLS 檢查] _calculateCartSummary 查詢失敗:', cartItemsError);
        throw new Error(`無法讀取購物車項目，請檢查權限：${cartItemsError.message}`);
    }

    if (!cartItems || cartItems.length === 0) {
      return { items: [], itemCount: 0, summary: { subtotal: 0, couponDiscount: 0, shippingFee: 0, total: 0 }, appliedCoupon: null };
    }

    const subtotal = cartItems.reduce((sum, item) => 
      sum + Math.round((item.product_variants.sale_price ?? item.product_variants.price) * item.quantity), 0);

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
      const { data: shippingRate } = await this.supabaseAdmin
        .from('shipping_rates')
        .select('*')
        .eq('id', shippingMethodId)
        .eq('is_active', true)
        .single();
      if (shippingRate && (!shippingRate.free_shipping_threshold || subtotalAfterDiscount < shippingRate.free_shipping_threshold)) {
        shippingFee = Math.round(shippingRate.rate);
      }
    }

    const total = subtotal - couponDiscount + shippingFee;

    return {
      items: cartItems,
      itemCount: cartItems.reduce((sum, item) => sum + item.quantity, 0),
      summary: { subtotal, couponDiscount, shippingFee, total: total < 0 ? 0 : total },
      appliedCoupon,
    };
  }

  private _createOrderEmailText(order: any, orderItems: any[], address: any, shippingMethod: any, paymentMethod: any, magicLink?: string | null): string {
    const fullAddress = `${address.postal_code || ''} ${address.city || ''}${address.district || ''}${address.street_address || ''}`.trim();
    const itemsList = (orderItems || []).map((item: any) => {
      const priceAtOrder = Number(item.price_at_order);
      const quantity = Number(item.quantity);
      const variantName = item.product_variants?.name || '未知品項';
      if (Number.isNaN(priceAtOrder) || Number.isNaN(quantity)) { return `• ${variantName} (數量: ${item.quantity}) - 金額計算錯誤`; }
      const itemTotal = priceAtOrder * quantity;
      return `• ${variantName}\n  數量: ${quantity} × 單價: ${NumberToTextHelper.formatMoney(priceAtOrder)} = 小計: ${NumberToTextHelper.formatMoney(itemTotal)}`;
    }).join('\n\n');
    const antiFraud = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ 防詐騙提醒
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Green Health 綠健 絕對不會以任何名義，透過電話、簡訊或 Email 要求您操作 ATM、提供信用卡資訊或點擊不明連結。我們不會要求您解除分期付款或更改訂單設定。

若您接到任何可疑來電或訊息，請不要理會，並可直接透過官網客服管道與我們聯繫確認，或撥打 165 反詐騙諮詢專線。
`.trim();
    
    const seamlessSignupCTA = (!magicLink && order.user_id) ? `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ 讓下次購物更快速
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
感謝您的訂購！我們已為您保留了本次的收件資訊。
只需點擊下方連結，設定一組密碼，即可完成註冊，未來購物將能自動帶入資料！
${Deno.env.get('SITE_URL')}/storefront-module/order-success.html?order_number=${order.order_number}&signup=true&email=${encodeURIComponent(order.customer_email)}
` : "";

    const maybeMagic = magicLink ? `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔑 快速登入
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
我們偵測到此 Email 為已註冊之會員。您本次雖未登入，但訂單已自動歸戶。您可以點擊以下安全連結快速登入，查看完整訂單歷史：
${magicLink}
` : "";
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
商品小計：${NumberToTextHelper.formatMoney(order.subtotal_amount)}${order.coupon_discount > 0 ? `\n優惠折扣：-${NumberToTextHelper.formatMoney(order.coupon_discount)}` : ''}
運送費用：${NumberToTextHelper.formatMoney(order.shipping_fee)}
─────────────────────────────────
總計金額：${NumberToTextHelper.formatMoney(order.total_amount)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚚 配送資訊
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
收件人：${address.recipient_name}
聯絡電話：${address.phone_number}
配送地址：${fullAddress}
配送方式：${shippingMethod?.method_name || '未指定'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💳 付款資訊
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
付款方式：${paymentMethod?.method_name || '未指定'}
付款狀態：${order.payment_status}
${paymentMethod?.instructions ? `付款指示：\n${paymentMethod.instructions}` : ''}

${magicLink ? maybeMagic : seamlessSignupCTA}

${antiFraud}

感謝您選擇 Green Health 綠健
`.trim();
  }
  
  private async _handleInvoiceCreation(newOrder: any, invoiceOptions: any) {
    try {
      const invoiceService = new InvoiceService(this.supabaseAdmin);
      const finalInvoiceData = await invoiceService.determineInvoiceData(newOrder, invoiceOptions);
      await invoiceService.createInvoiceRecord(newOrder.id, newOrder.total_amount, finalInvoiceData);
      console.log(`[資訊] 訂單 ${newOrder.id} 的發票記錄已成功排入佇列。`);
    } catch (err: any) {
      console.error(`[嚴重] 訂單 ${newOrder.id} 已建立，但發票記錄建立失敗:`, err?.message ?? err);
    }
  }
  
  private async _ensureProfileExists(userId: string): Promise<void> {
    const { data: existingProfile, error: selectError } = await this.supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (selectError) {
        console.error(`[_ensureProfileExists] 查詢 profiles 失敗:`, selectError);
        throw selectError;
    }

    if (!existingProfile) {
      console.log(`[_ensureProfileExists] profiles 記錄不存在，為 User ID ${userId} 建立「空殼」記錄...`);
      const { error: upsertError } = await this.supabaseAdmin
        .from('profiles')
        .upsert({ 
          id: userId, 
          status: 'active',
          // 刻意不寫入 email, name 等任何會員專屬資料，保持 profiles 表的純淨性
        });

      if (upsertError) {
          console.error(`[_ensureProfileExists] 建立「空殼」profiles 記錄失敗:`, upsertError);
          throw upsertError;
      }
      console.log(`[_ensureProfileExists] 成功為 User ID ${userId} 建立「空殼」profiles 記錄。`);
    }
  }
  
  private async _findUserIdByEmail(email: string): Promise<string | null> {
    if (!email) return null;
    const lowerCaseEmail = email.toLowerCase();
    
    try {
      const { data, error } = await this.supabaseAdmin.from('users', { schema: 'auth' }).select('id').eq('email', lowerCaseEmail).single();
      if (data?.id) return data.id;
      if (error && error.code !== 'PGRST116') { 
        console.warn('[_findUserIdByEmail] 直接查詢 auth.users 返回非預期錯誤:', error);
      }
    } catch (e: any) { 
      console.warn('[_findUserIdByEmail] 直接查詢 auth.users 失敗:', e?.message ?? e);
    }
    return null;
  }

  private async _generateMagicLink(email: string): Promise<string | null> {
    try {
      const siteUrl = Deno.env.get('SITE_URL');
      if (!siteUrl) { console.warn('[MagicLink] SITE_URL 未設定, 無法產生連結。'); return null; }
      const redirectTo = `${siteUrl.replace(/\/+$/, '')}/account-module/dashboard.html`;
      const { data, error } = await this.supabaseAdmin.auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo } });
      if (error) { console.warn('[admin.generateLink] 失敗:', error); return null; }
      return data?.properties?.action_link ?? null;
    } catch (e: any) { console.warn('[generateMagicLink] 未預期錯誤:', e); return null; }
  }

  /**
   * [v46.2 新增] 組合密件副本 (BCC) 的收件者列表。
   * @returns {string[]} BCC 收件者的 Email 陣列。
   */
  private _getBccRecipients(): string[] {
    const primaryBcc = 'a896214@gmail.com'; // 固定的主要通知對象
    const additionalBcc = Deno.env.get('ORDER_MAIL_BCC'); // 從環境變數讀取的額外對象

    const recipients = [primaryBcc];
    if (additionalBcc) {
      recipients.push(additionalBcc);
    }
    
    // 使用 Set 去除重複的 Email，以防萬一
    return [...new Set(recipients)];
  }

  private _validateRequest(data: any): { valid: boolean; message?: string } {
    const required = ['cartId', 'shippingDetails', 'selectedShippingMethodId', 'selectedPaymentMethodId', 'frontendValidationSummary'];
    for (const key of required) { if (!data?.[key]) return { valid: false, message: `缺少必要參數: ${key}` }; }
    if (!data.shippingDetails.email) { return { valid: false, message: 'shippingDetails 中缺少 email' }; }
    return { valid: true };
  }

  async handleRequest(req: Request): Promise<Response> {
    console.log(`[${new Date().toISOString()}] create-order-from-cart 收到一個請求。`);
    
    const requestData = await req.json().catch(() => ({}));
    const validation = this._validateRequest(requestData);
    if (!validation.valid) {
      return new Response(JSON.stringify({ error: { message: validation.message ?? '無效請求' } }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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
        console.log(`[資訊] 請求已授權給使用者: ${userId} (匿名: ${isAnonymous})`);
      } else {
         console.warn(`[警告] 收到無效的 token。將以訪客身份繼續。`);
      }
    } 
    
    if (!userId && shippingDetails?.email) {
      const maybeExistingUserId = await this._findUserIdByEmail(shippingDetails.email);
      if (maybeExistingUserId) {
        userId = maybeExistingUserId;
        wasAutoLinked = true;
        console.log(`[資訊] 訪客 Email 匹配到已存在會員。自動將訂單歸戶至使用者: ${userId}`);
      }
    }
    
    if (userId) {
        await this._ensureProfileExists(userId);
    }

    const backendSnapshot = await this._calculateCartSummary(req, cartId, couponCode, selectedShippingMethodId);

    if (backendSnapshot.summary.total !== frontendValidationSummary.total) {
      return new Response(JSON.stringify({ error: { code: 'PRICE_MISMATCH', message: '訂單金額與當前優惠不符，請重新確認。' } }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!backendSnapshot.items?.length) {
      return new Response(JSON.stringify({ error: { message: '無法建立訂單，購物車為空。' } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: shippingMethod } = await this.supabaseAdmin.from('shipping_rates').select('*').eq('id', selectedShippingMethodId).single();
    const { data: paymentMethod } = await this.supabaseAdmin.from('payment_methods').select('*').eq('id', selectedPaymentMethodId).single();
    if (!shippingMethod || !paymentMethod) {
      return new Response(JSON.stringify({ error: { message: '結帳所需資料不完整 (運送或付款方式)。' } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: newOrder, error: orderError } = await this.supabaseAdmin.from('orders').insert({
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
    }).select().single();

    if (orderError) {
      console.error('[orders.insert] 錯誤:', orderError);
      return new Response(JSON.stringify({ error: { message: `建立訂單失敗: ${orderError.message}` } }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const orderItemsToInsert = backendSnapshot.items.map((item: any) => ({
      order_id: newOrder.id, product_variant_id: item.product_variant_id, quantity: item.quantity,
      price_at_order: item.product_variants.sale_price ?? item.product_variants.price,
    }));
    await this.supabaseAdmin.from('order_items').insert(orderItemsToInsert).throwOnError();

    const { data: finalOrderItems } = await this.supabaseAdmin.from('order_items').select('*, product_variants(name)').eq('order_id', newOrder.id);

    await Promise.allSettled([
      this.supabaseAdmin.from('carts').update({ status: 'completed' }).eq('id', cartId),
      this._handleInvoiceCreation(newOrder, invoiceOptions),
    ]);
    
    let magicLinkForMail: string | null = null;
    if (wasAutoLinked) {
        magicLinkForMail = await this._generateMagicLink(shippingDetails.email);
    }
    
    // [v46.2 核心修正] 呼叫輔助函式取得 BCC 列表
    const bccRecipients = this._getBccRecipients();

    await this.resend.emails.send({
      from: `${Deno.env.get('ORDER_MAIL_FROM_NAME') ?? 'Green Health 訂單中心'} <${Deno.env.get('ORDER_MAIL_FROM_ADDR') ?? 'sales@greenhealthtw.com.tw'}>`,
      to: [newOrder.customer_email],
      bcc: bccRecipients,
      reply_to: Deno.env.get('ORDER_MAIL_REPLY_TO') ?? 'service@greenhealthtw.com.tw',
      subject: `您的 Green Health 訂單 ${newOrder.order_number} 已確認`,
      text: this._createOrderEmailText(newOrder, finalOrderItems ?? [], shippingDetails, shippingMethod, paymentMethod, (isAnonymous && !wasAutoLinked) ? null : magicLinkForMail),
    }).catch(emailErr => {
        console.error(`[警告] 訂單 ${newOrder.order_number} 確認信發送失敗:`, emailErr);
    });

    return new Response(JSON.stringify({
        success: true,
        orderNumber: newOrder.order_number,
        orderDetails: { 
            order: newOrder, 
            items: finalOrderItems ?? [],
            address: shippingDetails,
            shippingMethod,
            paymentMethod
        }
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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
    console.error('[create-order-from-cart] 未攔截的錯誤:', error?.message, error?.stack);
    return new Response(
      JSON.stringify({ error: { message: `[create-order-from-cart] ${error?.message ?? 'Unknown error'}` } }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});