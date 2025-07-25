// supabase/functions/get-or-create-cart/index.ts (Debug Version)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ✅ 【除錯修改】直接在函式內部定義 corsHeaders，不從外部 import。
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 後續邏輯維持不變...
    const authHeader = req.headers.get('Authorization')!
    const { data: { user } } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''))

    let cartId: string | null = null;
    let userId: string | null = user?.id || null;

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
    
    if (!cartId) {
      if (!userId) {
        const { data: anonUser, error: anonError } = await supabaseAdmin.auth.signInAnonymously()
        if (anonError) throw anonError
        if (!anonUser.user) throw new Error('Failed to create anonymous user.')
        userId = anonUser.user.id
      }

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