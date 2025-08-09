// ==============================================================================
// 檔案路徑: supabase/functions/get-launcher-modules/index.ts
// ------------------------------------------------------------------------------
// 【此為新檔案，可直接覆蓋】
// ==============================================================================

import { createClient } from '../_shared/deps.ts'
import { corsHeaders } from '../_shared/cors.ts'

console.log(`函式 "get-launcher-modules" 已啟動`);

// 定義所有可能的後台模組及其所需角色
const ALL_MODULES = [
  {
    id: 'shipping',
    name: '出貨管理系統',
    description: '處理訂單備貨、確認付款與出貨作業。',
    url: '/warehouse-panel/shipping-dashboard.html',
    requiredRoles: ['warehouse_staff', 'super_admin'],
    badgeQuery: { // 用於動態顯示待辦數量的查詢
      table: 'orders',
      filter: {
        column: 'status',
        value: 'paid' // 待出貨的訂單狀態
      }
    }
  },
  {
    id: 'invoicing',
    name: '發票管理系統',
    description: '查詢發票狀態、手動開立或作廢發票。',
    url: '/invoice-panel/index.html',
    requiredRoles: ['accounting_staff', 'super_admin'],
    badgeQuery: {
      table: 'invoices',
      filter: {
        column: 'status',
        value: 'failed' // 開立失敗的發票
      }
    }
  },
  {
    id: 'user_management',
    name: '使用者權限管理',
    description: '管理後台人員的存取權限。',
    url: '/warehouse-panel/user-management.html', // 暫時沿用舊的路徑
    requiredRoles: ['super_admin'],
    badgeQuery: null // 此模組沒有待辦事項
  }
];

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

    // 步驟 1: 驗證使用者並獲取其角色
    const { data: { user } } = await supabaseAdmin.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: '使用者未授權' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const userRoles = user.app_metadata?.roles || [];

    // 步驟 2: 過濾出使用者有權限訪問的模組
    const accessibleModules = ALL_MODULES.filter(module => 
      module.requiredRoles.some(requiredRole => userRoles.includes(requiredRole))
    );

    // 步驟 3: (平行處理) 為每個有權限的模組查詢其徽章數量
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
      
      return {
        ...module,
        badge: badgeCount > 0 ? badgeCount.toString() : null // 如果數量大於0，則顯示徽章
      };
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