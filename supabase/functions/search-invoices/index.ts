// ==============================================================================
// 檔案路徑: supabase/functions/search-invoices/index.ts
// 版本: v45.3 - PostgREST 語法最終修正
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Search Invoices Function (搜尋發票函式)
 * @description 發票管理後台的核心後端服務。負責根據前端傳來的篩選條件，
 *              安全地查詢並回傳發票列表。
 * @version v45.3
 * 
 * @update v45.3 - [POSTGREST SYNTAX FINAL FIX]
 * 1. [核心錯誤修正] 徹底修正了 .or() 函式在處理跨資料表查詢時的語法。
 *          根據 PostgREST 的官方規範，對主資料表 (`invoices`) 的篩選條件
 *          應作為第一個參數，而對關聯資料表 (`orders`) 的篩選條件，
 *          必須明確地在第二個參數的 `foreignTable` (或 `referencedTable`) 
 *          選項中指定。此修正可徹底解決 PGRST100 解析失敗的問題。
 * 
 * @update v45.2 - 跨資料表查詢修正與功能增強
 */

import { createClient } from '../_shared/deps.ts'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  // 處理 CORS 預檢請求
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // --- 1. 初始化 Admin Client 並驗證使用者與權限 ---
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser();
    
    if (userError) throw userError;
    if (!user) throw new Error('使用者未授權或 Token 無效。');
    
    const userPermissions = user.app_metadata?.permissions || [];
    if (!userPermissions.includes('module:invoicing:view')) {
      return new Response(JSON.stringify({ error: '權限不足，您無法存取發票資料。' }), { 
        status: 403, // Forbidden
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- 2. 解析前端傳來的篩選條件 ---
    const filters = await req.json();

    // --- 3. 動態建構查詢語句 ---
    let query = supabaseAdmin
      .from('invoices')
      .select(`
        *,
        orders (
          order_number
        )
      `);

    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    const dateColumn = (filters.status === 'issued' || filters.status === 'voided') ? 'issued_at' : 'created_at';

    if (filters.dateFrom) {
      const startDate = new Date(filters.dateFrom);
      startDate.setHours(0, 0, 0, 0);
      query = query.gte(dateColumn, startDate.toISOString());
    }
    if (filters.dateTo) {
      const endDate = new Date(filters.dateTo);
      endDate.setHours(23, 59, 59, 999);
      query = query.lte(dateColumn, endDate.toISOString());
    }
    
    if (filters.searchTerm) {
      const term = `%${filters.searchTerm}%`;
      // [v45.3 核心修正] 採用 PostgREST 處理關聯資料表的標準語法。
      // 將主資料表 (invoices) 的篩選條件放在第一個參數。
      const mainTableOr = `invoice_number.ilike.${term},vat_number.ilike.${term},recipient_email.ilike.${term}`;
      // 將關聯資料表 (orders) 的篩選條件放在第二個參數中，並明確指定 foreignTable。
      const foreignTableOr = `order_number.ilike.${term}`;
      
      query = query.or(mainTableOr, { foreignTable: 'orders', or: foreignTableOr });
    }

    // --- 4. 執行查詢並回傳結果 ---
    const { data: invoices, error: queryError } = await query
      .order('created_at', { ascending: false })
      .limit(100);

    if (queryError) {
        console.error('[search-invoices] 查詢資料庫時發生錯誤:', queryError);
        throw queryError;
    }

    return new Response(
      JSON.stringify(invoices),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('[search-invoices] 函式發生未預期錯誤:', error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});