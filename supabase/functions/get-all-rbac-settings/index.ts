// ==============================================================================
// 檔案路徑: supabase/functions/get-all-rbac-settings/index.ts
// 版本: v25.1 - 權限管理儀表板
// ------------------------------------------------------------------------------
// 【此為新檔案，可直接覆蓋】
// ==============================================================================

import { createClient } from '../_shared/deps.ts'
import { corsHeaders } from '../_shared/cors.ts'

console.log(`函式 "get-all-rbac-settings" (v25.1) 已啟動`);

// --- Edge Function 主邏輯 ---

Deno.serve(async (req) => {
  // 處理 CORS 預檢請求
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    // 步驟 1: 驗證使用者並獲取其權限
    const { data: { user } } = await supabaseAdmin.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: '使用者未授權' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const userPermissions = user.app_metadata?.permissions || [];

    // 步驟 2: 進行權限檢查
    // 只有擁有 'module:permissions:view' 權限的使用者才能繼續
    if (!userPermissions.includes('module:permissions:view')) {
        return new Response(JSON.stringify({ error: '權限不足，無法存取權限設定。' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 步驟 3: (平行處理) 一次性獲取所有 RBAC 相關的表格資料
    const [rolesRes, permissionsRes, rolePermissionsRes] = await Promise.all([
      supabaseAdmin.from('roles').select('*').order('name', { ascending: true }),
      supabaseAdmin.from('permissions').select('*').order('name', { ascending: true }),
      supabaseAdmin.from('role_permissions').select('*')
    ]);

    // 檢查是否有任何一個查詢出錯
    if (rolesRes.error) throw new Error(`查詢角色時發生錯誤: ${rolesRes.error.message}`);
    if (permissionsRes.error) throw new Error(`查詢權限時發生錯誤: ${permissionsRes.error.message}`);
    if (rolePermissionsRes.error) throw new Error(`查詢角色權限關聯時發生錯誤: ${rolePermissionsRes.error.message}`);

    // 步驟 4: 將所有資料打包成一個物件回傳給前端
    const rbacSettings = {
      roles: rolesRes.data,
      permissions: permissionsRes.data,
      role_permissions: rolePermissionsRes.data
    };

    return new Response(JSON.stringify(rbacSettings), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[get-all-rbac-settings] 函式發生嚴重錯誤:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});