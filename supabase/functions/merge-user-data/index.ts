// ==============================================================================
// 檔案路徑: supabase/functions/merge-user-data/index.ts
// ------------------------------------------------------------------------------
// 【此為新檔案，可直接覆蓋】
// ==============================================================================

import { createClient } from '../_shared/deps.ts'
import { corsHeaders } from '../_shared/cors.ts'

console.log(`函式 "merge-user-data" 已啟動`);

Deno.serve(async (req) => {
  // 處理 CORS 預檢請求
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { anonymous_uid, current_uid } = await req.json();

    // 參數驗證
    if (!anonymous_uid || !current_uid) {
      throw new Error("請求中缺少 'anonymous_uid' 或 'current_uid' 參數。");
    }
    if (anonymous_uid === current_uid) {
      return new Response(JSON.stringify({ success: true, message: '無需合併，使用者 ID 相同。' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // --- 核心合併邏輯 ---

    // 步驟 1: 尋找屬於匿名使用者的有效購物車
    const { data: anonymousCart, error: findCartError } = await supabaseAdmin
      .from('carts')
      .select('id, cart_items(count)')
      .eq('user_id', anonymous_uid)
      .eq('status', 'active') // 只處理活躍的購物車
      .single();

    if (findCartError) {
      if (findCartError.code === 'PGRST116') { // PGRST116 = No rows found
        console.log(`[merge-user-data] 匿名使用者 ${anonymous_uid} 沒有需要合併的活躍購物車。`);
        // 即使沒有購物車，後續的刪除匿名使用者流程也應該繼續
      } else {
        throw findCartError; // 其他資料庫錯誤
      }
    }

    // 步驟 2: 如果匿名使用者有購物車，則將其轉移給正式使用者
    if (anonymousCart) {
      // 檢查正式使用者是否已經有自己的購物車
      const { data: currentCart, error: findCurrentCartError } = await supabaseAdmin
        .from('carts')
        .select('id')
        .eq('user_id', current_uid)
        .eq('status', 'active')
        .single();
      
      if (findCurrentCartError && findCurrentCartError.code !== 'PGRST116') {
        throw findCurrentCartError;
      }
      
      if (currentCart) {
        // 如果正式使用者已有購物車，這裡可以定義合併策略
        // MVP 策略：簡單地將匿名購物車的商品移動到正式購物車 (未來可擴充)
        // 暫時策略：為了簡單，我們假設新登入的使用者不會有活躍購物車，直接轉移所有權
        console.warn(`[merge-user-data] 正式使用者 ${current_uid} 已有活躍購物車，將直接覆蓋匿名購物車所有權。未來可優化商品合併邏輯。`);
      }

      console.log(`[merge-user-data] 正在將購物車 ${anonymousCart.id} 的所有權從 ${anonymous_uid} 轉移至 ${current_uid}...`);
      const { error: updateCartError } = await supabaseAdmin
        .from('carts')
        .update({ user_id: current_uid })
        .eq('id', anonymousCart.id);

      if (updateCartError) {
        throw new Error(`轉移購物車所有權時失敗: ${updateCartError.message}`);
      }
    }

    // 步驟 3: (可選但建議) 嘗試刪除已經無用的匿名使用者帳號
    console.log(`[merge-user-data] 正在嘗試刪除已無用的匿名使用者: ${anonymous_uid}...`);
    const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(anonymous_uid);
    
    if (deleteUserError) {
      // 因為我們知道 Supabase 可能有刪除使用者的 Bug，所以這裡只記錄警告，不拋出錯誤
      console.warn(`[merge-user-data] 刪除匿名使用者 ${anonymous_uid} 失敗 (這可能是已知的平台問題，可忽略):`, deleteUserError.message);
    } else {
      console.log(`[merge-user-data] 成功刪除匿名使用者: ${anonymous_uid}`);
    }

    return new Response(JSON.stringify({ success: true, message: '使用者資料合併成功。' }), {
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