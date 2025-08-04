// 檔案路徑: supabase/functions/set-default-address/index.ts
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
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('缺少授權標頭(Authorization header)。');
    
    // 驗證 JWT 並獲取使用者
    const { data: { user } } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''));
    if (!user) throw new Error('使用者未認證或權杖(token)無效。');

    const { addressId } = await req.json();
    if (!addressId) throw new Error('請求主體(body)中缺少 addressId。');

    // --- 核心事務邏輯 ---
    // 為了確保原子性，未來可以考慮將這兩步操作包裝在一個 PostgreSQL 函式中
    
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