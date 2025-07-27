// 檔案路徑: supabase/functions/get-or-create-cart/index.ts (Final Logic Fix - Traditional Chinese)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // 處理 CORS 預檢請求
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    
    const authHeader = req.headers.get('Authorization');
    let userId = null;

    // 嘗試從授權標頭中獲取使用者 ID
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const { data: { user } } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''));
        if (user) {
            userId = user.id;
        }
    }

    // 如果是全新訪客 (沒有 token)，則建立一個匿名使用者
    if (!userId) {
        const { data: anonUser, error: anonError } = await supabaseAdmin.auth.signInAnonymously();
        if (anonError || !anonUser.user) throw anonError || new Error('建立匿名使用者失敗。');
        userId = anonUser.user.id;
    }

    // ✅ 【關鍵修正】使用 upsert 來智能地處理購物車的建立或狀態恢復
    // upsert 會嘗試根據 onConflict 指定的唯一鍵 (user_id) 去尋找記錄。
    // 如果找到了，就會更新它的 status 為 'active'。
    // 如果沒找到，就會插入一筆新的、status 為 'active' 的記錄。
    // 這是一個單一的、原子性的操作，完美解決了之前的 duplicate key 錯誤。
    const { data: cart, error: cartError } = await supabaseAdmin
      .from('carts')
      .upsert(
        { user_id: userId, status: 'active' }, // 我們期望的最終狀態
        { onConflict: 'user_id' } // 告訴 upsert 檢查 user_id 這個 UNIQUE 鍵是否已存在
      )
      .select('id')
      .single();

    if (cartError) throw cartError;

    // 回傳最終確保存在的購物車的 ID
    return new Response(JSON.stringify({ cartId: cart.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('[get-or-create-cart] 函式內部錯誤:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})