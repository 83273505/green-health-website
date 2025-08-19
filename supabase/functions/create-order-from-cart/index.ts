// ==============================================================================
// 檔案路徑: supabase/functions/create-order-from-cart/index.ts
// 版本: v38.1 - 保留會員便利性的統一結帳流程 (最終完整版)
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Unified Context-Aware Order Creation Function (統一情境感知訂單建立函式)
 * @description 最終版訂單建立函式。能智慧處理已登入會員和匿名訪客的請求，
 *              並徹底分離了交易與註冊的邏輯。
 * @version v38.1
 * @see storefront-module/js/modules/checkout/checkout.js (v38.1)
 * 
 * @update v38.1 - [MAJOR REFACTOR - SIMPLIFICATION]
 * 1. [移除] 徹底刪除了 _getOrCreateUser 函式以及所有與建立使用者、註冊相關的邏輯。
 * 2. [重構] handleRequest 函式，保留雙分支驗證，但職責更清晰：
 *          - 已登入會員：驗證 token，建立關聯 user_id 的訂單，並更新 profile。
 *          - 匿名訪客：直接建立 user_id 為 NULL 的訂單。
 * 3. [簡化] _validateRequest 函式，以適應不再包含註冊資訊的 payload。
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
  
  // --- 輔助函式 (維持不變) ---

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
  
  private async _handleInvoiceCreation(orderId: string, userId: string | null, totalAmount: number, invoiceOptions: any) {
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

  private _validateRequest(data: any): { valid: boolean; message: string } {
    const requiredFields = ['cartId', 'shippingDetails', 'selectedShippingMethodId', 'selectedPaymentMethodId', 'frontendValidationSummary'];
    for (const field of requiredFields) {
      if (!data[field]) {
        return { valid: false, message: `請求中缺少必要的參數: ${field}` };
      }
    }
    if (!data.shippingDetails.email) {
      return { valid: false, message: 'shippingDetails 中缺少 email' };
    }
    return { valid: true, message: '驗證通過' };
  }

  // --- 主請求處理函式 ---

  async handleRequest(req: Request) {
    const requestData = await req.json();
    const validation = this._validateRequest(requestData);
    if (!validation.valid) {
        return new Response(JSON.stringify({ error: { message: validation.message } }), 
            { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
    const { cartId, shippingDetails, selectedShippingMethodId, selectedPaymentMethodId, frontendValidationSummary, invoiceOptions } = requestData;

    let userId = null;
    const authHeader = req.headers.get('Authorization');

    if (authHeader && authHeader.startsWith('Bearer ')) {
        // --- 分支一: 已登入會員流程 ---
        console.log('[INFO] 處理已登入使用者請求...');
        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: userError } = await this.supabaseAdmin.auth.getUser(token);
        
        if (userError || !user) {
            return new Response(JSON.stringify({ error: { message: '無效的 Token 或使用者不存在。' } }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        userId = user.id;
        // 同步最新的收件人姓名到 profile
        await this.supabaseAdmin.from('profiles').update({ name: shippingDetails.recipient_name }).eq('id', userId);
        console.log(`[INFO] 已為會員 ${userId} 更新 profile 名稱。`);
    } else {
        // --- 分支二: 匿名訪客流程 ---
        console.log('[INFO] 處理匿名訪客請求...');
        // userId 保持為 null
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
      user_id: userId, // <-- 如果是訪客，這裡會是 null
      status: 'pending_payment', 
      total_amount: backendSnapshot.summary.total,
      subtotal_amount: backendSnapshot.summary.subtotal, 
      coupon_discount: backendSnapshot.summary.couponDiscount,
      shipping_fee: backendSnapshot.summary.shippingFee, 
      shipping_address_snapshot: address,
      payment_method: paymentMethod.method_name, 
      shipping_method_id: selectedShippingMethodId,
      payment_status: 'pending',
      customer_email: address.email, // <-- 資料來源統一為 shippingDetails
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
        this._handleInvoiceCreation(newOrder.id, userId, backendSnapshot.summary.total, invoiceOptions)
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
    return new Response(JSON.stringify({ 
      error: { message: `[create-order-from-cart]: ${error.message}` } 
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
})