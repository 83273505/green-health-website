// ==============================================================================
// 檔案路徑: supabase/functions/get-launcher-modules/index.ts
// 版本: v25.1 - 權限管理儀表板
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

import { createClient } from '../_shared/deps.ts'
import { corsHeaders } from '../_shared/cors.ts'

console.log(`函式 "get-launcher-modules" (v25.1 - Permissions-Driven) 已啟動`);

// --- 權限驅動模型定義 ---

// 步驟 1: 定義所有可能的模組
const ALL_MODULES = [
  {
    id: 'shipping',
    name: '出貨管理系統',
    description: '處理訂單備貨、確認付款與出貨作業。',
    url: '/warehouse-panel/shipping-dashboard.html',
    badgeQuery: {
      table: 'orders',
      filter: { column: 'status', value: 'paid' }
    }
  },
  {
    id: 'invoicing',
    name: '發票管理系統',
    description: '查詢發票狀態、手動開立或作廢發票。',
    url: '/invoice-panel/index.html',
    badgeQuery: {
      table: 'invoices',
      filter: { column: 'status', value: 'failed' }
    }
  },
  {
    id: 'user_management',
    name: '使用者權限管理',
    description: '管理後台人員的角色與存取權限。',
    url: '/user-panel/index.html', // 假設未來會有獨立的使用者管理面板
    badgeQuery: null
  },
  // 【核心新增】新增權限設定模組的定義
  {
    id: 'permission_management',
    name: '權限設定',
    description: '管理系統中的角色及其對應的細部權限。',
    url: '/permission-panel/index.html',
    badgeQuery: null
  }
];

// 步驟 2: 建立「模組 ID」與「所需權限」的對照表
const MODULE_VIEW_PERMISSIONS = {
  shipping: 'module:shipping:view',
  invoicing: 'module:invoicing:view',
  user_management: 'module:users:view',
  // 【核心新增】將新模組與其進入權限綁定
  permission_management: 'module:permissions:view'
};

// --- Edge Function 主邏輯 ---

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user } } = await supabaseAdmin.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: '使用者未授權' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    
    const userPermissions = user.app_metadata?.permissions || [];

    const accessibleModules = ALL_MODULES.filter(module => {
      const requiredPermission = MODULE_VIEW_PERMISSIONS[module.id];
      return userPermissions.includes(requiredPermission);
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
          console.error(`查詢模組 [${module.name}] 的徽章數量時發生錯誤:`, error);
        } else {
          badgeCount = count || 0;
        }
      }
      
      return { ...module, badge: badgeCount > 0 ? badgeCount.toString() : null };
    });

    const finalModules = await Promise.all(modulePromises);

    return new Response(JSON.stringify(finalModules), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[get-launcher-modules] 函式發生嚴重錯誤:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});