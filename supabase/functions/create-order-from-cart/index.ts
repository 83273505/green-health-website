// ==============================================================================
// 檔案路徑: supabase/functions/create-order-from-cart/index.ts
// 版本: v35.3 - 安全与合规化流程整合 (最终 100% 完整版)
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Unified Context-Aware Order Creation Function (統一情境感知訂單建立函式)
 * @description 處理匿名訪客、Email/密碼會員、Google OAuth 會員的統一訂單建立請求。
 * @version v35.3
 * @see storefront-module/js/modules/checkout/checkout.js (v35.3)
 * 
 * @update v35.3 - [COMPLIANCE & FINALIZATION]
 * 1. [修正] 在 _getOrCreateUser 函式中，將 createUser 的 email_confirm 參數設為 false，
 *          以符合 Supabase 標準的雙重確認註冊流程，並由 Supabase 自動發送驗證信。
 * 2. [新增] 在建立新的 profiles 記錄時，增加 status: 'pending_verification' 欄位，
 *          用於標記透過結帳流程建立但尚未驗證信箱的帳號。
 * 3. [整合] 此版本包含 v35.0 的所有安全與雙分支驗證邏輯。
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

  /**
   * [v35.3 升級] 智慧型使用者處理：取得或建立使用者，並實現合規化註冊
   */
  private async _getOrCreateUser(customerInfo: any, shippingDetails: any) {
    const { email, password } = customerInfo;
    const { recipient_name } = shippingDetails;

    // 1. 檢查 Email 是否已存在
    const { data: { users }, error: listError } = await this.supabaseAdmin.auth.admin.listUsers({ email });
    if (listError) throw new Error(`查詢使用者時發生錯誤: ${listError.message}`);
    
    // --- 情境 B: 使用者已存在 ---
    if (users && users.length > 0) {
      console.log(`[INFO] 找到已存在的使用者: ${email}`);
      const existingUser = users[0];

      // 帳號型態保護檢查
      const { data: identity } = await this.supabaseAdmin
        .from('identities')
        .select('provider')
        .eq('user_id', existingUser.id)
        .single();
      
      if (identity && identity.provider !== 'email') {
          throw { 
              status: 409, // 409 Conflict
              code: 'ACCOUNT_CONFLICT_OAUTH',
              message: `此 Email (${email}) 已透過 ${identity.provider} 註冊，請先登入後再結帳。` 
          };
      }
      
      // 更新 profile 名稱並回傳使用者
      await this.supabaseAdmin.from('profiles').update({ name: recipient_name }).eq('id', existingUser.id);
      return existingUser;
    }

    // --- 情境 A: 使用者不存在，建立新帳號 ---
    console.log(`[INFO] 建立新使用者 (待驗證): ${email}`);
    const { data: newUser, error: createError } = await this.supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: false, // [v35.3 核心修正] 設為 false，由 Supabase 自動發送驗證信
    });

    if (createError || !newUser.user) throw new Error(`建立新使用者時發生錯誤: ${createError?.message}`);
    
    // 使用 .insert()，因為已停用資料庫觸發器
    await this.supabaseAdmin.from('profiles').insert({
      id: newUser.user.id,
      email: email,
      name: recipient_name,
      is_profile_complete: true,
      status: 'pending_verification' // [v35.3 新增] 標記帳號為待驗證
    }).throwOnError();

    return newUser.user;
  }
  
  /**
   * [私有] 後端購物車金額計算核心引擎
   */
  private async _calculateCartSummary(cartId: string, couponCode?: string, shippingMethodId?: string) {
    const { data: cartItems, error: cartItemsError } = await this.supabaseAdmin.from('cart_items').select(`*, product_variants(name, price, sale_price, products(image_url))`).eq('cart_id', cartId);
    if (cartItemsError) throw cartItemsError;
    if (!cartItems || cartItems.length === 0) {
      return { items: [], itemCount: 0, summary: { subtotal: 0, couponDiscount: 0, shippingFee: 0, total: 0 }, appliedCoupon: null };
    }
    const subtotal = cartItems.reduce((sum, item) => sum + Math.round((item.product_variants.sale_price ?? item.product_variants.price) * item.quantity), 0);
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
      summary: { subtotal, couponDiscount, shippingFee, total: total < 0 ? 0 : total },
      appliedCoupon,
    };
  }

  /**
   * [私有] 產生訂單確認郵件的純文字內容
   */
  private _createOrderEmailText(order: any, orderItems: any[], address: any, shippingMethod: any, paymentMethod: any): string {
    const fullAddress = `${address.postal_code || ''} ${address.city || ''}${address.district || ''}${address.street_address || ''}`.trim();
    const itemsList = orderItems.map(item => {
      const priceAtOrder = parseFloat(item.price_at_order);
      const quantity = parseInt(item.quantity, 10);
      const variantName = item.product_variants?.name || '未知品項';
      if (isNaN(priceAtOrder) || isNaN(quantity)) {
        return `• ${variantName} (數量: ${item.quantity}) - 金額計算錯誤`;
      }
      const itemTotal = priceAtOrder * quantity;
      return `• ${variantName}\n  數量: ${quantity} × 單價: ${NumberToTextHelper.formatMoney(priceAtOrder)} = 小計: ${NumberToTextHelper.formatMoney(itemTotal)}`;
    }).join('\n\n');
    const antiFraudWarning = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ 防詐騙提醒
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Green Health 綠健 絕對不會以任何名義，透過電話、簡訊或 Email 要求您操作 ATM、提供信用卡資訊或點擊不明連結。我們不會要求您解除分期付款或更改訂單設定。

若您接到任何可疑來電或訊息，請不要理會，並可直接透過官網客服管道與我們聯繫確認，或撥打 165 反詐騙諮詢專線。
    `.trim();
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
商品小計：${NumberToTextHelper.formatMoney(order.subtotal_amount)}${order.coupon_discount > 0 ? `
優惠折扣：-${NumberToTextHelper.formatMoney(order.coupon_discount)}` : ''}
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

${antiFraudWarning}

感謝您選擇 Green Health 團隊 敬上
    `.trim();
  }
  
  /**
   * [私有] 處理發票記錄的建立，並隔離錯誤
   */
  private async _handleInvoiceCreation(orderId: string, userId: string, totalAmount: number, invoiceOptions: any) {
    try {
      const invoiceService = new InvoiceService(this.supabaseAdmin);
      const finalInvoiceData = await invoiceService.determineInvoiceData(userId, invoiceOptions);
      await invoiceService.createInvoiceRecord(orderId, totalAmount, finalInvoiceData);
      console.log(`[INFO] 訂單 ${orderId} 的發票記錄已成功排入佇列。`);
    } catch (invoiceError) {
      console.error(
        `[CRITICAL] 訂單 ${orderId} 已成功建立，但其發票記錄建立失敗:`, 
        invoiceError.message
      );
    }
  }

  /**
   * [v35.0] 驗證請求資料，能處理兩種 payload
   */
  private _validateRequest(data: any, isAuthed: boolean): { valid: boolean; message: string } {
    const baseFields = ['cartId', 'shippingDetails', 'selectedShippingMethodId', 'selectedPaymentMethodId', 'frontendValidationSummary'];
    if (isAuthed) {
    } else {
        baseFields.push('customerInfo');
    }
    for (const field of baseFields) {
      if (!data[field]) {
        return { valid: false, message: `請求中缺少必要的參數: ${field}` };
      }
    }
    if (!isAuthed && (!data.customerInfo.email || !data.customerInfo.password)) {
      return { valid: false, message: 'customerInfo 中缺少 email 或 password' };
    }
    return { valid: true, message: '驗證通過' };
  }

  /**
   * [v35.0] 主請求處理方法，實現雙分支驗證
   */
  async handleRequest(req: Request) {
    const requestData = await req.json();
    const authHeader = req.headers.get('Authorization');
    const isAuthedUser = !!(authHeader && authHeader.startsWith('Bearer '));
    
    const validation = this._validateRequest(requestData, isAuthedUser);
    if (!validation.valid) {
        return new Response(JSON.stringify({ error: { message: validation.message } }), 
            { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
    const { cartId, customerInfo, shippingDetails, selectedShippingMethodId, selectedPaymentMethodId, frontendValidationSummary, invoiceOptions } = requestData;

    let user;

    if (isAuthedUser) {
        console.log('[INFO] 處理已登入使用者請求...');
        const token = authHeader.replace('Bearer ', '');
        const { data: { user: authedUser }, error: userError } = await this.supabaseAdmin.auth.getUser(token);
        if (userError || !authedUser) {
            return new Response(JSON.stringify({ error: { message: '無效的 Token 或使用者不存在。' } }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        user = authedUser;
        await this.supabaseAdmin.from('profiles').update({ name: shippingDetails.recipient_name }).eq('id', user.id);
    } else {
        console.log('[INFO] 處理訪客請求...');
        user = await this._getOrCreateUser(customerInfo, shippingDetails);
    }
    
    const backendSnapshot = await this._calculateCartSummary(cartId, frontendValidationSummary.couponCode, selectedShippingMethodId);
    if (backendSnapshot.summary.total !== frontendValidationSummary.total) {
      return new Response(JSON.stringify({ error: { code: 'PRICE_MISMATCH', message: '訂單金額與當前優惠不符，請重新確認。' } }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!backendSnapshot.items || backendSnapshot.items.length === 0) throw new Error('無法建立訂單，因為購物車是空的。');
    
    const address = shippingDetails;
    const { data: shippingMethod } = await this.supabaseAdmin.from('shipping_rates').select('*').eq('id', selectedShippingMethodId).single();
    const { data: paymentMethod } = await this.supabaseAdmin.from('payment_methods').select('*').eq('id', selectedPaymentMethodId).single();
    if (!shippingMethod || !paymentMethod) throw new Error('結帳所需資料不完整(運送或付款方式)。');

    const { data: newOrder, error: orderError } = await this.supabaseAdmin.from('orders').insert({
      user_id: user.id, status: 'pending_payment', total_amount: backendSnapshot.summary.total,
      subtotal_amount: backendSnapshot.summary.subtotal, coupon_discount: backendSnapshot.summary.couponDiscount,
      shipping_fee: backendSnapshot.summary.shippingFee, shipping_address_snapshot: address,
      payment_method: paymentMethod.method_name, shipping_method_id: selectedShippingMethodId,
      payment_status: 'pending',
      customer_email: user.email || customerInfo.email,
      customer_name: address.recipient_name
    }).select().single();
    if (orderError) throw orderError;

    const orderItemsToInsert = backendSnapshot.items.map(item => ({
      order_id: newOrder.id, product_variant_id: item.product_variant_id,
      quantity: item.quantity, price_at_order: item.product_variants.sale_price ?? item.product_variants.price,
    }));
    await this.supabaseAdmin.from('order_items').insert(orderItemsToInsert).throwOnError();
    
    const { data: finalOrderItems } = await this.supabaseAdmin.from('order_items').select('*, product_variants(name)').eq('order_id', newOrder.id);
    
    await Promise.allSettled([
        this.supabaseAdmin.from('carts').update({ status: 'completed' }).eq('id', cartId),
        this._handleInvoiceCreation(newOrder.id, user.id, backendSnapshot.summary.total, invoiceOptions)
    ]);
    
    try {
      const emailText = this._createOrderEmailText(newOrder, finalOrderItems || [], address, shippingMethod, paymentMethod);
      await this.resend.emails.send({
        from: 'Green Health 訂單中心 <sales@greenhealthtw.com.tw>',
        to: [newOrder.customer_email], 
        bcc: ['a896214@gmail.com'],
        reply_to: 'service@greenhealthtw.com.tw',
        subject: `您的 Green Health 訂單 ${newOrder.order_number} 已確認`,
        text: emailText,
      });
    } catch (emailError) {
      console.error(`[WARNING] 訂單 ${newOrder.order_number} 的確認郵件發送失敗:`, emailError);
    }
    
    return new Response(JSON.stringify({
      success: true,
      orderNumber: newOrder.order_number,
      orderDetails: { order: newOrder, items: finalOrderItems || [], address, shippingMethod, paymentMethod }
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
  } catch (error) {
    console.error('[create-order-from-cart] 函式最外層錯誤:', error.message, error.stack);
    if (error.status && error.code) {
        return new Response(JSON.stringify({ error: { code: error.code, message: error.message } }), 
            { status: error.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
    return new Response(JSON.stringify({ error: { message: `[create-order-from-cart]: ${error.message}` } }), 
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
})