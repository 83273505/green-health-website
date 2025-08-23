// ==============================================================================
// 檔案路徑: supabase/functions/search-invoices/index.ts
// 版本: v46.1 - 獨立欄位查詢對齊
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Search Invoices Function (搜尋發票函式)
 * @description 發票管理後台的核心後端服務。
 * @version v46.1
 * 
 * @update v46.1 - [ALIGN WITH DETAILED SEARCH FIELDS]
 * 1. [核心對齊] 更新了篩選條件的解析邏輯，以支援前端新的、多欄位的進階
 *          搜尋表單。現在函式會將多個獨立的搜尋詞（如訂單號、Email 等）
 *          組合成一個單一的 `_search_term` 參數傳遞給 RPC 函式。
 * 2. [正體化] 對檔案進行最終的全面正體中文校訂。
 * 
 * @update v46.0 - RPC 架構重構
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
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- 2. 解析前端傳來的篩選條件 ---
    const filters = await req.json();

    // [v46.1 核心修正] 將前端的多個獨立搜尋欄位，組合成 RPC 函式所需的單一 searchTerm
    const searchTerms = [
        filters.orderNumber,
        filters.invoiceNumber,
        filters.email,
        filters.vatNumber,
        filters.searchTerm // 保留對舊版通用搜尋詞的兼容
    ].filter(Boolean); // 過濾掉空值或 undefined

    const combinedSearchTerm = searchTerms.length > 0 ? searchTerms.join(' ') : null;

    // --- 3. 呼叫 RPC 函式執行查詢 ---
    const { data: invoices, error: rpcError } = await supabaseAdmin
      .rpc('search_invoices_advanced', {
        _status: filters.status || null,
        _search_term: combinedSearchTerm,
        _date_from: filters.dateFrom || null,
        _date_to: filters.dateTo || null,
        _order_status: filters.orderStatus || null
      });

    if (rpcError) {
        console.error('[search-invoices] 呼叫 RPC 函式時發生錯誤:', rpcError);
        throw rpcError;
    }

    // --- 4. 回傳查詢結果 ---
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