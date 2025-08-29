// ==============================================================================
// 檔案路徑: supabase/functions/get-launcher-modules/index.ts
// 版本: v29.0 - 企業級日誌框架整合
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Get Launcher Modules Function (獲取啟動台模組函式)
 * @description 根據使用者權限，動態建構並回傳其可存取的後台模組列表，
 *              並查詢各模組的即時狀態徽章。
 * @version v29.0
 *
 * @update v29.0 - [ENTERPRISE LOGGING FRAMEWORK INTEGRATION]
 * 1. [核心架構] 引入 `LoggingService` v2.0，取代所有 `console.*` 呼叫。
 * 2. [全域錯誤捕捉] 使用 `withErrorLogging` 中介軟體處理未預期異常。
 * 3. [稽核與除錯] 增加了詳細的權限過濾日誌，清晰記錄使用者被授權的模組，
 *          極大地方便了權限相關問題的排查。
 * 4. [非阻斷錯誤記錄] 將徽章查詢失敗的事件從 `console.error` 升級為標準的
 *          結構化錯誤日誌，便於追蹤。
 * 5. [追蹤 ID] 整個請求生命週期由 `correlationId` 貫穿。
 *
 * @update v28.3 - 修正啟動台模組 URL
 */

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import LoggingService, { withErrorLogging } from '../_shared/services/loggingService.ts';

const FUNCTION_NAME = 'get-launcher-modules';
const FUNCTION_VERSION = 'v29.0';

// --- 權限驅動模型定義 ---

const ALL_MODULES = [
  {
    id: 'shipping',
    name: '出貨管理系統',
    description: '處理訂單備貨、確認付款與出貨作業。',
    url: '/warehouse-panel/shipping-dashboard.html',
    badgeQuery: {
      table: 'orders',
      filter: { column: 'status', value: 'paid' },
    },
  },
  {
    id: 'invoicing',
    name: '發票管理系統',
    description: '查詢發票狀態、手動開立或作廢發票。',
    url: '/invoice-panel/index.html',
    badgeQuery: {
      table: 'invoices',
      filter: { column: 'status', value: 'failed' },
    },
  },
  {
    id: 'user_management',
    name: '使用者權限管理',
    description: '管理後台人員的角色與存取權限。',
    url: '/warehouse-panel/user-management.html',
    badgeQuery: null,
  },
  {
    id: 'permission_management',
    name: '權限設定',
    description: '管理系統中的角色及其對應的細部權限。',
    url: '/permission-panel/index.html',
    badgeQuery: null,
  },
];

const MODULE_VIEW_PERMISSIONS: Record<string, string> = {
  shipping: 'module:shipping:view',
  invoicing: 'module:invoicing:view',
  user_management: 'module:users:view',
  permission_management: 'module:permissions:view',
};

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
  logger.info('權限驗證通過，開始建構啟動台', correlationId, { userId: user.id });

  const accessibleModules = ALL_MODULES.filter((module) => {
    const requiredPermission = MODULE_VIEW_PERMISSIONS[module.id];
    return userPermissions.includes(requiredPermission);
  });

  logger.info('權限過濾完成', correlationId, {
    userId: user.id,
    accessibleModuleIds: accessibleModules.map((m) => m.id),
  });

  const modulePromises = accessibleModules.map(async (module) => {
    let badgeCount = 0;
    if (module.badgeQuery) {
      const { table, filter } = module.badgeQuery;
      const { count, error } = await supabaseAdmin
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq(filter.column, filter.value);

      if (error) {
        // 記錄非阻斷性錯誤，不影響其他模組的載入
        logger.error(
          `查詢模組 [${module.name}] 的徽章數量時發生錯誤`,
          correlationId,
          error,
          { module: module.id, table, filter }
        );
      } else {
        badgeCount = count || 0;
      }
    }

    return { ...module, badge: badgeCount > 0 ? badgeCount.toString() : null };
  });

  const finalModules = await Promise.all(modulePromises);

  logger.info(
    `成功為使用者建構 ${finalModules.length} 個模組，準備回傳`,
    correlationId,
    { userId: user.id }
  );

  return new Response(JSON.stringify(finalModules), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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