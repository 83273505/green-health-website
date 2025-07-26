// 檔案路徑: supabase/functions/get-or-create-cart/index.ts (Promise Await - Final Version)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

/**
 * [核心邏輯處理器]
 * 處理請求的核心業務邏輯，並確保所有非同步操作都被正確等待。
 * @param {Request} req - 傳入的請求物件
 * @returns {Promise<Response>} - 最終的回應物件
 */
async function handleRequest(req: Request): Promise<Response> {
    // 建立一個具有服務角色的 Supabase client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { global: { fetch: fetch.bind(globalThis) } }
    )
    
    const authHeader = req.headers.get('Authorization')
    let user_id: string;

    // 處理匿名或無 token 的使用者
    if (!authHeader || authHeader === 'Bearer null' || !authHeader.startsWith('Bearer ')) {
      const { data: anonSignInData, error: anonSignInError } = await supabaseAdmin.auth.signInAnonymously()
      if (anonSignInError || !anonSignInData.user) {
        throw anonSignInError || new Error('建立匿名使用者失敗。')
      }
      user_id = anonSignInData.user.id;
    } else {
      // 處理已登入的使用者
      const token = authHeader.replace('Bearer ', '')
      const { data: { user }, error: getUserError } = await supabaseAdmin.auth.getUser(token)
      if (getUserError || !user) {
        throw new Error('無效的使用者 token。')
      }
      user_id = user.id;
    }

    // 後續邏輯統一使用已確定的 user_id
    let cartId: string;
    const { data: existingCart, error: cartError } = await supabaseAdmin
      .from('carts')
      .select('id')
      .eq('user_id', user_id)
      .eq('status', 'active')
      .single();

    if (cartError && cartError.code !== 'PGRST116') throw cartError;

    if (existingCart) {
      cartId = existingCart.id;
    } else {
      const { data: newCart, error: newCartError } = await supabaseAdmin
        .from('carts')
        .insert({ user_id: user_id, status: 'active' })
        .select('id')
        .single();
      if (newCartError) throw newCartError;
      cartId = newCart.id;
    }

    // 成功回傳購物車 ID
    return new Response(JSON.stringify({ cartId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
}

// ✅ 【最終修正】
// Deno.serve 現在只負責處理請求分發和統一的錯誤捕捉。
Deno.serve(async (req) => {
  // 處理 CORS 預檢請求
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  
  try {
    // 我們明確地 await 主要邏輯函式的執行結果，以防止 EarlyDrop。
    return await handleRequest(req);
  } catch (error) {
    // 捕捉所有在 handleRequest 中可能拋出的未預期錯誤
    console.error('在 get-or-create-cart 中發生未捕捉的錯誤:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500, // 使用 500 Internal Server Error 更為合適
    });
  }
})