// ==============================================================================
// 檔案路徑: supabase/functions/manage-role-permission/index.ts
// 版本: v29.1 - 鏡像 warehouse-panel
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

import { createClient } from '../_shared/deps.ts'
import { corsHeaders } from '../_shared/cors.ts'

console.log(`函式 "manage-role-permission" (v29.1) 已啟動`);

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
    // 只有擁有 'permissions:users:edit' 權限的使用者才能繼續
    if (!userPermissions.includes('permissions:users:edit')) {
        return new Response(JSON.stringify({ error: '權限不足，您無法修改權限設定。' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 步驟 3: 解析從前端傳來的請求內容
    const { roleId, permissionId, action } = await req.json();
    if (!roleId || !permissionId || !['grant', 'revoke'].includes(action)) {
      return new Response(JSON.stringify({ error: '請求參數無效或不完整。' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 步驟 4: 根據 action 執行對應的資料庫操作
    if (action === 'grant') {
      // 賦予權限：在 role_permissions 表中插入一筆新記錄
      const { error } = await supabaseAdmin
        .from('role_permissions')
        .insert({ role_id: roleId, permission_id: permissionId });

      if (error) throw new Error(`賦予權限時發生錯誤: ${error.message}`);

    } else if (action === 'revoke') {
      // 撤銷權限：從 role_permissions 表中刪除對應的記錄
      const { error } = await supabaseAdmin
        .from('role_permissions')
        .delete()
        .eq('role_id', roleId)
        .eq('permission_id', permissionId);

      if (error) throw new Error(`撤銷權限時發生錯誤: ${error.message}`);
    }

    // 步驟 5: 回傳成功訊息
    return new Response(JSON.stringify({ success: true, message: `權限已成功 ${action === 'grant' ? '賦予' : '撤銷'}` }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[manage-role-permission] 函式發生嚴重錯誤:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});