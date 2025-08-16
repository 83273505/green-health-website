// ==============================================================================
// 檔案路徑: supabase/functions/convert-anonymous-user/index.ts
// 版本: v32.4 - 後端驅動體驗
// ------------------------------------------------------------------------------
// 【此為新檔案，可直接覆蓋】
// ==============================================================================

import { createClient } from '../_shared/deps.ts'
import { corsHeaders } from '../_shared/cors.ts'

console.log(`函式 "convert-anonymous-user" (v32.4) 已啟動`);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 步驟 1: 從前端請求中獲取新密碼和匿名使用者的 JWT
    const { newPassword } = await req.json();
    const authHeader = req.headers.get('Authorization');

    if (!authHeader) {
      throw new Error('請求中缺少授權標頭 (Authorization header)。');
    }
    if (!newPassword || newPassword.length < 6) {
      throw new Error('密碼無效或長度不足 (至少需要6位數)。');
    }

    // 步驟 2: 建立一個標準的 Supabase Client，用於安全地識別使用者
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // 根據 JWT 獲取匿名使用者的資料
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error('無法根據提供的 JWT 識別使用者。');
    }

    // 步驟 3: 建立一個擁有最高權限的 Admin Client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    
    // 步驟 4: 使用 Admin Client 的特殊 API 來安全地升級使用者
    // updateUserById 只能在擁有 service_role_key 的後端環境中執行
    const { data: updatedUser, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      { password: newPassword }
    );

    if (updateError) {
      throw new Error(`升級使用者時發生錯誤: ${updateError.message}`);
    }

    // 步驟 5: 回傳成功訊息
    return new Response(
      JSON.stringify({ success: true, message: '使用者已成功轉換為正式會員。' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('[convert-anonymous-user] 函式發生嚴重錯誤:', error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400, // 通常這類錯誤是由於前端傳遞的資料有誤，所以使用 400
      }
    );
  }
});