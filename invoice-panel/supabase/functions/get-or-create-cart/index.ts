// 檔案路徑: supabase/functions/get-or-create-cart/index.ts
// ----------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ----------------------------------------------------

// 【核心修正】從 deps.ts 引入依賴
import { createClient } from '../_shared/deps.ts'
import { corsHeaders } from '../_shared/cors.ts'

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

    // 嘗試從 Authorization 標頭中獲取已登入的使用者 ID
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const { data: { user } } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''));
        if (user) {
            userId = user.id;
        }
    }

    // 如果沒有已登入的使用者，則建立一個匿名使用者
    if (!userId) {
        const { data: anonUser, error: anonError } = await supabaseAdmin.auth.signInAnonymously();
        if (anonError || !anonUser.user) throw anonError || new Error('建立匿名使用者失敗。');
        userId = anonUser.user.id;
    }

    // 使用 upsert 來為使用者找到或建立一個活躍的購物車
    const { data: cart, error: cartError } = await supabaseAdmin
      .from('carts')
      .upsert(
        { user_id: userId, status: 'active' },
        { onConflict: 'user_id' } // 如果 user_id 已存在，則不執行任何操作
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
    return new Response(JSON.stringify({ error: `[get-or-create-cart]: ${error.message}` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})