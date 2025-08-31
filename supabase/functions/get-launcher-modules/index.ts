// ==============================================================================
// 檔案路徑: supabase/functions/get-launcher-modules/index.ts
// 版本: v29.2 - 權限校準勝利收官版
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Get Launcher Modules Function (獲取啟動台模組函式)
 * @description 根據使用者權限，動態建構並回傳其可存取的後台模組列表。
 * @version v29.2
 *
 * @update v29.2 - [PERMISSION CALIBRATION]
 * 1. [核心修正] 重新校準 `ALL_MODULES` 與 `MODULE_VIEW_PERMISSIONS` 的定義，
 *          使其與資料庫中實際存在的權限完全匹配。
 * 2. [錯誤解決] 此修改恢復了「使用者權限管理」和「權限設定」模組的可見性，
 *          並確保「物流託運管理」模組能被正確授權並顯示。
 */

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import LoggingService, { withErrorLogging } from '../_shared/services/loggingService.ts';

const FUNCTION_NAME = 'get-launcher-modules';
const FUNCTION_VERSION = 'v29.2';

const ALL_MODULES = [
  {
    id: 'shipping',
    name: '出貨管理系統',
    description: '處理訂單備貨、確認付款與出貨作業。',
    url: '/warehouse-panel/index.html',
    badgeQuery: { table: 'orders', filter: { column: 'status', value: 'paid' } },
  },
  {
    id: 'invoicing',
    name: '發票管理系統',
    description: '查詢發票狀態、手動開立或作廢發票。',
    url: '/invoice-panel/index.html',
    badgeQuery: { table: 'invoices', filter: { column: 'status', value: 'failed' } },
  },
  {
    id: 'tcat_shipment',
    name: '物流託運管理',
    description: '批次建立黑貓宅急便託運單，並自動回填追蹤碼。',
    url: '/tcatshipment-panel/index.html',
    badgeQuery: { table: 'orders', filter: { column: 'status', value: 'paid' } },
  },
  {
    id: 'user_management',
    name: '使用者權限管理',
    description: '管理後台人員的角色與存取權限。',
    url: '/admin/user-management.html',
    badgeQuery: null,
  },
  {
    id: 'permission_management',
    name: '權限設定',
    description: '管理系統中的角色及其對應的細部權限。',
    url: '/admin/rbac.html',
    badgeQuery: null,
  },
];

// [v29.2] 核心修正：與資料庫實際權限校準
const MODULE_VIEW_PERMISSIONS: Record<string, string> = {
  shipping: 'module:shipping:view',
  invoicing: 'module:invoicing:view',
  tcat_shipment: 'module:shipping:tcat', 
  user_management: 'module:users:manage', 
  permission_management: 'module:rbac:manage', 
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

  const { data: { user } } = await supabaseAdmin.auth.getUser();
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
        logger.error(`查詢模組 [${module.name}] 的徽章數量時發生錯誤`, correlationId, error, { module: module.id, table, filter });
      } else {
        badgeCount = count || 0;
      }
    }
    return { ...module, badge: badgeCount > 0 ? badgeCount.toString() : null };
  });

  const finalModules = await Promise.all(modulePromises);
  logger.info(`成功為使用者建構 ${finalModules.length} 個模組，準備回傳`, correlationId, { userId: user.id });

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
  const wrappedHandler = withErrorLogging(mainHandler, logger);
  return await wrappedHandler(req);
});