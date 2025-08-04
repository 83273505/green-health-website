// 檔案路徑: supabase/functions/search-users/index.ts
// ----------------------------------------------------
// 【此為新檔案，請建立對應資料夾與檔案】
// ----------------------------------------------------

import { createClient } from '../_shared/deps.ts'
import { corsHeaders } from '../_shared/cors.ts'

// 在此處定義超級管理員的 User ID
const SUPER_ADMIN_USER_ID = '5965d1c4-599b-41b4-b544-439eaf295800';

console.log(`函式 "search-users" 已啟動`);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // --- 安全性檢查 ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('缺少授權標頭。');

    const { data: { user } } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''));
    if (!user) throw new Error('無效的使用者憑證。');
    
    // 【核心權限檢查】確認呼叫者是否為超級管理員
    if (user.id !== SUPER_ADMIN_USER_ID) {
      throw new Error('權限不足，只有超級管理員才能搜尋使用者。');
    }
    
    // --- 主邏輯 ---
    const { emailQuery } = await req.json();
    if (typeof emailQuery !== 'string') {
      throw new Error('缺少或無效的 emailQuery 參數。');
    }

    // 使用 Admin API 列出使用者
    // 注意：listUsers API 較耗資源，此處做基本的分頁與過濾
    const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 50, // 限制一次最多搜尋 50 筆
      query: emailQuery, // Supabase 會進行模糊比對
    });

    if (listError) throw listError;
    
    // 只回傳前端需要的最小資訊集，避免洩漏敏感資料
    const formattedUsers = users.map(u => ({
      id: u.id,
      email: u.email,
      roles: u.app_metadata?.roles || [], // 回傳目前的角色
    }));

    return new Response(JSON.stringify(formattedUsers), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('[search-users] 函式錯誤:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400, // 通常客戶端錯誤（如權限不足）回傳 400
    })
  }
})