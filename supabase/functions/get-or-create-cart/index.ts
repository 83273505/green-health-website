// 檔案路徑: supabase/functions/get-or-create-cart/index.ts (Final Bulletproof Version)

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
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } } // 在伺服器端建議設定為 false
    )
    
    const authHeader = req.headers.get('Authorization');
    let userId = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        const { data: { user } } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''));
        if (user) {
            userId = user.id;
        }
    }

    if (!userId) {
        const { data: anonUser, error: anonError } = await supabaseAdmin.auth.signInAnonymously();
        if (anonError || !anonUser.user) throw anonError || new Error('建立匿名使用者失敗。');
        userId = anonUser.user.id;
    }

    const { data: cart, error: cartError } = await supabaseAdmin
      .from('carts')
      .upsert(
        { user_id: userId, status: 'active' },
        { onConflict: 'user_id' }
      )
      .select('id')
      .single();

    if (cartError) throw cartError;

    return new Response(JSON.stringify({ cartId: cart.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('[get-or-create-cart] 函式內部錯誤:', error.message, error.stack);
    return new Response(JSON.stringify({ error: error.message, stack: error.stack }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})