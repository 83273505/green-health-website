// supabase/functions/get-or-create-cart/index.ts (Final Version)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// 在函式內部直接定義 CORS 標頭，確保穩定性
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // 處理瀏覽器的 CORS 預檢請求
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 建立一個具有服務角色的 Supabase client，以便擁有更高權限
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 從請求標頭中獲取使用者認證資訊
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
        // 如果連 Authorization 標頭都沒有，視為全新匿名使用者
        const { data: anonUser, error: anonError } = await supabaseAdmin.auth.signInAnonymously()
        if (anonError || !anonUser.user) throw anonError || new Error('Failed to create anonymous user.')
        
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
    if (!user) throw new Error('Invalid user token.')

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
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})