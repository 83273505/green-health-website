// 檔案路徑: supabase/functions/manage-user-role/index.ts
// ----------------------------------------------------
// 【此為新檔案，請建立對應資料夾與檔案】
// ----------------------------------------------------

import { createClient } from '../_shared/deps.ts'
import { corsHeaders } from '../_shared/cors.ts'

// 在此處定義超級管理員的 User ID
const SUPER_ADMIN_USER_ID = '5965d1c4-599b-41b4-b544-439eaf295800';
const WAREHOUSE_STAFF_ROLE = 'warehouse_staff';

console.log(`函式 "manage-user-role" 已啟動`);

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

    const { data: { user: callingUser } } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''));
    if (!callingUser) throw new Error('無效的使用者憑證。');
    
    // 【核心權限檢查】確認呼叫者是否為超級管理員
    if (callingUser.id !== SUPER_ADMIN_USER_ID) {
      throw new Error('權限不足，只有超級管理員才能管理角色。');
    }
    
    // --- 主邏輯 ---
    const { targetUserId, action } = await req.json();
    if (!targetUserId || !action || !['grant', 'revoke'].includes(action)) {
      throw new Error('缺少或無效的 targetUserId 或 action 參數。');
    }
    
    // 不允許超級管理員修改自己的角色
    if (targetUserId === SUPER_ADMIN_USER_ID) {
        throw new Error('無法修改超級管理員自身的權限。');
    }

    // 獲取目標使用者目前的 metadata
    const { data: { user: targetUser }, error: targetUserError } = await supabaseAdmin.auth.admin.getUserById(targetUserId);
    if (targetUserError) throw new Error('找不到目標使用者。');
    
    let currentRoles = targetUser.app_metadata?.roles || [];
    let updatedRoles;

    if (action === 'grant') {
      // 使用 Set 來避免重複加入角色
      updatedRoles = [...new Set([...currentRoles, WAREHOUSE_STAFF_ROLE])];
    } else { // action === 'revoke'
      updatedRoles = currentRoles.filter(role => role !== WAREHOUSE_STAFF_ROLE);
    }
    
    // 更新目標使用者的 app_metadata
    const { data: { user: updatedUser }, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      targetUserId,
      { app_metadata: { roles: updatedRoles } }
    );

    if (updateError) throw updateError;

    return new Response(JSON.stringify({ success: true, updatedUser: { id: updatedUser.id, email: updatedUser.email, roles: updatedUser.app_metadata.roles } }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('[manage-user-role] 函式錯誤:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})