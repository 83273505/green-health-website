// 檔案路徑: supabase/functions/get-or-create-cart/index.ts (Fault-Tolerant Final Version)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
    
    let userId: string | null = null;

    // ✅ 【关键修正】我们不再假设 Authorization 标头一定存在
    const authHeader = req.headers.get('Authorization');
    
    if (authHeader) {
        try {
            const { data: { user } } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''));
            if (user) {
                userId = user.id;
            }
        } catch (e) {
            console.warn("无法解析 Authorization 标头，将视为匿名使用者处理:", e.message);
        }
    }

    let cartId: string | null = null;
    
    // 如果我们成功地从 Token 中解析出了使用者 ID
    if (userId) {
      const { data: existingCart } = await supabaseAdmin
        .from('carts')
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'active')
        .single();
      if (existingCart) {
        cartId = existingCart.id;
      }
    }
    
    // 如果最终没有找到 cartId (无论是匿名访客，还是没有购物车的已登入使用者)
    if (!cartId) {
      // 如果连 userId 都没有，代表是全新的匿名访客，需要为他建立一个匿名身份
      if (!userId) {
        const { data: anonUser, error: anonError } = await supabaseAdmin.auth.signInAnonymously();
        if (anonError || !anonUser.user) throw anonError || new Error('建立匿名使用者失败。');
        userId = anonUser.user.id;
      }

      // 为这个使用者 (无论是刚建立的匿名使用者，还是没有购物车的正式使用者) 建立一个新购物车
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
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500, // 改为 500，因为这代表了非预期的内部错误
    })
  }
})