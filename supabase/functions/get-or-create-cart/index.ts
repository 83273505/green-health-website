// 檔案路徑: supabase/functions/get-or-create-cart/index.ts

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

    if (authHeader && authHeader.startsWith('Bearer ')) {
        const { data: { user } } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''));
        if (user) {
            userId = user.id;
        }
    }

    let cartId = null;

    if (userId) {
      const { data: existingCart, error: cartError } = await supabaseAdmin
        .from('carts')
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'active')
        .single();
      if (cartError && cartError.code !== 'PGRST116') throw cartError;
      if (existingCart) {
        cartId = existingCart.id;
      }
    }
    
    if (!cartId) {
      if (!userId) {
        const { data: anonUser, error: anonError } = await supabaseAdmin.auth.signInAnonymously();
        if (anonError || !anonUser.user) throw anonError || new Error('建立匿名使用者失敗。');
        userId = anonUser.user.id;
      }
      const { data: newCart, error: newCartError } = await supabaseAdmin
        .from('carts')
        .insert({ user_id: userId, status: 'active' })
        .select('id')
        .single();
      if (newCartError) throw newCartError;
      cartId = newCart.id;
    }

    return new Response(JSON.stringify({ cartId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    // ✅ 【關鍵修正】捕捉所有錯誤，記錄日誌，並回傳 500
    console.error('[get-or-create-cart] 函式內部錯誤:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})