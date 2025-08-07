// ==============================================================================
// 檔案路徑: supabase/functions/merge-user-data/index.ts
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋 - 性能與穩定性優化版】
// ==============================================================================

import { createClient } from '../_shared/deps.ts'
import { corsHeaders } from '../_shared/cors.ts'

console.log(`函式 "merge-user-data" (v3 - 優化版) 已啟動`);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { anonymous_uid, current_uid } = await req.json();

    if (!anonymous_uid || !current_uid) {
      throw new Error("請求中缺少 'anonymous_uid' 或 'current_uid' 參數。");
    }
    if (anonymous_uid === current_uid) {
      return new Response(JSON.stringify({ success: true, message: '無需合併，使用者 ID 相同。', details: {} }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // --- 強化版合併邏輯 ---

    const { data: anonCart, error: findAnonCartError } = await supabaseAdmin
      .from('carts')
      .select('id, cart_items(*)')
      .eq('user_id', anonymous_uid)
      .eq('status', 'active')
      .maybeSingle();

    if (findAnonCartError) throw new Error(`查詢匿名購物車時出錯: ${findAnonCartError.message}`);

    if (!anonCart || !anonCart.cart_items || anonCart.cart_items.length === 0) {
      try {
        await supabaseAdmin.auth.admin.deleteUser(anonymous_uid);
      } catch (e) {
        console.warn(`[merge] 刪除無購物車的匿名使用者 ${anonymous_uid} 失敗:`, e.message);
      }
      return new Response(JSON.stringify({ success: true, message: '匿名使用者無活躍購物車，無需合併。' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let { data: currentCart, error: findCurrentCartError } = await supabaseAdmin
      .from('carts')
      .select('id')
      .eq('user_id', current_uid)
      .eq('status', 'active')
      .maybeSingle();
    
    if (findCurrentCartError) throw new Error(`查詢正式購物車時出錯: ${findCurrentCartError.message}`);

    if (!currentCart) {
      const { data: newCart, error: createCartError } = await supabaseAdmin.from('carts').insert({ user_id: current_uid, status: 'active' }).select('id').single();
      if (createCartError) throw new Error(`建立正式購物車失敗: ${createCartError.message}`);
      currentCart = newCart;
    }

    const targetCartId = currentCart.id;
    const sourceItems = anonCart.cart_items;
    let itemsMerged = 0;
    let itemsSkipped = 0;
    
    console.log(`[merge] 開始合併 ${sourceItems.length} 個品項從匿名購物車 ${anonCart.id} 到正式購物車 ${targetCartId}`);

    const variantIds = sourceItems.map(item => item.product_variant_id);
    const { data: existingItems, error: batchFindError } = await supabaseAdmin
      .from('cart_items')
      .select('product_variant_id, id, quantity')
      .eq('cart_id', targetCartId)
      .in('product_variant_id', variantIds);

    if (batchFindError) throw new Error(`批量查詢現有商品失敗: ${batchFindError.message}`);

    const existingItemsMap = new Map(existingItems.map(item => [item.product_variant_id, { id: item.id, quantity: item.quantity }]));

    const itemsToUpdate: Array<{id: string, quantity: number}> = [];
    const itemsToInsert: Array<any> = [];

    for (const sourceItem of sourceItems) {
      const existingItem = existingItemsMap.get(sourceItem.product_variant_id);
      
      if (existingItem) {
        const newQuantity = existingItem.quantity + sourceItem.quantity;
        itemsToUpdate.push({ id: existingItem.id, quantity: newQuantity });
      } else {
        delete sourceItem.id;
        delete sourceItem.cart_id;
        itemsToInsert.push({ ...sourceItem, cart_id: targetCartId });
      }
    }

    if (itemsToUpdate.length > 0) {
      console.log(`[merge] 批量更新 ${itemsToUpdate.length} 個商品的數量...`);
      for (const updateItem of itemsToUpdate) {
        const { error: updateError } = await supabaseAdmin.from('cart_items').update({ quantity: updateItem.quantity }).eq('id', updateItem.id);
        if (updateError) {
          console.error(`[merge] 更新商品 ID ${updateItem.id} 失敗:`, updateError.message);
          itemsSkipped++;
        } else {
          itemsMerged++;
        }
      }
    }

    if (itemsToInsert.length > 0) {
      console.log(`[merge] 批量新增 ${itemsToInsert.length} 個新商品...`);
      const { data: insertResult, error: batchInsertError } = await supabaseAdmin.from('cart_items').insert(itemsToInsert).select('id');
      if (batchInsertError) {
        console.error(`[merge] 批量新增商品失敗:`, batchInsertError.message);
        itemsSkipped += itemsToInsert.length;
      } else {
        const successfulInserts = insertResult?.length || 0;
        itemsMerged += successfulInserts;
        console.log(`[merge] 成功批量新增 ${successfulInserts} 個商品`);
      }
    }

    console.log(`[merge] 開始清理匿名購物車資料...`);
    await supabaseAdmin.from('cart_items').delete().eq('cart_id', anonCart.id);
    await supabaseAdmin.from('carts').delete().eq('id', anonCart.id);
    await supabaseAdmin.auth.admin.deleteUser(anonymous_uid).catch(e => console.warn(`[merge] 刪除匿名使用者 ${anonymous_uid} 失敗:`, e.message));

    const responseMessage = itemsSkipped > 0 
      ? `成功合併 ${itemsMerged} 個品項，${itemsSkipped} 個品項因錯誤被跳過。`
      : `成功合併 ${itemsMerged} 個品項。`;

    return new Response(JSON.stringify({ 
      success: true, 
      message: responseMessage,
      details: { totalItems: sourceItems.length, itemsMerged, itemsSkipped }
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[merge-user-data] 函式發生嚴重錯誤:', error.message, error.stack);
    return new Response(JSON.stringify({ error: error.message, success: false }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
})