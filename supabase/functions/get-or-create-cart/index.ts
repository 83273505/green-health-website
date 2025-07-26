// 檔案路徑: supabase/functions/get-or-create-cart/index.ts (Robust Logic - Final Version)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  // 處理瀏覽器的 CORS 預檢請求
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 建立一個具有服務角色的 Supabase client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { global: { fetch: fetch.bind(globalThis) } }
    )

    const authHeader = req.headers.get('Authorization')
    let user_id: string; // 用於儲存最終確定的使用者 ID

    // ✅ 【邏輯嚴謹的最終修正】
    // 透過清晰的 if/else 結構，徹底分離匿名使用者和已登入使用者的處理路徑。

    // --- 路徑一：處理匿名或無 token 的使用者 ---
    if (!authHeader || authHeader === 'Bearer null' || !authHeader.startsWith('Bearer ')) {
      // 如果沒有 Authorization 標頭，或 token 無效，則視為匿名使用者
      const { data: anonSignInData, error: anonSignInError } = await supabaseAdmin.auth.signInAnonymously()
      if (anonSignInError || !anonSignInData.user) {
        console.error('匿名登入失敗:', anonSignInError?.message || '未知錯誤')
        throw new Error('無法建立匿名使用者。')
      }
      user_id = anonSignInData.user.id; // 取得新建立的匿名使用者 ID
    
    // --- 路徑二：處理已登入的使用者 ---
    } else {
      // 只有在確認存在有效的 Authorization 標頭時，才解析 token
      const token = authHeader.replace('Bearer ', '')
      const { data: { user }, error: getUserError } = await supabaseAdmin.auth.getUser(token)
      if (getUserError || !user) {
        console.error('獲取使用者失敗:', getUserError?.message || '無效的 token。')
        throw new Error('無效的使用者 token。')
      }
      user_id = user.id; // 取得已登入使用者的 ID
    }

    // --- 後續邏輯統一使用已確定的 user_id ---
    let cartId: string;

    // 嘗試為該使用者尋找一個已存在的 active 購物車
    const { data: existingCart, error: cartError } = await supabaseAdmin
      .from('carts')
      .select('id')
      .eq('user_id', user_id)
      .eq('status', 'active')
      .single()

    if (cartError && cartError.code !== 'PGRST116') throw cartError;

    if (existingCart) {
      cartId = existingCart.id;
    } else {
      // 如果找不到，則為該使用者建立一個新的購物車
      const { data: newCart, error: newCartError } = await supabaseAdmin
        .from('carts')
        .insert({ user_id: user_id, status: 'active' })
        .select('id')
        .single()

      if (newCartError) throw newCartError
      cartId = newCart.id;
    }

    // 回傳最終找到的或建立的購物車 ID
    return new Response(JSON.stringify({ cartId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('在 get-or-create-cart 中發生錯誤:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})