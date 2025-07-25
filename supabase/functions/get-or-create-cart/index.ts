// supabase/functions/get-or-create-cart/index.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  // 處理瀏覽器的 preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 建立一個具有服務角色的 Supabase client，以便擁有更高權限
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 從請求標頭中獲取 JWT (無論是匿名還是正式)
    const authHeader = req.headers.get('Authorization')!
    const { data: { user } } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''))

    let cartId: string | null = null;
    let userId: string | null = user?.id || null;

    // 情況 1: 使用者已登入 (無論是正式帳號還是之前建立的匿名帳號)
    if (userId) {
      const { data: existingCart, error: cartError } = await supabaseAdmin
        .from('carts')
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'active')
        .single()

      if (cartError && cartError.code !== 'PGRST116') throw cartError;

      if (existingCart) {
        cartId = existingCart.id;
      }
    }
    
    // 情況 2: 如果找不到使用者 ID，或使用者有 ID 但沒有 active 的購物車
    if (!cartId) {
      // 如果連 userId 都沒有，說明是全新訪客，需要建立一個匿名使用者
      if (!userId) {
        const { data: anonUser, error: anonError } = await supabaseAdmin.auth.signInAnonymously()
        if (anonError) throw anonError
        if (!anonUser.user) throw new Error('Failed to create anonymous user.')
        userId = anonUser.user.id
      }

      // 為這個 (可能是新建立的匿名) 使用者建立一個新的購物車
      const { data: newCart, error: newCartError } = await supabaseAdmin
        .from('carts')
        .insert({ user_id: userId, status: 'active' })
        .select('id')
        .single()
      
      if (newCartError) throw newCartError
      cartId = newCart.id;
    }

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