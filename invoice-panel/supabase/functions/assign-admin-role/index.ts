// 檔案路徑: supabase/functions/assign-admin-role/index.ts
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
    const { userId, role } = await req.json()
    if (!userId || !role) {
      throw new Error("請求 Body 中缺少 userId 或 role 參數")
    }
    
    // 建立一個具有最高權限的 Supabase Admin Client
    // 它會從 Edge Function 的環境變數 (Secrets) 中讀取金鑰
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 使用 Supabase Admin API 為特定使用者更新 app_metadata
    // 這是高權限操作，只能在安全的後端環境中執行
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { app_metadata: { roles: [role] } } // 'roles' 是一個陣列，方便未來擴充
    )

    if (error) throw error

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('[assign-admin-role] 函式錯誤:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})