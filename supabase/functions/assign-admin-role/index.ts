// ==============================================================================
// 檔案路徑: supabase/functions/assign-admin-role/index.ts
// 版本: v1.0 - 安全模型重構與企業級日誌整合
// ------------------------------------------------------------------------------
// 【此為全新檔案，請建立對應資料夾與檔案】
// ==============================================================================

/**
 * @file Assign User Role Function (指派使用者角色函式)
 * @description 允許授權管理員為指定使用者新增一個角色。
 * @version v1.0
 *
 * @update v1.0 - [SECURITY REFACTOR & ENTERPRISE LOGGING]
 * 1. [核心安全修正] 徹底修復了原版中存在的災難性安全漏洞。現在強制要求
 *          呼叫者必須擁有 'permissions:users:edit' 權限才能執行操作。
 * 2. [邏輯修正] 將角色更新邏輯從「完全覆蓋」修正為「安全新增」，避免意外
 *          移除使用者現有的其他角色。
 * 3. [核心架構] 引入 `LoggingService` v2.0，並使用 `withErrorLogging` 處理異常。
 * 4. [安全稽核日誌] 對每一次角色指派操作都留下了詳細的 `audit` 級別日誌，
 *          記錄了操作者、目標使用者、以及操作前後的角色變化。
 */

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import LoggingService, { withErrorLogging } from '../_shared/services/loggingService.ts';

const FUNCTION_NAME = 'assign-admin-role';
const FUNCTION_VERSION = 'v1.0';

const REQUIRED_PERMISSION = 'permissions:users:edit';

async function mainHandler(req: Request, logger: LoggingService, correlationId: string): Promise<Response> {
  // --- 1. 權限驗證 ---
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
  
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
    return new Response(JSON.stringify({ error: '權限不足，您無法指派角色。' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
  }

  // --- 2. 輸入驗證 ---
  const { userId, role } = await req.json().catch(() => ({}));
  if (!userId || !role) {
    logger.warn('缺少 userId 或 role 參數', correlationId, { operatorId: callingUser.id });
    return new Response(JSON.stringify({ error: "請求 Body 中缺少 userId 或 role 參數" }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
  }

  logger.info('授權成功，準備為使用者指派新角色', correlationId, { operatorId: callingUser.id, targetUserId: userId, roleToAssign: role });
  
  // --- 3. 執行角色更新（安全新增模式） ---
  const { data: { user: targetUser }, error: targetUserError } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (targetUserError) {
    logger.warn('找不到目標使用者', correlationId, { operatorId: callingUser.id, targetUserId: userId });
    return new Response(JSON.stringify({ error: '找不到目標使用者。' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
  }

  const currentRoles = targetUser.app_metadata?.roles || [];
  const updatedRoles = [...new Set([...currentRoles, role])];

  const { data: { user: updatedUser }, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
    userId,
    { app_metadata: { roles: updatedRoles } }
  );

  if (updateError) throw updateError;

  // --- 4. 記錄關鍵稽核日誌並回傳成功響應 ---
  logger.audit('使用者角色已成功指派', correlationId, {
    operatorId: callingUser.id,
    targetUserId: userId,
    roleAssigned: role,
    previousRoles: currentRoles,
    updatedRoles: updatedRoles,
  });

  return new Response(JSON.stringify(updatedUser), {
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