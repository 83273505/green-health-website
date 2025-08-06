// ==============================================================================
// 檔案路徑: supabase/functions/create-order-from-cart/index.ts
// ------------------------------------------------------------------------------
// 【此為完整重構版，可直接覆蓋】
// ==============================================================================

import { createClient, Resend } from '../_shared/deps.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { NumberToTextHelper } from '../_shared/utils/NumberToTextHelper.ts'
import { InvoiceService } from '../_shared/services/InvoiceService.ts'

/**
 * @class CreateOrderHandler
 * @description 將建立訂單的所有相關邏輯封裝在一個類別中，
 *              以提升程式碼的可讀性、可維護性和可測試性。
 */
class CreateOrderHandler {
  private supabaseAdmin: ReturnType<typeof createClient>;
  private resend: Resend;

  // 在建構函式中初始化所有需要的客戶端實例
  constructor() {
    this.supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '', 
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', 
      { auth: { persistSession: false } }
    );
    this.resend = new Resend(Deno.env.get('RESEND_API_KEY')!);
  }

  // --- 私有輔助方法 (Private Helper Methods) ---

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
      const variantName = item.product_variants?.name || '未知品项';
      if (isNaN(priceAtOrder) || isNaN(quantity)) {
        return `• ${variantName} (数量: ${item.quantity}) - 金额计算错误`;
      }
      const itemTotal = priceAtOrder * quantity;
      return `• ${variantName}\n  数量: ${quantity} × 单价: ${NumberToTextHelper.formatMoney(priceAtOrder)} = 小计: ${NumberToTextHelper.formatMoney(itemTotal)}`;
    }).join('\n\n');
    const antiFraudWarning = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ 防詐騙提醒
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Green Health 絕對不會以任何名義，透過電話、簡訊或 Email 要求您操作 ATM、提供信用卡資訊或點擊不明連結。我們不會要求您解除分期付款或更改訂單設定。

若您接到任何可疑來電或訊息，請不要理會，並可直接透過官網客服管道與我們聯繫確認，或撥打 165 反詐騙諮詢專線。
    `.trim();
    return `
Green Health 訂單確認

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

感謝您選擇 Green Health！我們將盡快為您處理訂單。

此為系統自動發送郵件，請勿直接回覆。
如有任何問題，請至官網客服中心與我們聯繫。

Green Health 團隊 敬上
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
   * [私有] 驗證傳入的請求資料是否完整
   */
  private _validateRequest(data: any): { valid: boolean; message: string } {
    const requiredFields = ['cartId', 'selectedAddressId', 'selectedShippingMethodId', 'selectedPaymentMethodId', 'frontendValidationSummary'];
    for (const field of requiredFields) {
      if (!data[field]) {
        return { valid: false, message: `請求中缺少必要的參數: ${field}` };
      }
    }
    return { valid: true, message: '驗證通過' };
  }

  /**
   * [公開] 主請求處理方法
   */
  async handleRequest(req: Request) {
    const requestData = await req.json();
    const validation = this._validateRequest(requestData);
    if (!validation.valid) {
        return new Response(JSON.stringify({ error: validation.message }), 
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
    const { cartId, selectedAddressId, selectedShippingMethodId, selectedPaymentMethodId, frontendValidationSummary, invoiceOptions } = requestData;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('缺少授權標頭。');
    const { data: { user } } = await this.supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''));
    if (!user) throw new Error('使用者未登入或授權無效。');

    const backendSnapshot = await this._calculateCartSummary(cartId, frontendValidationSummary.couponCode, selectedShippingMethodId);
    if (backendSnapshot.summary.total !== frontendValidationSummary.total) {
      return new Response(JSON.stringify({ 
        error: { code: 'PRICE_MISMATCH', message: '訂單金額與當前優惠不符，請重新確認。' } 
      }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!backendSnapshot.items || backendSnapshot.items.length === 0) throw new Error('無法建立訂單，因為購物車是空的。');
    
    const { data: address } = await this.supabaseAdmin.from('addresses').select('*').eq('id', selectedAddressId).single();
    const { data: shippingMethod } = await this.supabaseAdmin.from('shipping_rates').select('*').eq('id', selectedShippingMethodId).single();
    const { data: paymentMethod } = await this.supabaseAdmin.from('payment_methods').select('*').eq('id', selectedPaymentMethodId).single();
    if (!address || !shippingMethod || !paymentMethod) throw new Error('結帳所需資料不完整(地址、運送或付款方式)。');

    const { data: newOrder, error: orderError } = await this.supabaseAdmin.from('orders').insert({
      user_id: user.id, status: 'pending_payment', total_amount: backendSnapshot.summary.total,
      subtotal_amount: backendSnapshot.summary.subtotal, coupon_discount: backendSnapshot.summary.couponDiscount,
      shipping_fee: backendSnapshot.summary.shippingFee, shipping_address_snapshot: address,
      payment_method: paymentMethod.method_name, shipping_method_id: selectedShippingMethodId,
      payment_status: 'pending'
    }).select().single();
    if (orderError) throw orderError;

    const orderItemsToInsert = backendSnapshot.items.map(item => ({
      order_id: newOrder.id, product_variant_id: item.product_variant_id,
      quantity: item.quantity, price_at_order: item.product_variants.sale_price ?? item.product_variants.price,
    }));
    await this.supabaseAdmin.from('order_items').insert(orderItemsToInsert).throwOnError();
    
    await Promise.allSettled([
        this.supabaseAdmin.from('carts').update({ status: 'completed' }).eq('id', cartId),
        this._handleInvoiceCreation(newOrder.id, user.id, backendSnapshot.summary.total, invoiceOptions)
    ]);
    
    const { data: finalOrderItems } = await this.supabaseAdmin
        .from('order_items').select('*, product_variants(name)').eq('order_id', newOrder.id);

    try {
      const emailText = this._createOrderEmailText(newOrder, finalOrderItems || [], address, shippingMethod, paymentMethod);
      await this.resend.emails.send({
        from: 'Green Health 訂單中心 <sales@greenhealthtw.com.tw>',
        to: [user.email], 
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

// 函式入口點
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') { 
    return new Response('ok', { headers: corsHeaders }); 
  }
  try {
    const handler = new CreateOrderHandler();
    // 使用 .bind(handler) 確保 handler 內部的方法在呼叫時，'this' 的指向是正確的 handler 實例
    return await handler.handleRequest.bind(handler)(req);
  } catch (error) {
    console.error('[create-order-from-cart] 函式最外層錯誤:', error.message, error.stack);
    return new Response(JSON.stringify({ 
      error: `[create-order-from-cart]: ${error.message}` 
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
})