// ==============================================================================
// 檔案路徑: supabase/functions/search-invoices/index.ts
// 版本: v47.0 - 對齊 v47.0 RPC 函式
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Search Invoices Function (搜尋發票函式)
 * @description 發票管理後台的核心後端服務。
 * @version v47.0
 * 
 * @update v47.0 - [ALIGN WITH v47.0 RPC FUNCTION]
 * 1. [核心簡化] 移除在 Edge Function 中手動組合搜尋詞的邏輯。
 * 2. [原理] 新版 `search_invoices_advanced` RPC (v47.0) 已內建更強大的
 *          模糊查詢 (`ILIKE`) 邏輯，能處理單一的 `_search_term`。本函式
 *          現在只需將前端傳來的通用搜尋詞直接透傳給 RPC 即可，職責更單一。
 * 3. [回傳結構變更] RPC 現在回傳的是一個 JSON 陣列，每個元素都是一個
 *          包含完整發票、訂單與品項詳情的 JSON 物件。
 */

import { createClient } from '../_shared/deps.ts'
import { corsHeaders } from '../_shared/cors.ts'

// 注意：此函式依賴 v47.0 或更高版本的 `search_invoices_advanced` RPC 函式。
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // --- 1. 初始化並驗證使用者權限 (權限模型已在 v45.1 修正，此處保持一致) ---
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    
    const supabaseUserClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user } } = await supabaseUserClient.auth.getUser();
    if (!user || !(user.app_metadata?.permissions || []).includes('module:invoicing:view')) {
      return new Response(JSON.stringify({ error: '權限不足，您無法存取發票資料。' }), { 
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- 2. 解析前端傳來的篩選條件 ---
    const filters = await req.json();

    // --- 3. 直接呼叫新版 RPC 函式執行查詢 ---
    const { data, error: rpcError } = await supabaseAdmin
      .rpc('search_invoices_advanced', {
        _status: filters.status || null,
        _search_term: filters.searchTerm || null, // 直接透傳通用的 searchTerm
        _date_from: filters.dateFrom || null,
        _date_to: filters.dateTo || null,
        _order_status: filters.orderStatus || null
      });

    if (rpcError) {
        console.error('[search-invoices] 呼叫 RPC 函式時發生錯誤:', rpcError);
        throw rpcError;
    }

    // [v47.0] RPC 回傳的是 `invoice_details` 欄位的陣列，我們需要將其解構
    const resultData = data ? data.map((row: any) => row.invoice_details) : [];

    // --- 4. 回傳查詢結果 ---
    return new Response(
      JSON.stringify(resultData),
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