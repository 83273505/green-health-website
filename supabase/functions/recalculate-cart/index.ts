// 檔案路徑: supabase/functions/get-or-create-cart/index.ts (No Local Import - Final Version)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { decode } from "https://deno.land/x/djwt@v2.8/mod.ts"
// ❌ 【關鍵修正】我們不再從 '../_shared/cors.ts' 導入
// import { corsHeaders } from '../_shared/cors.ts'

/**
 * [核心邏輯處理器]
 * 處理請求的核心業務邏輯。
 */
async function handleRequest(req: Request): Promise<Response> {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { global: { fetch: fetch.bind(globalThis) } }
    )
    
    const authHeader = req.headers.get('Authorization')
    let user_id: string | null = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.replace('Bearer ', '');
        if (token && token !== 'null') {
            try {
                const [_header, payload, _signature] = decode(token);
                if (payload && payload.sub) {
                    user_id = payload.sub as string;
                }
            } catch (e) {
                console.warn("收到一個格式錯誤的 token，將視其為匿名使用者:", e.message);
            }
        }
    }

    if (!user_id) {
        const { data: anonSignInData, error: anonSignInError } = await supabaseAdmin.auth.signInAnonymously();
        if (anonSignInError || !anonSignInData.user) {
            throw anonSignInError || new Error('建立匿名使用者失敗。');
        }
        user_id = anonSignInData.user.id;
    }

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

    // 注意：這裡的回應標頭會在 Deno.serve 中被加上 CORS 標頭
    return new Response(JSON.stringify({ cartId }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
}

/**
 * [主服務處理器]
 * 負責請求分發和統一的錯誤與 CORS 處理。
 */
Deno.serve(async (req) => {
  // ✅ 【關鍵修正】直接在函式作用域的頂部定義 CORS 標頭
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  // 處理 CORS 預檢請求
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  
  try {
    // 呼叫核心邏輯處理器
    const response = await handleRequest(req);
    // 為最終的回應動態加上 CORS 標頭
    for (const [key, value] of Object.entries(corsHeaders)) {
        response.headers.set(key, value);
    }
    return response;

  } catch (error) {
    console.error('在 get-or-create-cart 中發生未捕捉的錯誤:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
})