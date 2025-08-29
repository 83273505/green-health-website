// ==============================================================================
// 檔案路徑: supabase/functions/search-users/index.ts
// 版本: v1.0 - 安全模型重構與企業級日誌整合
// ------------------------------------------------------------------------------
// 【此為全新檔案，請建立對應資料夾與檔案】
// ==============================================================================

/**
 * @file Search Users Function (搜尋使用者函式)
 * @description 允許授權管理員根據 Email 關鍵字搜尋系統使用者。
 * @version v1.0
 *
 * @update v1.0 - [SECURITY REFACTOR & ENTERPRISE LOGGING]
 * 1. [核心安全修正] 移除了硬式編碼的 SUPER_ADMIN_USER_ID，改為檢查呼叫者是否
 *          擁有 'module:users:view' 權限。這使得權限模型更具擴充性、
 *          安全性，並遵循最小權限原則。
 * 2. [核心架構] 引入 `LoggingService` v2.0，並使用 `withErrorLogging` 處理異常。
 * 3. [安全稽核日誌] 對每一次使用者搜尋操作都留下了詳細的稽核日誌，記錄了
 *          操作者、查詢條件及返回結果數量。
 */

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import LoggingService, { withErrorLogging } from '../_shared/services/loggingService.ts';

const FUNCTION_NAME = 'search-users';
const FUNCTION_VERSION = 'v1.0';

const REQUIRED_PERMISSION = 'module:users:view';

async function mainHandler(req: Request, logger: LoggingService, correlationId: string): Promise<Response> {
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

  const { data: { user } } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''));
  if (!user) {
    logger.warn('無效的使用者憑證', correlationId);
    return new Response(JSON.stringify({ error: '無效的使用者憑證。' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
  }

  const userPermissions = user.app_metadata?.permissions || [];
  if (!userPermissions.includes(REQUIRED_PERMISSION)) {
    logger.warn('權限不足，操作被拒絕', correlationId, {
      operatorId: user.id,
      requiredPermission: REQUIRED_PERMISSION,
    });
    return new Response(JSON.stringify({ error: '權限不足，您無法搜尋使用者。' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
  }

  // --- 2. 輸入驗證 ---
  const { emailQuery } = await req.json().catch(() => ({}));
  if (typeof emailQuery !== 'string') {
    logger.warn('缺少或無效的 emailQuery 參數', correlationId, { operatorId: user.id });
    return new Response(JSON.stringify({ error: '缺少或無效的 emailQuery 參數。' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
  }
  
  logger.info('授權成功，開始搜尋使用者', correlationId, { operatorId: user.id, emailQuery });

  // --- 3. 執行使用者查詢 ---
  const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 50,
    query: emailQuery,
  });

  if (listError) throw listError;

  logger.info(`使用者搜尋成功，共找到 ${users.length} 筆結果`, correlationId, { operatorId: user.id });
  
  // --- 4. 格式化並回傳結果 ---
  const formattedUsers = users.map(u => ({
    id: u.id,
    email: u.email,
    roles: u.app_metadata?.roles || [],
  }));

  return new Response(JSON.stringify(formattedUsers), {
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