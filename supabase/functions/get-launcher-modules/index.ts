// ==============================================================================
// 檔案路徑: supabase/functions/get-launcher-modules/index.ts
// 版本: v25.0 - 自動化權限系統 (權限驅動版)
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

import { createClient } from '../_shared/deps.ts'
import { corsHeaders } from '../_shared/cors.ts'

console.log(`函式 "get-launcher-modules" (v25.0 - Permissions-Driven) 已啟動`);

// --- 權限驅動模型定義 ---

// 步驟 1: 定義所有可能的模組 (只關心內容，不關心權限)
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
    description: '管理後台人員的存取權限。',
    url: '/warehouse-panel/user-management.html',
    badgeQuery: null
  }
];

// 步驟 2: 建立「模組 ID」與「所需權限」的對照表
// 這是我們新的權限檢查核心。
const MODULE_VIEW_PERMISSIONS = {
  shipping: 'module:shipping:view',
  invoicing: 'module:invoicing:view',
  user_management: 'module:users:view'
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
    
    // 【核心修改】從 app_metadata 中讀取由 Auth Hook 生成的 permissions 陣列
    const userPermissions = user.app_metadata?.permissions || [];

    // 【核心修改】根據使用者擁有的「權限」，來過濾模組
    const accessibleModules = ALL_MODULES.filter(module => {
      const requiredPermission = MODULE_VIEW_PERMISSIONS[module.id];
      // 檢查使用者權限陣列中，是否包含進入此模組所需的權限
      return userPermissions.includes(requiredPermission);
    });

    // 後續的徽章查詢邏輯維持不變
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