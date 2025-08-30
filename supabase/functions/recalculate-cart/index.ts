// ==============================================================================
// 檔案路徑: supabase/functions/recalculate-cart/index.ts
// 版本: v46.1 - 業務邏輯修正 (價格快照)
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Unified Cart Management Function (統一購物車管理函式)
 * @description 處理購物車的增刪改操作，並在操作後進行權威的價格計算。
 * @version v46.1
 *
 * @update v46.1 - [BUSINESS LOGIC FIX - PRICE SNAPSHOT]
 * 1. [核心修正] 在 `_processCartActions` 的 `ADD_ITEM` 邏輯中，補上了
 *          對 `product_variants` 表的查詢，以獲取商品的當前價格。
 * 2. [錯誤解決] 將獲取到的價格作為 `price_snapshot` 寫入 `cart_items` 表，
 *          解決了因違反資料庫 `NOT NULL` 約束而導致的 500 錯誤。
 *
 * @update v46.0 - [SECURITY, LOGGING & REFACTORING]
 * 1. [核心安全修正] 新增了購物車所有權驗證，杜絕跨使用者修改購物車的風險。
 * 2. [核心架構] 引入 `LoggingService` v2.0，並使用 `withErrorLogging` 處理異常。
 */

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import LoggingService, { withErrorLogging } from '../_shared/services/loggingService.ts';

const FUNCTION_NAME = 'recalculate-cart';
const FUNCTION_VERSION = 'v46.1';

// ... (interface CartAction 維持不變) ...
interface CartAction {
  type: 'ADD_ITEM' | 'UPDATE_ITEM_QUANTITY' | 'REMOVE_ITEM';
  payload: {
    variantId?: string;
    quantity?: number;
    itemId?: string;
    newQuantity?: number;
  };
}

// ... (_calculateCartSummary 函式維持不變) ...
async function _calculateCartSummary(
  { req, supabaseAdmin, cartId, couponCode, shippingMethodId, logger, correlationId }:
  { req: Request; supabaseAdmin: ReturnType<typeof createClient>; cartId: string; couponCode?: string; shippingMethodId?: string; logger: LoggingService; correlationId: string; }
) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !supabaseAnonKey) throw new Error('Supabase URL 或 Anon Key 未設定。');

  const authHeader = req.headers.get('Authorization');
  const clientOptions: { global?: { headers: { [key: string]: string } } } = {};
  if (authHeader) clientOptions.global = { headers: { Authorization: authHeader } };

  const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, clientOptions);

  const { data: cartItems, error: cartItemsError } = await supabaseUserClient
    .from('cart_items')
    .select(`*, product_variants(name, price, sale_price, products(image_url))`)
    .eq('cart_id', cartId);

  if (cartItemsError) {
    logger.error('[RLS Check] calculateCartSummary 查詢失敗', correlationId, cartItemsError, { cartId });
    throw new Error(`無法讀取購物車項目：${cartItemsError.message}`);
  }

  if (!cartItems || cartItems.length === 0) {
    return {
      items: [], itemCount: 0,
      summary: { subtotal: 0, couponDiscount: 0, shippingFee: 0, total: 0, couponCode: null },
      appliedCoupon: null, shippingInfo: { freeShippingThreshold: 0, amountNeededForFreeShipping: 0 }
    };
  }

  const subtotal = cartItems.reduce((sum, item) => sum + Math.round((item.product_variants.sale_price ?? item.product_variants.price) * item.quantity), 0);

  let couponDiscount = 0;
  let appliedCoupon = null;
  if (couponCode) {
    const { data: coupon } = await supabaseAdmin.from('coupons').select('*').eq('code', couponCode).eq('is_active', true).single();
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
    const { data: shippingRate } = await supabaseAdmin.from('shipping_rates').select('*').eq('id', shippingMethodId).eq('is_active', true).single();
    if (shippingRate && (!shippingRate.free_shipping_threshold || subtotalAfterDiscount < shippingRate.free_shipping_threshold)) {
      shippingFee = Math.round(shippingRate.rate);
    }
  }

  let freeShippingThreshold = 0;
  let amountNeededForFreeShipping = 0;
  const { data: allShippingRates } = await supabaseAdmin.from('shipping_rates').select('free_shipping_threshold').eq('is_active', true).gt('free_shipping_threshold', 0);
  if (allShippingRates && allShippingRates.length > 0) {
    freeShippingThreshold = Math.max(...allShippingRates.map(r => r.free_shipping_threshold));
    if (subtotalAfterDiscount < freeShippingThreshold) {
      amountNeededForFreeShipping = freeShippingThreshold - subtotalAfterDiscount;
    }
  }

  const total = subtotal - couponDiscount + shippingFee;

  const result = {
    items: cartItems,
    itemCount: cartItems.reduce((sum, item) => sum + item.quantity, 0),
    summary: { subtotal, couponDiscount, shippingFee, total: total < 0 ? 0 : total, couponCode: appliedCoupon ? couponCode : null },
    appliedCoupon,
    shippingInfo: { freeShippingThreshold, amountNeededForFreeShipping }
  };
  
  logger.info('購物車摘要計算完成', correlationId, { cartId, total: result.summary.total, itemCount: result.itemCount });
  return result;
}

