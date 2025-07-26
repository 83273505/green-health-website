// 檔案路徑: supabase/functions/get-or-create-cart/index.ts (Hybrid Power - Final Version)

// ✅ 【最終修正】我們換回已被證明可以成功載入的 esm.sh 來源
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
      // ✅ 同時保留 Deno 環境中防止 client 意外關閉的推薦選項
      { global: { fetch: fetch.bind(globalThis) } }
    )
    
    // 從請求標頭中獲取使用者認證資訊
    const authHeader = req.headers.get('Authorization')
    
    // ✅ 保留優化後的、更健壯的全新訪客處理邏輯
    if (!authHeader || authHeader === 'Bearer null') {
      const { data: anonUser, error: anonError } = await supabaseAdmin.auth.signInAnonymously()
      if (anonError || !anonUser.user) throw anonError || new Error('建立匿名使用者失敗。')

      const { data: newCart, error: newCartError } = await supabaseAdmin
        .from('carts')
        .insert({ user_id: anonUser.user.id, status: 'active' })
        .select('id')
        .single()

      if (newCartError) throw newCartError

      return new Response(JSON.stringify({ cartId: newCart.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // 如果有 Authorization 標頭，則解析使用者
    const { data: { user } } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''))
    if (!user) throw new Error('無效的使用者 token。')

    let cartId: string;

    // 嘗試為該使用者尋找一個已存在的 active 購物車
    const { data: existingCart, error: cartError } = await supabaseAdmin
      .from('carts')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()

    if (cartError && cartError.code !== 'PGRST116') throw cartError;

    if (existingCart) {
      cartId = existingCart.id;
    } else {
      // 如果找不到，則為該使用者建立一個新的購物車
      const { data: newCart, error: newCartError } = await supabaseAdmin
        .from('carts')
        .insert({ user_id: user.id, status: 'active' })
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
    // 增加詳細的錯誤日誌，方便在 Supabase 後台追蹤問題
    console.error('在 get-or-create-cart 中發生錯誤:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})