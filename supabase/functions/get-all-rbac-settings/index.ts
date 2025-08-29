// ==============================================================================
// 檔案路徑: supabase/functions/get-all-rbac-settings/index.ts
// 版本: v26.0 - 企業級日誌框架整合
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Get All RBAC Settings Function (獲取所有 RBAC 相關設定函式)
 * @description 為後台權限管理儀表板提供所有角色、權限及關聯資料。
 * @version v26.0
 *
 * @update v26.0 - [ENTERPRISE LOGGING FRAMEWORK INTEGRATION]
 * 1. [核心架構] 引入 `LoggingService` v2.0，取代所有 `console.*` 呼叫。
 * 2. [全域錯誤捕捉] 使用 `withErrorLogging` 中介軟體包裹主要處理邏輯，
 *          自動捕捉未處理的異常並記錄 CRITICAL 級別日誌。
 * 3. [安全稽核日誌] 在權限檢查點加入了詳細的稽核日誌，記錄成功與
 *          失敗的存取嘗試。
 * 4. [情境感知日誌] 記錄了資料庫查詢的結果摘要，提升了可觀測性。
 * 5. [追蹤 ID] 整個請求生命週期由 `correlationId` 貫穿，實現了完整的可追蹤性。
 *
 * @update v25.1 - 初始版本
 */

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import LoggingService, { withErrorLogging } from '../_shared/services/loggingService.ts';

const FUNCTION_NAME = 'get-all-rbac-settings';
const FUNCTION_VERSION = 'v26.0';

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
  // 只有擁有 'module:permissions:view' 權限的使用者才能繼續
  if (!userPermissions.includes('module:permissions:view')) {
    logger.warn('權限不足，存取被拒絕', correlationId, {
      userId: user.id,
      requiredPermission: 'module:permissions:view',
      userPermissions,
    });
    return new Response(
      JSON.stringify({ error: '權限不足，無法存取權限設定。' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  logger.info('權限驗證通過，開始獲取 RBAC 設定', correlationId, { userId: user.id });

  // 步驟 3: (平行處理) 一次性獲取所有 RBAC 相關的表格資料
  const [rolesRes, permissionsRes, rolePermissionsRes] = await Promise.all([
    supabaseAdmin.from('roles').select('*').order('name', { ascending: true }),
    supabaseAdmin.from('permissions').select('*').order('name', { ascending: true }),
    supabaseAdmin.from('role_permissions').select('*'),
  ]);

  // 檢查是否有任何一個查詢出錯 (將由 withErrorLogging 捕捉)
  if (rolesRes.error) throw new Error(`查詢角色時發生錯誤: ${rolesRes.error.message}`);
  if (permissionsRes.error) throw new Error(`查詢權限時發生錯誤: ${permissionsRes.error.message}`);
  if (rolePermissionsRes.error) throw new Error(`查詢角色權限關聯時發生錯誤: ${rolePermissionsRes.error.message}`);

  logger.info('成功從資料庫獲取所有 RBAC 資料', correlationId, {
    rolesCount: rolesRes.data.length,
    permissionsCount: permissionsRes.data.length,
    rolePermissionsCount: rolePermissionsRes.data.length,
  });
  
  // 步驟 4: 將所有資料打包成一個物件回傳給前端
  const rbacSettings = {
    roles: rolesRes.data,
    permissions: permissionsRes.data,
    role_permissions: rolePermissionsRes.data,
  };

  return new Response(JSON.stringify(rbacSettings), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
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