// 檔案路徑: supabase/functions/recalculate-cart/index.ts
/**
 * 檔案名稱：index.ts
 * 檔案職責：在執行任何購物車操作前，進行權威的、基於最終總量的庫存校驗。
 * 版本：48.11
 * SOP 條款對應：
 * - [2.1.6] 動態上下文詞彙學習與強制執行協議 (🔴L1)
 * - [1.1.1] 驗收標準鐵律
 * - [4.0] 變更優先診斷原則
 * AI 註記：
 * - 變更摘要:
 *   - [檔案標頭]::[修正]::修正了檔案標頭中的簡體中文「数量校验终版」為正體中文「數量校驗終版」。
 *   - [檔案整體]::[無變更]::檔案的其餘所有程式碼邏輯均保持 v48.10 版本不變。
 * - 提醒：本檔案已遵循「零省略原則」完整交付。
 * 更新日誌 (Changelog)：
 * - v48.11 (2025-09-09)：[SOP v7.1 合規] 遵循 [2.1.6] 協議，修正檔案標頭中的簡體中文詞彙。
 * - v48.10 (2025-09-09)：[CRITICAL UX FIX] 修正了 `_processStockReservations` 的校驗邏輯，確保基於最終數量而非增量進行檢查。
 */

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import LoggingService, { withErrorLogging } from '../_shared/services/loggingService.ts';

const FUNCTION_NAME = 'recalculate-cart';
const FUNCTION_VERSION = 'v48.11';

interface CartAction {
  type: 'ADD_ITEM' | 'UPDATE_ITEM_QUANTITY' | 'REMOVE_ITEM';
  payload: {
    variantId?: string;
    quantity?: number;
    itemId?: string;
    newQuantity?: number;
  };
}

async function _processStockReservations(
  { supabaseAdmin, cartId, actions, logger, correlationId }:
  { supabaseAdmin: ReturnType<typeof createClient>; cartId: string; actions: CartAction[]; logger: LoggingService; correlationId: string; }
) {
  logger.info(`啟動庫存預留處理流程`, correlationId, { cartId, actionCount: actions.length });

  for (const action of actions) {
    const { type, payload } = action;
    if (type === 'REMOVE_ITEM') continue;

    let targetVariantId: string | undefined;
    let finalTargetQuantity = 0;

    if (type === 'ADD_ITEM') {
        targetVariantId = payload.variantId;
        if (!targetVariantId) continue;
        const { data: existingItem } = await supabaseAdmin.from('cart_items').select('quantity').eq('cart_id', cartId).eq('product_variant_id', targetVariantId).single();
        finalTargetQuantity = (existingItem?.quantity || 0) + (payload.quantity ?? 0);
    } else if (type === 'UPDATE_ITEM_QUANTITY') {
        if (!payload.itemId) throw new Error('UPDATE_ITEM_QUANTITY 缺少 itemId');
        const { data: item, error } = await supabaseAdmin.from('cart_items').select('product_variant_id').eq('id', payload.itemId).single();
        if (error || !item) throw new Error(`找不到購物車項目: ${payload.itemId}`);
        targetVariantId = item.product_variant_id;
        finalTargetQuantity = payload.newQuantity ?? 0;
    }

    if (!targetVariantId || finalTargetQuantity < 0) continue;

    const { data: variant, error: variantError } = await supabaseAdmin.from('product_variants').select('stock, name').eq('id', targetVariantId).single();
    if (variantError || !variant) throw new Error(`找不到商品規格: ${targetVariantId}`);

    const { data: otherReservations, error: rpcError } = await supabaseAdmin.rpc('get_reservations_for_variant', {
        p_variant_id: targetVariantId,
        p_exclude_cart_id: cartId
    });
    if (rpcError) throw new Error(`查詢其他預留失敗: ${rpcError.message}`);

    const totalOtherReserved = otherReservations?.[0]?.total_reserved_quantity || 0;
    const availableStock = variant.stock - totalOtherReserved;

    logger.info(`[總量預留檢查]`, correlationId, {
        variant: variant.name,
        physicalStock: variant.stock,
        totalOtherReserved,
        availableStock,
        requestedFinalQuantity: finalTargetQuantity
    });

    if (availableStock < finalTargetQuantity) {
        throw {
            name: 'InsufficientStockError',
            message: `商品 "${variant.name}" 庫存不足，目前僅剩 ${availableStock} 件可購買。`,
            details: { available: availableStock, requested: finalTargetQuantity }
        };
    }
  }
}

