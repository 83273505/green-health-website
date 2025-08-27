// ==============================================================================
// 檔案路徑: supabase/functions/recalculate-cart/index.ts
// 版本: v45.1 - AI 協作優化收官版
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Unified Cart Management Function (統一購物車管理函式)
 * @description 「活水行動」v3.1 最終版。融合了業界最佳實踐，能完美處理匿名購物車，
 *              並具備高效能、高健壯性與詳細日誌記錄。
 * @version v45.1
 * 
 * @update v45.1 - [ENHANCED ROBUST HANDLING & PERFORMANCE]
 * 1. [效能優化] 將購物車存在性檢查提升到函式入口，避免重複檢查。
 * 2. [錯誤處理] 增強各操作的參數驗證，提供更精確的錯誤訊息。
 * 3. [日誌改進] 增加詳細的操作日誌，便於問題追蹤。
 * 4. [程式碼結構] 抽離 `ensureCartExists` 為獨立函式，並增加 TypeScript 介面。
 */

import { createClient } from '../_shared/deps.ts'
import { corsHeaders } from '../_shared/cors.ts'

interface CartAction {
  type: 'ADD_ITEM' | 'UPDATE_ITEM_QUANTITY' | 'REMOVE_ITEM';
  payload: {
    variantId?: string;
    quantity?: number;
    itemId?: string;
    newQuantity?: number;
  };
}

async function calculateCartSummary(
  req: Request, 
  supabaseAdmin: ReturnType<typeof createClient>, 
  cartId: string, 
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
    console.error('[RLS Check] calculateCartSummary 查詢失敗:', cartItemsError);
    throw new Error(`無法讀取購物車項目，請檢查權限：${cartItemsError.message}`);
  }

  if (!cartItems || cartItems.length === 0) {
    return {
      items: [],
      itemCount: 0,
      summary: { subtotal: 0, couponDiscount: 0, shippingFee: 0, total: 0, couponCode: null },
      appliedCoupon: null,
      shippingInfo: { freeShippingThreshold: 0, amountNeededForFreeShipping: 0 }
    };
  }

  const subtotal = cartItems.reduce((sum, item) => 
    sum + Math.round((item.product_variants.sale_price ?? item.product_variants.price) * item.quantity), 0
  );

  let couponDiscount = 0;
  let appliedCoupon = null;

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
      total: total < 0 ? 0 : total,
      couponCode: appliedCoupon ? couponCode : null
    },
    appliedCoupon,
    shippingInfo: { freeShippingThreshold, amountNeededForFreeShipping }
  };
}

async function ensureCartExists(supabaseAdmin: ReturnType<typeof createClient>, cartId: string): Promise<void> {
  try {
    console.log(`[Cart Management] 檢查購物車存在性: ${cartId}`);
    
    const { error } = await supabaseAdmin
      .from('carts')
      .upsert({ id: cartId }, { onConflict: 'id' });

    if (error) {
      console.error('[Cart Management] 購物車建立/確認失敗:', error);
      throw new Error(`無法建立或確認購物車: ${error.message}`);
    }

    console.log(`[Cart Management] 購物車確認存在: ${cartId}`);
  } catch (e) {
    console.error('[Cart Management] ensureCartExists 錯誤:', e);
    throw new Error(`購物車存在性檢查失敗: ${e.message}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  
  try {
    const { cartId, couponCode, shippingMethodId, actions }: { cartId: string; couponCode?: string; shippingMethodId?: string; actions?: CartAction[] } = await req.json();

    if (!cartId) {
      return new Response(JSON.stringify({ error: '缺少必要參數: cartId' }), { 
        status: 422,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!, 
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, 
      { auth: { persistSession: false } }
    );
    
    if (actions && Array.isArray(actions) && actions.length > 0) {
      await ensureCartExists(supabaseAdmin, cartId);
      console.log(`[Cart Management] 處理 ${actions.length} 個操作 for cart ${cartId}`);
      
      for (const [index, action] of actions.entries()) {
        console.log(`[Cart Management] 執行操作 ${index + 1}: ${action.type}`);
        
        try {
          switch (action.type) {
            case 'ADD_ITEM': {
              const { variantId, quantity } = action.payload;

              if (!variantId || !quantity || quantity <= 0) {
                throw new Error('ADD_ITEM 缺少必要參數或數量無效');
              }

              const { data: variant, error: vError } = await supabaseAdmin
                .from('product_variants')
                .select('price, sale_price')
                .eq('id', variantId)
                .single();
              
              if (vError || !variant) {
                throw new Error(`找不到商品規格 ${variantId}: ${vError?.message || '商品不存在'}`);
              }
              
              const price_snapshot = (variant.sale_price && variant.sale_price > 0) 
                ? variant.sale_price 
                : variant.price;
              
              const { error: upsertError } = await supabaseAdmin
                .from('cart_items')
                .upsert({
                  cart_id: cartId, 
                  product_variant_id: variantId, 
                  quantity: quantity, 
                  price_snapshot: price_snapshot,
                }, { onConflict: 'cart_id,product_variant_id' });

              if (upsertError) {
                throw new Error(`新增商品失敗: ${upsertError.message}`);
              }

              console.log(`[Cart Management] 成功新增商品: ${variantId} x ${quantity}`);
              break;
            }
            
            case 'UPDATE_ITEM_QUANTITY': {
              const { itemId, newQuantity } = action.payload;

              if (!itemId) throw new Error('UPDATE_ITEM_QUANTITY 缺少 itemId');
              if (newQuantity === undefined || newQuantity < 0) throw new Error('UPDATE_ITEM_QUANTITY 數量參數無效');

              if (newQuantity > 0) {
                const { error } = await supabaseAdmin.from('cart_items').update({ quantity: newQuantity }).eq('id', itemId);
                if (error) throw new Error(`更新數量失敗: ${error.message}`);
                console.log(`[Cart Management] 更新商品數量: ${itemId} -> ${newQuantity}`);
              } else {
                const { error } = await supabaseAdmin.from('cart_items').delete().eq('id', itemId);
                if (error) throw new Error(`刪除商品失敗: ${error.message}`);
                console.log(`[Cart Management] 刪除商品: ${itemId}`);
              }
              break;
            }
            
            case 'REMOVE_ITEM': {
              const { itemId } = action.payload;
              if (!itemId) throw new Error('REMOVE_ITEM 缺少 itemId');
              const { error } = await supabaseAdmin.from('cart_items').delete().eq('id', itemId);
              if (error) throw new Error(`移除商品失敗: ${error.message}`);
              console.log(`[Cart Management] 移除商品: ${itemId}`);
              break;
            }
            
            default:
              console.warn(`[Cart Management] 未知操作類型: ${(action as any).type}`);
          }
        } catch (actionError) {
          console.error(`[Cart Management] 操作 ${action.type} 執行失敗:`, actionError);
          throw actionError;
        }
      }
    }
    
    console.log(`[Cart Management] 計算購物車摘要: ${cartId}`);
    const cartSnapshot = await calculateCartSummary(req, supabaseAdmin, cartId, couponCode, shippingMethodId);

    return new Response(JSON.stringify(cartSnapshot), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (e) {
    console.error('[recalculate-cart] 函式錯誤:', e.message);
    console.error('[recalculate-cart] 錯誤堆疊:', e.stack);
    
    return new Response(JSON.stringify({ 
      error: `[recalculate-cart] 函式錯誤: ${e.message}`,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});