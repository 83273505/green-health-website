// ==============================================================================
// 檔案路徑: supabase/functions/get-or-create-cart/index.ts
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ------------------------------------------------------------------------------

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
      { auth: { persistSession: false } }
    )
    
    const authHeader = req.headers.get('Authorization');
    let user = null;
    let session = null;

    // 步驟 1: 嘗試從 Authorization 標頭中獲取已登入的使用者
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const { data } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''));
        if (data.user) {
            user = data.user;
        }
    }

    // 步驟 2: 如果沒有已登入的使用者，則建立一個匿名使用者
    if (!user) {
        const { data: anonData, error: anonError } = await supabaseAdmin.auth.signInAnonymously();
        if (anonError || !anonData.user) {
          throw anonError || new Error('建立匿名使用者失敗。');
        }
        user = anonData.user;
        session = anonData.session; // 只有匿名使用者才需要立即獲取 session
    }
    
    // 【核心修改】檢查使用者是否有 email，以此判斷是否為匿名
    const isAnonymous = !user.email;
    const userId = user.id;

    // 步驟 3: 為使用者找到或建立一個活躍的購物車
    const { data: cart, error: cartError } = await supabaseAdmin
      .from('carts')
      .upsert(
        { user_id: userId, status: 'active' },
        { onConflict: 'user_id' }
      )
      .select('id')
      .single();

    if (cartError) throw cartError;

    // 步驟 4: 回傳包含匿名狀態和 token 的完整資料
    return new Response(JSON.stringify({ 
        cartId: cart.id,
        isAnonymous: isAnonymous,
        // 如果是匿名使用者，將其 session 的 access token 回傳給前端
        accessToken: isAnonymous ? session.access_token : null 
    }), {
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