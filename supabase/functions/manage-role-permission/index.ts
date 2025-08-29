// ==============================================================================
// 檔案路徑: supabase/functions/manage-role-permission/index.ts
// 版本: v30.0 - 企業級日誌與安全稽核整合
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Manage Role Permission Function (管理角色權限函式)
 * @description 處理對 RBAC 結構的修改，包括賦予或撤銷角色的特定權限。
 * @version v30.0
 *
 * @update v30.0 - [ENTERPRISE LOGGING & SECURITY AUDIT INTEGRATION]
 * 1. [核心架構] 引入 `LoggingService` v2.0，取代所有 `console.*` 呼叫。
 * 2. [全域錯誤捕捉] 使用 `withErrorLogging` 中介軟體處理未預期異常。
 * 3. [安全稽核日誌] 對每一次權限的賦予或撤銷操作，都留下了詳細的 `audit` 級別
 *          日誌，記錄了操作者、目標角色、目標權限及操作類型，實現了完整的
 *          安全稽核追蹤。
 * 4. [追蹤 ID] 整個請求生命週期由 `correlationId` 貫穿。
 *
 * @update v29.1 - 初始版本
 */

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import LoggingService, { withErrorLogging } from '../_shared/services/loggingService.ts';

const FUNCTION_NAME = 'manage-role-permission';
const FUNCTION_VERSION = 'v30.0';

async function mainHandler(
  req: Request,
  logger: LoggingService,
  correlationId: string
): Promise<Response> {
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
  );

  // 步驟 1: 驗證使用者並獲取其權限
  const {
    data: { user },
  } = await supabaseAdmin.auth.getUser();
  if (!user) {
    logger.warn('使用者未授權 (無效 Token)', correlationId);
    return new Response(JSON.stringify({ error: '使用者未授權' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const userPermissions = user.app_metadata?.permissions || [];

  // 步驟 2: 進行權限檢查
  if (!userPermissions.includes('permissions:users:edit')) {
    logger.warn('權限不足，修改權限設定的操作被拒絕', correlationId, {
      operatorId: user.id,
      requiredPermission: 'permissions:users:edit',
    });
    return new Response(JSON.stringify({ error: '權限不足，您無法修改權限設定。' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // 步驟 3: 解析從前端傳來的請求內容
  const { roleId, permissionId, action } = await req.json().catch(() => ({}));
  if (!roleId || !permissionId || !['grant', 'revoke'].includes(action)) {
    logger.warn('請求參數無效或不完整', correlationId, {
      operatorId: user.id,
      payload: { roleId, permissionId, action },
    });
    return new Response(JSON.stringify({ error: '請求參數無效或不完整。' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  
  logger.info(`權限驗證通過，準備 [${action}] 權限`, correlationId, {
    operatorId: user.id,
    action,
    roleId,
    permissionId
  });

  // 步驟 4: 根據 action 執行對應的資料庫操作
  if (action === 'grant') {
    const { error } = await supabaseAdmin
      .from('role_permissions')
      .insert({ role_id: roleId, permission_id: permissionId });
    if (error) throw new Error(`賦予權限時發生錯誤: ${error.message}`);
  } else if (action === 'revoke') {
    const { error } = await supabaseAdmin
      .from('role_permissions')
      .delete()
      .eq('role_id', roleId)
      .eq('permission_id', permissionId);
    if (error) throw new Error(`撤銷權限時發生錯誤: ${error.message}`);
  }

  // 步驟 5: 記錄關鍵稽核日誌並回傳成功訊息
  logger.audit(`權限已成功 ${action}`, correlationId, {
    operatorId: user.id,
    action: action,
    roleId: roleId,
    permissionId: permissionId,
  });

  return new Response(
    JSON.stringify({
      success: true,
      message: `權限已成功 ${action === 'grant' ? '賦予' : '撤銷'}`,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

Deno.serve(async (req) => {
  // 處理 CORS 預檢請求
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const logger = new LoggingService(FUNCTION_NAME, FUNCTION_VERSION);

  // 使用 withErrorLogging 中介軟體包裹主要處理邏輯
  const wrappedHandler = withErrorLogging(mainHandler, logger);

  return await wrappedHandler(req);
});