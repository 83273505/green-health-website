// ==============================================================================
// 檔案路徑: supabase/functions/recalculate-cart/index.ts
// 版本: v42.0 - 活水行動 v2.0 (撥亂反正)
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Unified Cart Management Function (統一購物車管理函式)
 * @description 「活水行動」v2.0 修正版。此函式恢復了其雙重職責：
 *              1. 處理購物車的增、刪、改 (actions) 等寫入操作。
 *              2. 在操作完成後，對最新的購物車狀態進行權威計算並回傳快照。
 * 
 * @architectural_notes
 * 1.  [功能恢復 v42.0] 重新植入了來自 v32.4 版本的 actions 處理邏輯，
 *                   修復了「加入購物車」功能失效的嚴重回歸錯誤。
 * 2.  [職責複合] 此函式現在既是寫入端點 (若有 actions)，也是唯讀端點，
 *                統一處理所有來自 CartService 的請求。
 * 3.  [保留 RLS 升級] 核心計算引擎 calculateCartSummary 依然使用 v41.0 的
 *                   最新版本，保留了 RLS 權限透傳的架構優勢。
 */

import { createClient } from '../_shared/deps.ts'
import { corsHeaders } from '../_shared/cors.ts'

/**
 * [v41.0] 核心計算引擎，負責執行所有購物車相關的金額計算。
 * 此版本為最新實作，包含 RLS 權限透傳。
 * @param req - 原始的 HTTP 請求物件，用於透傳 Authorization 標頭。
 * @param supabaseAdmin - 一個使用 service_role_key 初始化的 Supabase 客戶端。
 * @param cartId - 要計算的購物車 ID。
 * @param couponCode - (可選) 使用者應用的優惠券代碼。
 * @param shippingMethodId - (可選) 使用者選擇的運送方式 ID。
 * @returns {Promise<object>} 一個包含完整購物車品項、摘要與運費資訊的物件。
 */
async function calculateCartSummary(req: Request, supabaseAdmin: ReturnType<typeof createClient>, cartId: string, couponCode?: string, shippingMethodId?: string) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase URL 或 Anon Key 未在環境變數中設定。');
  }

  // [核心設計] 權限透傳：建立一個模擬前端使用者身份的客戶端
  const authHeader = req.headers.get('Authorization');
  const clientOptions: { global?: { headers: { [key: string]: string } } } = {};
  if (authHeader) {
      clientOptions.global = { headers: { Authorization: authHeader } };
  }
  const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, clientOptions);

  // 使用「使用者身份客戶端」查詢受 RLS 保護的 cart_items 表
  const { data: cartItems, error: cartItemsError } = await supabaseUserClient
    .from('cart_items')
    .select(`*, product_variants(name, price, sale_price, products(image_url))`)
    .eq('cart_id', cartId);
    
  if (cartItemsError) {
      console.error('[RLS Check] calculateCartSummary 查詢失敗:', cartItemsError);
      throw new Error(`無法讀取購物車項目，請檢查權限：${cartItemsError.message}`);
  }

  if (!cartItems || cartItems.length === 0) {
    return { 
      items: [], 
      itemCount: 0, 
      summary: { subtotal: 0, couponDiscount: 0, shippingFee: 0, total: 0 }, 
      appliedCoupon: null,
      shippingInfo: { freeShippingThreshold: 0, amountNeededForFreeShipping: 0 }
    };
  }

  const subtotal = cartItems.reduce((sum, item) => 
    sum + Math.round((item.product_variants.sale_price ?? item.product_variants.price) * item.quantity), 0
  );

  let couponDiscount = 0;
  let appliedCoupon = null;
  
  // 使用「管理員身份客戶端」查詢公開的 coupons 表
  if (couponCode) {
    const { data: coupon } = await supabaseAdmin
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
  
  // 使用「管理員身份客戶端」查詢公開的 shipping_rates 表
  if (shippingMethodId) {
    const { data: shippingRate } = await supabaseAdmin
      .from('shipping_rates')
      .select('*')
      .eq('id', shippingMethodId)
      .eq('is_active', true)
      .single();
    
    if (shippingRate && (!shippingRate.free_shipping_threshold || subtotalAfterDiscount < shippingRate.free_shipping_threshold)) {
      shippingFee = Math.round(shippingRate.rate);
    }
  }

  // [保留 v32.4 優點] 計算免運門檻相關資訊
  let freeShippingThreshold = 0;
  let amountNeededForFreeShipping = 0;
  
  const { data: allShippingRates } = await supabaseAdmin
      .from('shipping_rates')
      .select('free_shipping_threshold')
      .eq('is_active', true)
      .gt('free_shipping_threshold', 0);
      
  if (allShippingRates && allShippingRates.length > 0) {
      freeShippingThreshold = Math.max(...allShippingRates.map(r => r.free_shipping_threshold));
      if (subtotalAfterDiscount < freeShippingThreshold) {
          amountNeededForFreeShipping = freeShippingThreshold - subtotalAfterDiscount;
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
      total: total < 0 ? 0 : total 
    },
    appliedCoupon,
    shippingInfo: {
      freeShippingThreshold,
      amountNeededForFreeShipping
    }
  };
}


// --- Edge Function 主處理邏輯 ---
Deno.serve(async (req) => {
  // 處理 CORS 預檢請求
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  
  try {
    const { cartId, couponCode, shippingMethodId, actions } = await req.json();

    if (!cartId) {
      return new Response(JSON.stringify({ error: '缺少必要參數: cartId' }), { 
        status: 422, // Unprocessable Entity
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!, 
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, 
      { auth: { persistSession: false } }
    );
    
    // [v42.0 恢復] 處理購物車的寫入操作
    if (actions && Array.isArray(actions) && actions.length > 0) {
      for (const action of actions) {
        switch (action.type) {
          case 'ADD_ITEM': {
            const { variantId, quantity } = action.payload;
            const { data: variant, error: vError } = await supabaseAdmin
              .from('product_variants')
              .select('price, sale_price')
              .eq('id', variantId)
              .single();
            
            if (vError) throw new Error('找不到指定的商品規格。');
            
            const price_snapshot = (variant.sale_price && variant.sale_price > 0) ? variant.sale_price : variant.price;
            
            await supabaseAdmin.from('cart_items').upsert({
              cart_id: cartId, 
              product_variant_id: variantId, 
              quantity: quantity, 
              price_snapshot: price_snapshot,
            }, { onConflict: 'cart_id,product_variant_id' }).throwOnError();
            break;
          }
          case 'UPDATE_ITEM_QUANTITY': {
            const { itemId, newQuantity } = action.payload;
            if (newQuantity > 0) {
              await supabaseAdmin.from('cart_items')
                .update({ quantity: newQuantity })
                .eq('id', itemId)
                .throwOnError();
            } else {
              await supabaseAdmin.from('cart_items')
                .delete()
                .eq('id', itemId)
                .throwOnError();
            }
            break;
          }
          case 'REMOVE_ITEM': {
            const { itemId } = action.payload;
            await supabaseAdmin.from('cart_items')
              .delete()
              .eq('id', itemId)
              .throwOnError();
            break;
          }
        }
      }
    }
    
    // 在執行完所有操作後，呼叫核心計算引擎獲取最新的狀態
    const cartSnapshot = await calculateCartSummary(req, supabaseAdmin, cartId, couponCode, shippingMethodId);

    // 回傳完整的購物車快照
    return new Response(JSON.stringify(cartSnapshot), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (e) {
    console.error('[recalculate-cart] 函式錯誤:', e.message, e.stack);
    return new Response(JSON.stringify({ error: `[recalculate-cart]: ${e.message}` }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});