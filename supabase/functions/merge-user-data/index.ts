// ==============================================================================
// 檔案路徑: supabase/functions/merge-user-data/index.ts
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

import { createClient } from '../_shared/deps.ts'
import { corsHeaders } from '../_shared/cors.ts'

console.log(`函式 "merge-user-data" (v2 - 強化版) 已啟動`);

Deno.serve(async (req) => {
  // 處理 CORS 預檢請求
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

    // --- 強化版合併邏輯 ---

    // 步驟 1: 獲取匿名使用者的活躍購物車及所有商品項目
    const { data: anonCart, error: findAnonCartError } = await supabaseAdmin
      .from('carts')
      .select('id, cart_items(*)')
      .eq('user_id', anonymous_uid)
      .eq('status', 'active')
      .maybeSingle();

    if (findAnonCartError) throw new Error(`查詢匿名購物車時出錯: ${findAnonCartError.message}`);

    // 如果匿名使用者沒有購物車或購物車是空的，直接嘗試刪除匿名使用者並返回
    if (!anonCart || !anonCart.cart_items || anonCart.cart_items.length === 0) {
      await supabaseAdmin.auth.admin.deleteUser(anonymous_uid).catch(e => console.warn(`[merge] 刪除無購物車的匿名使用者 ${anonymous_uid} 失敗`, e.message));
      return new Response(JSON.stringify({ success: true, message: '匿名使用者無活躍購物車，無需合併。' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 步驟 2: 獲取或建立正式使用者的活躍購物車
    let { data: currentCart, error: findCurrentCartError } = await supabaseAdmin
      .from('carts')
      .select('id')
      .eq('user_id', current_uid)
      .eq('status', 'active')
      .maybeSingle();
    
    if (findCurrentCartError) throw new Error(`查詢正式購物車時出錯: ${findCurrentCartError.message}`);

    if (!currentCart) {
      const { data: newCart, error: createCartError } = await supabaseAdmin.from('carts').insert({ user_id: current_uid, status: 'active' }).select('id').single();
      if (createCartError) throw createCartError;
      currentCart = newCart;
    }

    const targetCartId = currentCart.id;
    const sourceItems = anonCart.cart_items;
    let itemsMerged = 0;
    
    console.log(`[merge] 開始合併 ${sourceItems.length} 個品項從匿名購物車 ${anonCart.id} 到正式購物車 ${targetCartId}`);

    // 步驟 3: 逐一合併商品項目
    for (const sourceItem of sourceItems) {
      const { data: existingItem, error: findItemError } = await supabaseAdmin
        .from('cart_items')
        .select('id, quantity')
        .eq('cart_id', targetCartId)
        .eq('product_variant_id', sourceItem.product_variant_id)
        .maybeSingle();
      
      if (findItemError) {
        console.error(`[merge] 查詢品項 ${sourceItem.product_variant_id} 時出錯:`, findItemError.message);
        continue; // 跳過此品項，繼續處理下一個
      }

      if (existingItem) {
        // 商品已存在，則將數量相加
        const newQuantity = existingItem.quantity + sourceItem.quantity;
        const { error: updateError } = await supabaseAdmin
          .from('cart_items')
          .update({ quantity: newQuantity })
          .eq('id', existingItem.id);
        if (updateError) console.error(`[merge] 更新品項 ${sourceItem.product_variant_id} 數量失敗:`, updateError.message);
        else itemsMerged++;
      } else {
        // 商品不存在，則新增此品項
        const { error: insertError } = await supabaseAdmin.from('cart_items').insert({
          cart_id: targetCartId,
          product_variant_id: sourceItem.product_variant_id,
          quantity: sourceItem.quantity,
          price_snapshot: sourceItem.price_snapshot,
        });
        if (insertError) console.error(`[merge] 新增品項 ${sourceItem.product_variant_id} 失敗:`, insertError.message);
        else itemsMerged++;
      }
    }

    // 步驟 4: 清理已合併的匿名購物車相關資料
    await supabaseAdmin.from('cart_items').delete().eq('cart_id', anonCart.id);
    await supabaseAdmin.from('carts').delete().eq('id', anonCart.id);
    await supabaseAdmin.auth.admin.deleteUser(anonymous_uid).catch(e => console.warn(`[merge] 刪除已合併的匿名使用者 ${anonymous_uid} 失敗`, e.message));

    return new Response(JSON.stringify({ success: true, message: `成功合併 ${itemsMerged} 個品項。` }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[merge-user-data] 函式發生嚴重錯誤:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
})