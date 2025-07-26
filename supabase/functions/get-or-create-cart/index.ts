// 檔案路徑: supabase/functions/get-or-create-cart/index.ts (Official Import - Final Version)

// ✅ 【最終修正】改用 Supabase 官方推薦的 Deno 模組來源，以獲得最佳穩定性和相容性
import { createClient } from 'https://deno.land/x/supabase/mod.ts'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  // 處理 CORS 預檢請求
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 建立一個具有服務角色的 Supabase client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      // 這是 Deno 環境中防止 client 意外關閉的推薦選項
      { global: { fetch: fetch.bind(globalThis) } }
    )
    
    // 從請求標頭中獲取使用者認證資訊
    const authHeader = req.headers.get('Authorization')
    
    // ✅ 【邏輯優化】如果沒有 Authorization 標頭，或 token 為 null，
    // 這代表是一個全新的訪客，我們直接為其建立匿名 session 和購物車。
    if (!authHeader || authHeader === 'Bearer null') {
        const { data: anonUser, error: anonError } = await supabaseAdmin.auth.signInAnonymously()
        if (anonError || !anonUser.user) throw anonError || new Error('建立匿名使用者失敗。')
        
        const { data: newCart, error: newCartError } = await supabaseAdmin
            .from('carts')
            .insert({ user_id: anonUser.user.id, status: 'active' })
            .select('id')
            .single()
        
        if (newCartError) throw newCartError
        
        // 成功建立後，直接回傳新的 cartId
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

    // 如果查詢時發生錯誤，但不是「找不到資料列」的錯誤，則拋出
    if (cartError && cartError.code !== 'PGRST116') throw cartError;

    if (existingCart) {
      // 如果找到了，就使用現有的 cartId
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
    // 現在，如果 try 區塊內有任何錯誤，我們應該能在這裡的日誌中看到它
    console.error('在 get-or-create-cart 中發生錯誤:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})