// ==============================================================================
// 檔案路徑: supabase/functions/search-invoices/index.ts
// 版本: v45.2 - 跨資料表查詢修正與功能增強
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Search Invoices Function (搜尋發票函式)
 * @description 發票管理後台的核心後端服務。負責根據前端傳來的篩選條件，
 *              安全地查詢並回傳發票列表。
 * @version v45.2
 * 
 * @update v45.2 - [CROSS-TABLE SEARCH FIX & ENHANCEMENT]
 * 1. [核心錯誤修正] 修正了 .or() 函式因錯誤使用 `referencedTable` 選項，導致在
 *          跨 `invoices` 與 `orders` 資料表搜尋時，發生 PGRST100 解析失敗的問題。
 *          現在已改為在查詢字串中直接指定關聯表名，並移除 `referencedTable` 參數。
 * 2. [功能增強] 根據總設計師要求，在關鍵字搜尋中新增了對 `recipient_email` 欄位的
 *          支援，擴大了搜尋的實用範圍。
 * 3. [正體化] 檔案內所有註解、日誌及錯誤訊息均已修正為標準正體中文。
 * 
 * @update v45.1 - 智慧日期篩選與正體化
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

    // [v45.1] 智慧型日期篩選
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
      // [v45.2 核心修正] 修正跨資料表查詢語法，並新增 Email 搜尋
      // PostgREST 的 .or() 查詢，對於關聯資料表的欄位，必須直接在查詢字串中指定，且不能使用 referencedTable 選項。
      const orQueryString = `invoice_number.ilike.${term},vat_number.ilike.${term},recipient_email.ilike.${term},orders.order_number.ilike.${term}`;
      query = query.or(orQueryString);
    }

    // --- 4. 執行查詢並回傳結果 ---
    const { data: invoices, error: queryError } = await query
      .order('created_at', { ascending: false })
      .limit(100); // 增加保護機制，避免一次回傳過多資料

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
        // 將狀態碼改為 500，以更精確地反映伺服器端錯誤
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});