// ==============================================================================
// 檔案路徑: supabase/functions/merge-user-data/index.ts
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋 - 防彈等級優化版】
// ==============================================================================

import { createClient } from '../_shared/deps.ts'
import { corsHeaders } from '../_shared/cors.ts'

console.log(`函式 "merge-user-data" (v4 - 防彈版) 已啟動`);

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
      return new Response(JSON.stringify({ success: true, message: '無需合併，使用者 ID 相同。' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    console.log(`[merge] 開始合併流程: ${anonymous_uid} -> ${current_uid}`);

    // --- 防彈等級合併邏輯 ---

    console.log(`[merge] 步驟 1: 查詢匿名使用者購物車 (${anonymous_uid})`);
    const { data: anonCart, error: findAnonCartError } = await supabaseAdmin
      .from('carts')
      .select('id, cart_items(*)')
      .eq('user_id', anonymous_uid)
      .eq('status', 'active')
      .maybeSingle();

    if (findAnonCartError) {
      throw new Error(`查詢匿名購物車時出錯: ${findAnonCartError.message}`);
    }

    if (!anonCart || !anonCart.cart_items || anonCart.cart_items.length === 0) {
      console.log(`[merge] 匿名使用者無活躍購物車或購物車為空，準備清理匿名使用者`);
      try {
        await supabaseAdmin.auth.admin.deleteUser(anonymous_uid);
        console.log(`[merge] 成功刪除無購物車的匿名使用者 ${anonymous_uid}`);
      } catch (e) {
        console.warn(`[merge] 刪除匿名使用者失敗: ${e.message}`);
      }
      return new Response(JSON.stringify({ success: true, message: '匿名使用者無活躍購物車，無需合併。' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    console.log(`[merge] 發現匿名購物車 ${anonCart.id}，包含 ${anonCart.cart_items.length} 個商品項目`);

    console.log(`[merge] 步驟 2: 查詢或建立正式使用者購物車 (${current_uid})`);
    let { data: currentCart, error: findCurrentCartError } = await supabaseAdmin
      .from('carts')
      .select('id')
      .eq('user_id', current_uid)
      .eq('status', 'active')
      .maybeSingle();
    
    if (findCurrentCartError) {
      throw new Error(`查詢正式購物車時出錯: ${findCurrentCartError.message}`);
    }

    if (!currentCart) {
      const { data: newCart, error: createCartError } = await supabaseAdmin.from('carts').insert({ user_id: current_uid, status: 'active' }).select('id').single();
      if (createCartError) throw new Error(`建立正式購物車失敗: ${createCartError.message}`);
      currentCart = newCart;
      console.log(`[merge] 成功建立新購物車 ${currentCart.id}`);
    } else {
      console.log(`[merge] 發現現有購物車 ${currentCart.id}`);
    }

    const targetCartId = currentCart.id;
    const sourceItems = anonCart.cart_items;
    
    console.log(`[merge] 步驟 3: 批量查詢目標購物車中的現有商品`);
    const variantIds = sourceItems.map(item => item.product_variant_id);
    const { data: existingItemsData, error: batchFindError } = await supabaseAdmin
      .from('cart_items')
      .select('product_variant_id, id, quantity')
      .eq('cart_id', targetCartId)
      .in('product_variant_id', variantIds);

    if (batchFindError) throw new Error(`批量查詢現有商品失敗: ${batchFindError.message}`);
    const existingItemsMap = new Map(existingItemsData.map(item => [item.product_variant_id, { id: item.id, quantity: item.quantity }]));

    console.log(`[merge] 步驟 4: 準備批量操作資料`);
    const itemsToUpdate: Array<{id: string, quantity: number}> = [];
    const itemsToInsert: Array<any> = [];

    for (const sourceItem of sourceItems) {
      const existingItem = existingItemsMap.get(sourceItem.product_variant_id);
      if (existingItem) {
        itemsToUpdate.push({ id: existingItem.id, quantity: existingItem.quantity + sourceItem.quantity });
      } else {
        delete sourceItem.id;
        delete sourceItem.cart_id;
        itemsToInsert.push({ ...sourceItem, cart_id: targetCartId });
      }
    }

    let itemsMerged = 0, itemsSkipped = 0, itemsUpdated = 0, itemsAdded = 0;

    console.log(`[merge] 步驟 5: 執行合併操作 (更新 ${itemsToUpdate.length} 個, 新增 ${itemsToInsert.length} 個)`);
    if (itemsToUpdate.length > 0) {
      for (const updateItem of itemsToUpdate) {
        const { error: updateError } = await supabaseAdmin.from('cart_items').update({ quantity: updateItem.quantity }).eq('id', updateItem.id);
        if (updateError) { console.error(`[merge] 更新商品 ID ${updateItem.id} 失敗:`, updateError.message); itemsSkipped++; } 
        else { itemsMerged++; itemsUpdated++; }
      }
    }

    if (itemsToInsert.length > 0) {
      const { data: insertResult, error: batchInsertError } = await supabaseAdmin.from('cart_items').insert(itemsToInsert).select('id');
      if (batchInsertError) {
        console.error(`[merge] 批量新增商品失敗:`, batchInsertError.message);
        itemsSkipped += itemsToInsert.length;
      } else {
        const successfulInserts = insertResult?.length || 0;
        itemsMerged += successfulInserts;
        itemsAdded += successfulInserts;
      }
    }
    
    console.log(`[merge] 步驟 6: 驗證合併後的購物車`);
    const { data: finalCart, error: verifyError } = await supabaseAdmin.from('carts').select('cart_items(count)').eq('id', targetCartId).single();
    if(verifyError) console.error(`[merge] 驗證合併結果失敗:`, verifyError.message);

    if (itemsMerged > 0 || sourceItems.length === 0) {
      console.log(`[merge] 步驟 7: 清理匿名購物車資料`);
      await supabaseAdmin.from('cart_items').delete().eq('cart_id', anonCart.id);
      await supabaseAdmin.from('carts').delete().eq('id', anonCart.id);
      await supabaseAdmin.auth.admin.deleteUser(anonymous_uid).catch(e => console.warn(`[merge] 刪除匿名使用者 ${anonymous_uid} 失敗:`, e.message));
    } else {
      console.warn(`[merge] ⚠️ 沒有成功合併任何商品，跳過清理步驟`);
    }

    const successMessage = `成功合併 ${itemsMerged} 個商品項目（更新 ${itemsUpdated} 個，新增 ${itemsAdded} 個）` + (itemsSkipped > 0 ? `，${itemsSkipped} 個品項因錯誤被跳過。` : '。');
    console.log(`[merge] 🎉 合併完成: ${successMessage}`);

    return new Response(JSON.stringify({ 
      success: true, message: successMessage,
      details: { totalSourceItems: sourceItems.length, itemsMerged, itemsUpdated, itemsAdded, itemsSkipped, finalCartItemCount: finalCart?.cart_items[0]?.count || 0 }
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