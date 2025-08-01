// 檔案路徑: supabase/functions/_shared/summary-calculator.ts (New Shared Module)

/**
 * @file 共享的購物車費用計算模組
 * @description 這是整個後端系統中，唯一負責計算購物車費用的權威來源。
 *              所有需要計算費用的 Edge Function 都必須 import 並呼叫此函式。
 */

/**
 * [核心計算引擎] 根據傳入的參數，權威地計算購物車的完整費用摘要。
 * @param supabase - Supabase 的管理員權限客戶端
 * @param cartId - 要計算的購物車 ID
 * @param couponCode - (可選) 使用者嘗試套用的折扣碼
 * @param shippingMethodId - (可選) 使用者選擇的運送方式 ID
 * @returns {Promise<object>} 一個包含完整購物車快照的物件
 */
export async function calculateCartSummary(supabase, cartId, couponCode, shippingMethodId) {
    // 步驟 1: 獲取購物車內所有項目及其關聯的商品價格
    const { data: cartItems, error: cartItemsError } = await supabase
        .from('cart_items')
        .select(`*, product_variants!inner(price, sale_price)`) // 使用 !inner 確保只計算有效的商品
        .eq('cart_id', cartId);
        
    if (cartItemsError) throw cartItemsError;

    // 如果購物車是空的，直接回傳一個初始化的空狀態物件
    if (!cartItems || cartItems.length === 0) {
        return {
            items: [],
            itemCount: 0,
            summary: { subtotal: 0, couponDiscount: 0, shippingFee: 0, total: 0 },
            appliedCoupon: null,
        };
    }

    // 步驟 2: 計算商品小計 (Subtotal)
    const subtotal = cartItems.reduce((sum, item) => {
        const price = item.product_variants.sale_price ?? item.product_variants.price;
        const itemTotal = price * item.quantity;
        return sum + Math.round(itemTotal);
    }, 0);
    
    // 步驟 3: 計算折扣 (Discount)
    let couponDiscount = 0;
    let appliedCoupon = null;
    if (couponCode) {
        const { data: coupon } = await supabase.from('coupons').select('*').eq('code', couponCode).eq('is_active', true).single();
        if (coupon && subtotal >= coupon.min_purchase_amount) {
            if (coupon.discount_type === 'PERCENTAGE' && coupon.discount_percentage) {
                couponDiscount = Math.round(subtotal * (coupon.discount_percentage / 100));
            } else if (coupon.discount_type === 'FIXED_AMOUNT' && coupon.discount_amount) {
                couponDiscount = Math.round(coupon.discount_amount);
            }
            appliedCoupon = { code: coupon.code, discountAmount: couponDiscount };
        }
    }

    // 步驟 4: 計算運費 (Shipping Fee)
    let shippingFee = 0;
    const subtotalAfterDiscount = subtotal - couponDiscount;
    if (shippingMethodId) {
        const { data: shippingRate } = await supabase.from('shipping_rates').select('*').eq('id', shippingMethodId).eq('is_active', true).single();
        if (shippingRate && (!shippingRate.free_shipping_threshold || subtotalAfterDiscount < shippingRate.free_shipping_threshold)) {
            shippingFee = Math.round(shippingRate.rate);
        }
    }

    // 步驟 5: 計算最終總計 (Total)
    const total = subtotal - couponDiscount + shippingFee;
    
    // 步驟 6: 回傳一個包含所有計算結果的完整「購物車快照」物件
    return {
        items: cartItems,
        itemCount: cartItems.reduce((sum, item) => sum + item.quantity, 0),
        summary: { 
            subtotal, 
            couponDiscount, 
            shippingFee, 
            total: total < 0 ? 0 : total 
        },
        appliedCoupon,
    };
}