// [v46.1 核心修正]
async function _processCartActions(
    { supabaseAdmin, cartId, actions, logger, correlationId }:
    { supabaseAdmin: ReturnType<typeof createClient>; cartId: string; actions: CartAction[]; logger: LoggingService; correlationId: string; }
) {
    logger.info(`準備處理 ${actions.length} 個購物車操作`, correlationId, { cartId });
    for (const action of actions) {
        try {
            switch (action.type) {
                case 'ADD_ITEM': {
                    const { variantId, quantity } = action.payload;
                    if (!variantId || !quantity || quantity <= 0) throw new Error('ADD_ITEM 缺少或無效的參數');
                    
                    // [v46.1 新增] 查詢價格以建立快照
                    const { data: variant, error: vError } = await supabaseAdmin
                        .from('product_variants').select('price, sale_price').eq('id', variantId).single();
                    if (vError || !variant) throw new Error(`找不到商品規格 ${variantId}: ${vError?.message || '不存在'}`);
                    const price_snapshot = variant.sale_price ?? variant.price;

                    const { error: upsertError } = await supabaseAdmin
                        .from('cart_items')
                        .upsert({ 
                            cart_id: cartId, 
                            product_variant_id: variantId, 
                            quantity: quantity,
                            price_snapshot: price_snapshot // [v46.1 新增] 寫入價格快照
                        }, { onConflict: 'cart_id,product_variant_id' });

                    if (upsertError) throw upsertError;
                    
                    logger.info(`[Action] 成功新增商品`, correlationId, { cartId, variantId, quantity });
                    break;
                }
                case 'UPDATE_ITEM_QUANTITY': {
                    const { itemId, newQuantity } = action.payload;
                    if (!itemId || newQuantity === undefined || newQuantity < 0) throw new Error('UPDATE_ITEM_QUANTITY 參數無效');
                    
                    if (newQuantity > 0) {
                        const { error } = await supabaseAdmin.from('cart_items').update({ quantity: newQuantity }).eq('id', itemId);
                        if (error) throw error;
                        logger.info(`[Action] 成功更新商品數量`, correlationId, { cartId, itemId, newQuantity });
                    } else {
                        const { error } = await supabaseAdmin.from('cart_items').delete().eq('id', itemId);
                        if (error) throw error;
                        logger.info(`[Action] 成功因數量為0而移除商品`, correlationId, { cartId, itemId });
                    }
                    break;
                }
                case 'REMOVE_ITEM': {
                    const { itemId } = action.payload;
                    if (!itemId) throw new Error('REMOVE_ITEM 缺少 itemId');
                    const { error } = await supabaseAdmin.from('cart_items').delete().eq('id', itemId);
                    if (error) throw error;
                    logger.info(`[Action] 成功移除商品`, correlationId, { cartId, itemId });
                    break;
                }
                default:
                    logger.warn(`偵測到未知的操作類型`, correlationId, { type: (action as any).type });
            }
        } catch (actionError) {
            logger.error(`購物車操作 ${action.type} 執行失敗`, correlationId, actionError, { cartId, payload: action.payload });
            throw actionError;
        }
    }
}

// ... (mainHandler 和 Deno.serve 維持不變) ...
async function mainHandler(req: Request, logger: LoggingService, correlationId: string): Promise<Response> {
    const { cartId, couponCode, shippingMethodId, actions } = await req.json().catch(() => ({}));

    if (!cartId) {
        logger.warn('請求中缺少必要的 cartId 參數', correlationId);
        return new Response(JSON.stringify({ error: '缺少必要參數: cartId' }), { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    
    if (actions && Array.isArray(actions) && actions.length > 0) {
        const supabaseUserClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization')! } } });
        const { data: { user } } = await supabaseUserClient.auth.getUser();

        if (!user) {
            logger.warn('嘗試修改購物車但使用者未授權', correlationId, { cartId });
            return new Response(JSON.stringify({ error: '使用者未授權' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const { error: ownerCheckError } = await supabaseUserClient.from('carts').select('id').eq('id', cartId).eq('user_id', user.id).single();
        if (ownerCheckError) {
            logger.warn('購物車所有權驗證失敗，操作被拒絕', correlationId, { operatorId: user.id, cartId });
            return new Response(JSON.stringify({ error: '權限不足或購物車不存在' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        
        logger.info('購物車所有權驗證通過', correlationId, { operatorId: user.id, cartId });
        await _processCartActions({ supabaseAdmin, cartId, actions, logger, correlationId });
    }
    
    const cartSnapshot = await _calculateCartSummary({ req, supabaseAdmin, cartId, couponCode, shippingMethodId, logger, correlationId });

    return new Response(JSON.stringify(cartSnapshot), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }
    const logger = new LoggingService(FUNCTION_NAME, FUNCTION_VERSION);
    const wrappedHandler = withErrorLogging(mainHandler, logger);
    return await wrappedHandler(req);
});