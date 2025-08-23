// ==============================================================================
// 檔案路徑: supabase/functions/search-invoices/index.ts
// 版本: v45.1 - 智慧日期篩選與正體化
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Search Invoices Function (搜尋發票函式)
 * @description 發票管理後台的核心後端服務。負責根據前端傳來的篩選條件，
 *              安全地查詢並回傳發票列表。
 * @version v45.1
 * 
 * @update v45.1 - [INTELLIGENT DATE FILTERING & LOCALIZATION]
 * 1. [核心強化] 新增了智慧型日期篩選邏輯。現在，函式會根據篩選的發票狀態
 *          (`status`)，動態地決定要查詢 `issued_at` (已開立/已作廢) 還是
 *          `created_at` (待開立/失敗) 欄位，使查詢結果更符合使用者預期。
 * 2. [正體化] 檔案內所有註解、日誌及錯誤訊息均已修正為標準正體中文。
 * 
 * @architectural_notes
 * 1. [安全] 此函式強制要求 JWT 驗證，並在內部進一步檢查使用者是否擁有
 *          'module:invoicing:view' 權限，確保只有授權的後台人員才能存取。
 * 2. [動態查詢] 函式能夠動態建構查詢語句，支援狀態、日期區間以及跨欄位
 *          (訂單號、發票號、統一編號) 的關鍵字搜尋。
 * 3. [資料關聯] 查詢時會一併帶出關聯的訂單資料 (orders)，為前端提供
 *          了渲染所需的完整資訊。
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

    // [v45.1 核心強化] 智慧型日期篩選
    const dateColumn = (filters.status === 'issued' || filters.status === 'voided') ? 'issued_at' : 'created_at';

    if (filters.dateFrom) {
      // 確保查詢包含起始日當天
      const startDate = new Date(filters.dateFrom);
      startDate.setHours(0, 0, 0, 0);
      query = query.gte(dateColumn, startDate.toISOString());
    }
    if (filters.dateTo) {
      // 確保查詢包含結束日當天
      const endDate = new Date(filters.dateTo);
      endDate.setHours(23, 59, 59, 999);
      query = query.lte(dateColumn, endDate.toISOString());
    }
    
    if (filters.searchTerm) {
      const term = `%${filters.searchTerm}%`;
      // 跨欄位模糊搜尋
      query = query.or(
        `invoice_number.ilike.${term},vat_number.ilike.${term},orders.order_number.ilike.${term}`,
        { referencedTable: 'orders' }
      );
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
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});