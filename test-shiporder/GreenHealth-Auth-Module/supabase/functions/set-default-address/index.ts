// 檔案路徑: supabase/functions/set-default-address/index.ts

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
    if (!authHeader) throw new Error('缺少授權標頭(Authorization header)。');
    
    const { data: { user } } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''));
    if (!user) throw new Error('使用者未認證或權杖(token)無效。');

    const { addressId } = await req.json();
    if (!addressId) throw new Error('請求主體(body)中缺少 addressId。');

    // --- 核心事務邏輯 ---
    // 1. 將該使用者所有的地址都設為非預設
    const { error: resetError } = await supabaseAdmin
      .from('addresses')
      .update({ is_default: false })
      .eq('user_id', user.id);

    if (resetError) throw resetError;

    // 2. 將指定的地址 ID 設為預設
    const { error: setError } = await supabaseAdmin
      .from('addresses')
      .update({ is_default: true })
      .eq('id', addressId)
      .eq('user_id', user.id); // 雙重確認這個地址確實屬於該使用者，增加安全性

    if (setError) throw setError;

    return new Response(JSON.stringify({ message: '預設地址已成功更新。' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('[set-default-address] 函式內部錯誤:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})