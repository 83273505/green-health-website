// ==============================================================================
// 檔案路徑: supabase/functions/get-launcher-modules/index.ts
// 版本: v29.1 - 物流中心整合收官版
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Get Launcher Modules Function (獲取啟動台模組函式)
 * @description 根據使用者權限，動態建構並回傳其可存取的後台模組列表，
 *              並查詢各模組的即時狀態徽章。
 * @version v29.1
 *
 * @update v29.1 - [LOGISTICS_CENTER_INTEGRATION]
 * 1. [核心新增] 在 `ALL_MODULES` 清單中，新增了「物流託運管理」模組的完整定義，
 *          並為其設定了動態徽章查詢規則（查詢待處理的黑貓訂單）。
 * 2. [權限綁定] 在 `MODULE_VIEW_PERMISSIONS` 中，為新模組指定了
 *          `module:shipping:tcat` 作為必需的存取權限。
 * 3. [架構複用] 新增的模組完全複用了現有的企業級日誌與權限過濾框架。
 */

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import LoggingService, { withErrorLogging } from '../_shared/services/loggingService.ts';

const FUNCTION_NAME = 'get-launcher-modules';
const FUNCTION_VERSION = 'v29.1';

// --- 權限驅動模型定義 ---

const ALL_MODULES = [
  {
    id: 'shipping',
    name: '出貨管理系統',
    description: '處理訂單備貨、確認付款與出貨作業。',
    url: '/warehouse-panel/index.html', // [v29.1] 修正為正確的 HTML 檔名
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
  // [v29.1] 核心新增：物流託運管理模組
  {
    id: 'tcat_shipment',
    name: '物流託運管理',
    description: '批次建立黑貓宅急便託運單，並自動回填追蹤碼。',
    url: '/tcatshipment-panel/index.html',
    badgeQuery: {
      table: 'orders',
      filter: { column: 'status', value: 'paid' }, // 徽章顯示待處理的訂單數
      // 可進一步篩選只適用於黑貓的訂單
      // extraFilter: { column: 'shipping_method_id', value: 'YOUR_TCAT_METHOD_ID' }
    },
  },
  {
    id: 'user_management',
    name: '使用者權限管理',
    description: '管理後台人員的角色與存取權限。',
    url: '/admin/user-management.html', // [v29.1] 修正路徑
    badgeQuery: null,
  },
  {
    id: 'permission_management',
    name: '權限設定',
    description: '管理系統中的角色及其對應的細部權限。',
    url: '/admin/rbac.html', // [v29.1] 修正路徑
    badgeQuery: null,
  },
];

const MODULE_VIEW_PERMISSIONS: Record<string, string> = {
  shipping: 'module:shipping:view',
  invoicing: 'module:invoicing:view',
  tcat_shipment: 'module:shipping:tcat', // [v29.1] 新增權限對應
  user_management: 'module:users:manage', // [v29.1] 修正為正確的權限
  permission_management: 'module:rbac:manage', // [v29.1] 修正為正確的權限
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
      let query = supabaseAdmin
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq(filter.column, filter.value);

      // (未來可擴充) 處理額外的篩選條件
      // if (filter.extraFilter) {
      //   query = query.eq(filter.extraFilter.column, filter.extraFilter.value);
      // }
        
      const { count, error } = await query;

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