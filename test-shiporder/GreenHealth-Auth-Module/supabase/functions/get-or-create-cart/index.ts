// 檔案路徑: supabase/functions/get-or-create-cart/index.ts (JWT Parsing - Final Version)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
// 引入在 Deno 環境中使用的 JWT 解碼函式庫
import { decode } from "https://deno.land/x/djwt@v2.8/mod.ts"

/**
 * [核心邏輯處理器]
 * 處理請求的核心業務邏輯，並確保所有非同步操作都被正確等待。
 * @param {Request} req - 傳入的請求物件
 * @returns {Promise<Response>} - 最終的回應物件
 */
async function handleRequest(req: Request): Promise<Response> {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { global: { fetch: fetch.bind(globalThis) } }
    )
    
    const authHeader = req.headers.get('Authorization')
    let user_id: string | null = null;

    // ✅ 【釜底抽薪的最終修正】
    // 我們不再依賴不穩定的 auth.getUser()，而是直接解碼 JWT 來判斷使用者身份。
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.replace('Bearer ', '');
        if (token && token !== 'null') {
            try {
                // 解碼 JWT，但不驗證簽名 (因為 Supabase 網關已處理驗證)
                const [_header, payload, _signature] = decode(token);
                // 檢查 payload 中是否存在 'sub' (使用者 ID) 這個聲明 (claim)
                if (payload && payload.sub) {
                    user_id = payload.sub as string;
                }
            } catch (e) {
                console.warn("收到一個格式錯誤的 token，將視其為匿名使用者:", e.message);
                // 如果 token 格式錯誤，則忽略它，繼續走匿名流程，user_id 保持為 null
            }
        }
    }

    // 如果經過解碼後，我們依然沒有得到一個 user_id，
    // 這就代表這是一個全新的訪客，或者他持有的 token 已失效或為匿名 token。
    if (!user_id) {
        const { data: anonSignInData, error: anonSignInError } = await supabaseAdmin.auth.signInAnonymously();
        if (anonSignInError || !anonSignInData.user) {
            throw anonSignInError || new Error('建立匿名使用者失敗。');
        }
        user_id = anonSignInData.user.id;
    }

    // --- 後續邏輯完全不變，統一使用已確定的 user_id ---
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

    return new Response(JSON.stringify({ cartId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
}

// Deno.serve 現在只負責處理請求分發和統一的錯誤捕捉
Deno.serve(async (req) => {
  // 處理 CORS 預檢請求
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  try {
    // 我們明確地 await 主要邏輯函式的執行結果
    return await handleRequest(req);
  } catch (error) {
    console.error('在 get-or-create-cart 中發生未捕捉的錯誤:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
})