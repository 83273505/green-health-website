// ==============================================================================
// 檔案路徑: supabase/functions/create-order-from-cart/index.ts
// 版本: v43.0 - 滴水不漏：Profiles 完整性修正
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Unified Intelligent Order Creation Function (統一智慧型訂單建立函式)
 * @description 最終版訂單建立函式。能智慧處理三種情境：
 *              1. 已登入會員 (透過 JWT)
 *              2. 忘記登入的會員 (透過 Email 後端查詢自動歸戶)
 *              3. 全新訪客 (建立純訪客訂單)
 *              並採用“權限透傳”模式優雅地處理 RLS，整合 Resend 寄送郵件。
 * @version v43.0
 * 
 * @update v43.0 - [FOREIGN KEY INTEGRITY FIX]
 * 1. [核心修復] 解決了因 Supabase 觸發器未在匿名使用者創建時可靠同步 profiles 
 *          記錄，導致的 orders 表外鍵約束違例 (錯誤碼 23503)。
 * 2. [新增方法] 引入了 _ensureProfileExists 函式，在建立訂單前，強制檢查 
 *          public.profiles 表中是否存在對應的 user_id，若無則立即創建一筆基礎記錄。
 * 3. [策略升級] 將資料同步模式從「被動依賴觸發器」升級為「主動確保一致性」，提升系統健壯性。
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
        console.error('[RLS Check] _calculateCartSummary query failed:', cartItemsError);
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
    const fullAddress = `${address.postal_code || ''} address.city || ''}${address.district || ''}${address.street_address || ''}`.trim();
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
  
  /**
   * [v43.0 新增] 核心修復方法：確保 public.profiles 記錄存在
   * @description 解決匿名使用者建立時，profiles 觸發器不可靠的問題。
   */
  private async _ensureProfileExists(userId: string): Promise<void> {
    // 1. 嘗試查詢 profiles 記錄
    const { data: existingProfile, error: selectError } = await this.supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (selectError && selectError.code !== 'PGRST116') {
        console.error(`[_ensureProfileExists] 查詢 profiles 失敗:`, selectError);
        throw selectError;
    }

    // 2. 如果 profiles 記錄不存在，則手動創建
    if (!existingProfile) {
      console.log(`[_ensureProfileExists] profiles 記錄不存在，為 User ID ${userId} 創建基礎資料...`);
      // 這裡使用 upsert 策略，確保即使在極端情況下也不會重複插入
      const { error: upsertError } = await this.supabaseAdmin
        .from('profiles')
        .upsert({ 
          id: userId, 
          status: 'active', 
          // 由於 email 是從 auth.users 傳遞而來，此處不寫入，保持其預設值或讓觸發器處理 (但我們不依賴觸發器)
          // 為了安全，只寫入最少的必要欄位
        });

      if (upsertError) {
          console.error(`[_ensureProfileExists] 創建基礎 profiles 記錄失敗:`, upsertError);
          throw upsertError;
      }
      console.log(`[_ensureProfileExists] 成功為 User ID ${userId} 創建 profiles 基礎記錄。`);
    }
  }
  
  /**
   * [v41.0 升級] 非破壞性更新，修復 API 棄用問題
   */
  private async _findUserIdByEmail(email: string): Promise<string | null> {
    if (!email) return null;
    const lowerCaseEmail = email.toLowerCase();
    
    // [v41.0 新增] 優先使用直接查詢 auth.users 表的現代化、高效能方法
    try {
      const { data, error } = await this.supabaseAdmin.from('users', { schema: 'auth' }).select('id').eq('email', lowerCaseEmail).single();
      if (data?.id) return data.id;
      // 'PGRST116' 表示 'single()' 找不到對應資料列，這是正常情況，不需記錄警告
      if (error && error.code !== 'PGRST116') { 
        console.warn('[_findUserIdByEmail] direct auth.users 查詢返回非預期錯誤:', error);
      }
    } catch (e: any) { 
      console.warn('[_findUserIdByEmail] direct auth.users 查詢失敗:', e?.message ?? e);
    }

    // ==========================================================================
    // 歷史封存: v39.2 及更早版本的 API 調用方法 (程式碼已省略，詳見 v41.0 原始檔)
    // ==========================================================================
    return null;
  }

  private async _generateMagicLink(email: string): Promise<string | null> {
    try {
      const siteUrl = Deno.env.get('SITE_URL');
      if (!siteUrl) { console.warn('[MagicLink] SITE_URL is not set, cannot generate link.'); return null; }
      const redirectTo = `${siteUrl.replace(/\/+$/, '')}/account-module/dashboard.html`;
      const { data, error } = await this.supabaseAdmin.auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo } });
      if (error) { console.warn('[admin.generateLink] failed:', error); return null; }
      return data?.properties?.action_link ?? null;
    } catch (e: any) { console.warn('[generateMagicLink] unexpected:', e); return null; }
  }

  private _validateRequest(data: any): { valid: boolean; message?: string } {
    const required = ['cartId', 'shippingDetails', 'selectedShippingMethodId', 'selectedPaymentMethodId', 'frontendValidationSummary'];
    for (const key of required) { if (!data?.[key]) return { valid: false, message: `缺少必要參數: ${key}` }; }
    if (!data.shippingDetails.email) { return { valid: false, message: 'shippingDetails 中缺少 email' }; }
    return { valid: true };
  }

  async handleRequest(req: Request): Promise<Response> {
    console.log(`[${new Date().toISOString()}] create-order-from-cart received a request.`);
    
    const requestData = await req.json().catch(() => ({}));
    const validation = this._validateRequest(requestData);
    if (!validation.valid) {
      return new Response(JSON.stringify({ error: { message: validation.message ?? '無效請求' } }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { cartId, shippingDetails, selectedShippingMethodId, selectedPaymentMethodId, frontendValidationSummary, invoiceOptions } = requestData;
    
    let userId: string | null = null;
    let wasAutoLinked = false;

    // --- 1. 識別使用者身份 ---
    const authHeader = req.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await this.supabaseAdmin.auth.getUser(token);
      if (user) {
        userId = user.id;
        console.log(`[INFO] Request authorized for member: ${userId}`);
        // 由於我們接下來會執行 _ensureProfileExists，此處更新 name 的操作保留
        await this.supabaseAdmin.from('profiles').update({ name: shippingDetails.recipient_name ?? null }).eq('id', userId);
      } else {
         console.warn(`[WARN] Invalid token received. Proceeding as guest.`);
      }
    } 
    
    // --- 2. 智慧歸戶 (如果未登入) ---
    if (!userId && shippingDetails?.email) {
      const maybeExistingUserId = await this._findUserIdByEmail(shippingDetails.email);
      if (maybeExistingUserId) {
        userId = maybeExistingUserId;
        wasAutoLinked = true;
        console.log(`[INFO] Guest email matches existing member. Auto-linking order to user: ${userId}`);
      }
    }
    
    // [v43.0 核心修復] 確保 profiles 記錄存在，解決外鍵問題
    // 該函式會處理匿名使用者、剛社交登入但 profiles 尚未建立的邊界情境
    if (userId) {
        await this._ensureProfileExists(userId);
    }
    // 註：如果沒有 userId，則 orders.user_id 將為 NULL，不違反外鍵約束。

    // --- 3. 執行金額權威比對 ---
    const backendSnapshot = await this._calculateCartSummary(req, cartId, frontendValidationSummary.couponCode, selectedShippingMethodId);

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

    // --- 4. 寫入訂單核心資料 ---
    const { data: newOrder, error: orderError } = await this.supabaseAdmin.from('orders').insert({
      user_id: userId, status: 'pending_payment', total_amount: backendSnapshot.summary.total,
      subtotal_amount: backendSnapshot.summary.subtotal, coupon_discount: backendSnapshot.summary.couponDiscount,
      shipping_fee: backendSnapshot.summary.shippingFee, shipping_address_snapshot: shippingDetails,
      payment_method: paymentMethod.method_name, shipping_method_id: selectedShippingMethodId,
      payment_status: 'pending', customer_email: shippingDetails.email, customer_name: shippingDetails.recipient_name,
    }).select().single();
    if (orderError) {
      console.error('[orders.insert] error:', orderError);
      return new Response(JSON.stringify({ error: { message: '建立訂單失敗。' } }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const orderItemsToInsert = backendSnapshot.items.map((item: any) => ({
      order_id: newOrder.id, product_variant_id: item.product_variant_id, quantity: item.quantity,
      price_at_order: item.product_variants.sale_price ?? item.product_variants.price,
    }));
    await this.supabaseAdmin.from('order_items').insert(orderItemsToInsert).throwOnError();

    const { data: finalOrderItems } = await this.supabaseAdmin.from('order_items').select('*, product_variants(name)').eq('order_id', newOrder.id);

    // --- 5. 清理與後續非同步處理 ---
    await Promise.allSettled([
      this.supabaseAdmin.from('carts').update({ status: 'completed' }).eq('id', cartId),
      this._handleInvoiceCreation(newOrder.id, userId, backendSnapshot.summary.total, invoiceOptions),
    ]);
    
    let magicLinkForMail: string | null = null;
    if (wasAutoLinked) {
        magicLinkForMail = await this._generateMagicLink(shippingDetails.email);
    }
    
    await this.resend.emails.send({
      from: `${Deno.env.get('ORDER_MAIL_FROM_NAME') ?? 'Green Health 訂單中心'} <${Deno.env.get('ORDER_MAIL_FROM_ADDR') ?? 'sales@greenhealthtw.com.tw'}>`,
      to: [newOrder.customer_email],
      ...(Deno.env.get('ORDER_MAIL_BCC') ? { bcc: [Deno.env.get('ORDER_MAIL_BCC')] } : {}),
      reply_to: Deno.env.get('ORDER_MAIL_REPLY_TO') ?? 'service@greenhealthtw.com.tw',
      subject: `您的 Green Health 訂單 ${newOrder.order_number} 已確認`,
      text: this._createOrderEmailText(newOrder, finalOrderItems ?? [], shippingDetails, shippingMethod, paymentMethod, magicLinkForMail),
    }).catch(emailErr => {
        console.error(`[WARNING] 訂單 ${newOrder.order_number} 確認信發送失敗:`, emailErr);
    });

    return new Response(JSON.stringify({
        success: true,
        orderNumber: newOrder.order_number,
        orderDetails: { order: newOrder, items: finalOrderItems ?? [] }
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
    console.error('[create-order-from-cart] 未攔截錯誤:', error?.message, error?.stack);
    return new Response(
      JSON.stringify({ error: { message: `[create-order-from-cart] ${error?.message ?? 'Unknown error'}` } }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});