async function _processCartActions(
    { supabaseAdmin, cartId, actions, logger, correlationId }:
    { supabaseAdmin: ReturnType<typeof createClient>; cartId: string; actions: CartAction[]; logger: LoggingService; correlationId: string; }
) {
    logger.info(`開始處理 ${actions.length} 個購物車資料庫操作`, correlationId, { cartId });
    for (const action of actions) {
        try {
            switch (action.type) {
                case 'ADD_ITEM': {
                    const { variantId, quantity } = action.payload;
                    if (!variantId || !quantity || quantity <= 0) continue;
                    
                    const { data: existingItem } = await supabaseAdmin.from('cart_items').select('id, quantity').eq('cart_id', cartId).eq('product_variant_id', variantId).single();
                    const newQuantity = (existingItem?.quantity || 0) + quantity;
                    
                    const { data: variant, error: vError } = await supabaseAdmin.from('product_variants').select('price, sale_price').eq('id', variantId).single();
                    if (vError || !variant) throw new Error(`找不到商品規格 ${variantId}: ${vError?.message || '不存在'}`);
                    const price_snapshot = variant.sale_price ?? variant.price;

                    const { data: upsertedItem, error: upsertError } = await supabaseAdmin.from('cart_items').upsert({ id: existingItem?.id, cart_id: cartId, product_variant_id: variantId, quantity: newQuantity, price_snapshot: price_snapshot }, { onConflict: 'id' }).select('id').single();
                    if (upsertError) throw upsertError;
                    
                    await supabaseAdmin.from('cart_stock_reservations').upsert({ cart_item_id: upsertedItem!.id, product_variant_id: variantId, reserved_quantity: newQuantity, status: 'active', expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString() }, { onConflict: 'cart_item_id' });
                    logger.audit(`成功新增/更新商品並建立庫存預留`, correlationId, { cartId, variantId, newQuantity, cartItemId: upsertedItem!.id });
                    break;
                }
                case 'UPDATE_ITEM_QUANTITY': {
                    const { itemId, newQuantity } = action.payload;
                    if (!itemId || newQuantity === undefined || newQuantity < 0) continue;
                    
                    if (newQuantity > 0) {
                        const { error } = await supabaseAdmin.from('cart_items').update({ quantity: newQuantity }).eq('id', itemId);
                        if (error) throw error;
                        
                        const {data: item} = await supabaseAdmin.from('cart_items').select('product_variant_id').eq('id', itemId).single();
                        await supabaseAdmin.from('cart_stock_reservations').upsert({ cart_item_id: itemId, product_variant_id: item!.product_variant_id, reserved_quantity: newQuantity, status: 'active', expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString() }, { onConflict: 'cart_item_id' });
                        logger.audit(`成功更新商品數量並更新庫存預留`, correlationId, { cartId, itemId, newQuantity });
                    } else {
                        await supabaseAdmin.from('cart_stock_reservations').delete().eq('cart_item_id', itemId);
                        const { error } = await supabaseAdmin.from('cart_items').delete().eq('id', itemId);
                        if (error) throw error;
                        logger.audit(`成功因數量為0而移除商品及庫存預留`, correlationId, { cartId, itemId });
                    }
                    break;
                }
                case 'REMOVE_ITEM': {
                    const { itemId } = action.payload;
                    if (!itemId) continue;
                    await supabaseAdmin.from('cart_stock_reservations').delete().eq('cart_item_id', itemId);
                    const { error } = await supabaseAdmin.from('cart_items').delete().eq('id', itemId);
                    if (error) throw error;
                    logger.audit(`成功移除商品及庫存預留`, correlationId, { cartId, itemId });
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

async function _calculateCartSummary(
  { supabaseAdmin, cartId, couponCode, shippingMethodId, logger, correlationId }:
  { supabaseAdmin: ReturnType<typeof createClient>; cartId: string; couponCode?: string; shippingMethodId?: string; logger: LoggingService; correlationId: string; }
) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseAnonKey) throw new Error('Supabase URL 或 Anon Key 未設定。');

  const authHeader = Deno.request.headers.get('Authorization');
  const clientOptions: { global?: { headers: { [key: string]: string } } } = {};
  if (authHeader) clientOptions.global = { headers: { Authorization: authHeader } };

  const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, clientOptions);

  const { data: cartItems, error: cartItemsError } = await supabaseUserClient.from('cart_items').select(`id, quantity, product_variant_id, product_variants(name, price, sale_price, stock, products(image_url))`).eq('cart_id', cartId);
  if (cartItemsError) {
    logger.error('[RLS Check] calculateCartSummary 查詢失敗', correlationId, cartItemsError, { cartId });
    throw new Error(`無法讀取購物車項目：${cartItemsError.message}`);
  }

  if (!cartItems || cartItems.length === 0) {
    return { items: [], hasInsufficientItems: false, itemCount: 0, summary: { subtotal: 0, couponDiscount: 0, shippingFee: 0, total: 0, couponCode: null }, appliedCoupon: null, shippingInfo: { freeShippingThreshold: 0, amountNeededForFreeShipping: 0 } };
  }

  const { data: allReservations, error: rpcError } = await supabaseAdmin.rpc('get_reservations_for_variant_batch', { p_cart_id: cartId });
  if(rpcError) throw new Error(`查詢批次預留失敗: ${rpcError.message}`);

  const reservationMap = new Map((allReservations || []).map(r => [r.variant_id, r.total_reserved_quantity]));

  const enhancedItems = cartItems.map(item => {
    const variant = item.product_variants;
    if (!variant) return { ...item, stockStatus: 'UNAVAILABLE' };
    
    const totalOtherReserved = reservationMap.get(item.product_variant_id) || 0;
    const availableStock = variant.stock - totalOtherReserved;
    
    return {
      ...item,
      stockStatus: item.quantity <= availableStock ? 'AVAILABLE' : 'INSUFFICIENT'
    };
  });
  
  const hasInsufficientItems = enhancedItems.some(item => item.stockStatus === 'INSUFFICIENT');

  const subtotal = enhancedItems.reduce((sum, item) => {
      if(item.stockStatus === 'AVAILABLE') {
          return sum + Math.round((item.product_variants.sale_price ?? item.product_variants.price) * item.quantity)
      }
      return sum;
  }, 0);

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
    items: enhancedItems,
    hasInsufficientItems: hasInsufficientItems,
    itemCount: enhancedItems.reduce((sum, item) => item.stockStatus === 'AVAILABLE' ? sum + item.quantity : sum, 0),
    summary: { subtotal, couponDiscount, shippingFee, total: total < 0 ? 0 : total, couponCode: appliedCoupon ? couponCode : null },
    appliedCoupon,
    shippingInfo: { freeShippingThreshold, amountNeededForFreeShipping }
  };
  
  logger.info('購物車摘要計算完成', correlationId, { cartId, total: result.summary.total, itemCount: result.itemCount, hasInsufficientItems });
  return result;
}

async function mainHandler(req: Request, logger: LoggingService, correlationId: string): Promise<Response> {
    const { cartId, couponCode, shippingMethodId, actions } = await req.json().catch(() => ({}));

    if (!cartId) {
        logger.warn('請求中缺少必要的 cartId 參數', correlationId, { body: req.body });
        return new Response(JSON.stringify({
            success: false,
            error: { message: '缺少必要參數: cartId', code: 'INVALID_REQUEST', correlationId: correlationId }
        }), { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    
    if (actions && Array.isArray(actions) && actions.length > 0) {
        const supabaseUserClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization')! } } });
        const { data: { user } } = await supabaseUserClient.auth.getUser();

        if (!user) {
            logger.warn('使用者未授權，嘗試修改購物車遭拒', correlationId, { cartId });
            return new Response(JSON.stringify({
                success: false,
                error: { message: '使用者未授權', code: 'UNAUTHORIZED', correlationId: correlationId }
            }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const { error: ownerCheckError } = await supabaseUserClient.from('carts').select('id').eq('id', cartId).eq('user_id', user.id).single();
        if (ownerCheckError) {
            logger.warn('購物車所有權驗證失敗', correlationId, { operatorId: user.id, cartId });
            return new Response(JSON.stringify({
                success: false,
                error: { message: '權限不足或購物車不存在', code: 'FORBIDDEN', correlationId: correlationId }
            }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        logger.info('購物車所有權驗證通過', correlationId, { operatorId: user.id, cartId });
        
        try {
            await _processStockReservations({ supabaseAdmin, cartId, actions, logger, correlationId });
            await _processCartActions({ supabaseAdmin, cartId, actions, logger, correlationId });
        } catch (err) {
            if (err.name === 'InsufficientStockError') {
                 logger.warn(`[庫存預留失敗] ${err.message}`, correlationId, { details: err.details });
                 const cartSnapshotOnFailure = await _calculateCartSummary({ supabaseAdmin, cartId, couponCode, shippingMethodId, logger, correlationId });
                 return new Response(JSON.stringify({
                     success: false,
                     error: { message: err.message, code: 'INSUFFICIENT_STOCK', correlationId: correlationId },
                     data: cartSnapshotOnFailure
                 }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }
            throw err;
        }
    }
    
    const cartSnapshot = await _calculateCartSummary({ supabaseAdmin, cartId, couponCode, shippingMethodId, logger, correlationId });

    if ((!actions || actions.length === 0) && cartSnapshot.hasInsufficientItems) {
        logger.warn('結帳前預計算發現庫存不足', correlationId, { cartId });
        return new Response(JSON.stringify({
            success: false,
            error: { message: '您的購物車中部分商品庫存已不足，請返回購物車調整。', code: 'INSUFFICIENT_STOCK_PRECHECK', correlationId: correlationId },
            data: cartSnapshot
        }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: true, data: cartSnapshot }), {
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