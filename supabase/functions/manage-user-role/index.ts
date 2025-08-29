// ==============================================================================
// 檔案路徑: supabase/functions/manage-user-role/index.ts
// 版本: v1.0 - 安全模型重構與企業級日誌整合
// ------------------------------------------------------------------------------
// 【此為全新檔案，請建立對應資料夾與檔案】
// ==============================================================================

/**
 * @file Manage User Role Function (管理使用者角色函式)
 * @description 允許授權管理員為指定使用者賦予或撤銷 'warehouse_staff' 角色。
 * @version v1.0
 *
 * @update v1.0 - [SECURITY REFACTOR & ENTERPRISE LOGGING]
 * 1. [核心安全修正] 移除了硬式編碼的 SUPER_ADMIN_USER_ID，改為檢查呼叫者是否
 *          擁有 'permissions:users:edit' 權限。這使得權限模型更具擴充性、
 *          安全性，並與平台其他管理功能保持一致。
 * 2. [核心架構] 引入 `LoggingService` v2.0，並使用 `withErrorLogging` 處理異常。
 * 3. [安全稽核日誌] 對每一次角色變更都留下了詳細的 `audit` 級別日誌，記錄了
 *          操作者、目標使用者、操作類型及角色變更前後的狀態。
 */

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import LoggingService, { withErrorLogging } from '../_shared/services/loggingService.ts';

const FUNCTION_NAME = 'manage-user-role';
const FUNCTION_VERSION = 'v1.0';

const WAREHOUSE_STAFF_ROLE = 'warehouse_staff';
const REQUIRED_PERMISSION = 'permissions:users:edit';

async function mainHandler(
  req: Request,
  logger: LoggingService,
  correlationId: string
): Promise<Response> {
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // --- 1. 權限驗證 ---
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
      logger.warn('缺少授權標頭', correlationId);
      return new Response(JSON.stringify({ error: '使用者未授權' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
  }

  const { data: { user: callingUser } } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''));
  if (!callingUser) {
    logger.warn('無效的使用者憑證', correlationId);
    return new Response(JSON.stringify({ error: '無效的使用者憑證。' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
  }

  const userPermissions = callingUser.app_metadata?.permissions || [];
  if (!userPermissions.includes(REQUIRED_PERMISSION)) {
    logger.warn('權限不足，操作被拒絕', correlationId, {
      operatorId: callingUser.id,
      requiredPermission: REQUIRED_PERMISSION,
    });
    return new Response(JSON.stringify({ error: '權限不足，您無法管理使用者角色。' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
  }

  // --- 2. 輸入驗證與業務邏輯 ---
  const { targetUserId, action } = await req.json().catch(() => ({}));
  if (!targetUserId || !['grant', 'revoke'].includes(action)) {
    logger.warn('缺少或無效的 targetUserId 或 action 參數', correlationId, { operatorId: callingUser.id, payload: { targetUserId, action } });
    return new Response(JSON.stringify({ error: '缺少或無效的 targetUserId 或 action 參數。' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
  }

  if (targetUserId === callingUser.id) {
    logger.warn('使用者嘗試修改自身角色', correlationId, { operatorId: callingUser.id });
    return new Response(JSON.stringify({ error: '無法修改自己的角色。' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
  }
  
  logger.info(`權限驗證通過，準備為目標使用者 [${action}] 角色`, correlationId, { operatorId: callingUser.id, targetUserId, action });

  // --- 3. 執行角色更新 ---
  const { data: { user: targetUser }, error: targetUserError } = await supabaseAdmin.auth.admin.getUserById(targetUserId);
  if (targetUserError) {
    logger.warn('找不到目標使用者', correlationId, { operatorId: callingUser.id, targetUserId });
    return new Response(JSON.stringify({ error: '找不到目標使用者。' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
  }

  const currentRoles = targetUser.app_metadata?.roles || [];
  let updatedRoles;

  if (action === 'grant') {
    updatedRoles = [...new Set([...currentRoles, WAREHOUSE_STAFF_ROLE])];
  } else { // action === 'revoke'
    updatedRoles = currentRoles.filter(role => role !== WAREHOUSE_STAFF_ROLE);
  }

  const { data: { user: updatedUser }, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
    targetUserId,
    { app_metadata: { roles: updatedRoles } }
  );

  if (updateError) throw updateError;

  // --- 4. 記錄關鍵稽核日誌並回傳成功響應 ---
  logger.audit(`使用者角色已成功 ${action}`, correlationId, {
    operatorId: callingUser.id,
    targetUserId: targetUserId,
    action: action,
    roleManaged: WAREHOUSE_STAFF_ROLE,
    previousRoles: currentRoles,
    updatedRoles: updatedRoles,
  });

  return new Response(JSON.stringify({ 
    success: true, 
    updatedUser: { 
      id: updatedUser.id, 
      email: updatedUser.email, 
      roles: updatedUser.app_metadata.roles 
    } 
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 200,
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const logger = new LoggingService(FUNCTION_NAME, FUNCTION_VERSION);

  // 使用 withErrorLogging 中介軟體包裹主要處理邏輯
  const wrappedHandler = withErrorLogging(mainHandler, logger);

  return await wrappedHandler(req);
});