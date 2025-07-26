// 檔案路徑: supabase/functions/set-default-address/index.ts (Final Correct Version)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// 在函式內部直接定義 CORS 標頭，確保穩定性
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // 處理瀏覽器的 CORS 預檢請求
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 建立一個具有服務角色的 Supabase client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    
    // 獲取並驗證使用者身份
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Authorization header is missing')
    
    const { data: { user } } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''))
    if (!user) throw new Error('User not authenticated or invalid token')

    // 從請求的 body 中解析出要設定為預設的地址 ID
    const { addressId } = await req.json()
    if (!addressId) throw new Error('Address ID is required in the request body')

    // --- 核心事務邏輯 ---
    // 1. 將該使用者所有的地址都設為非預設 (is_default = false)
    const { error: resetError } = await supabaseAdmin
      .from('addresses')
      .update({ is_default: false })
      .eq('user_id', user.id)

    if (resetError) throw resetError

    // 2. 將指定的地址 ID 設為預設 (is_default = true)
    const { error: setError } = await supabaseAdmin
      .from('addresses')
      .update({ is_default: true })
      .eq('id', addressId)
      .eq('user_id', user.id) // 雙重確認這個地址確實屬於該用戶，增加安全性

    if (setError) throw setError

    // 如果一切順利，回傳成功訊息
    return new Response(JSON.stringify({ message: 'Default address updated successfully' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    // 如果過程中發生任何錯誤，回傳具體的錯誤訊息
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})