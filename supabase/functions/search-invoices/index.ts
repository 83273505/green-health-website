// ==============================================================================
// 檔案路徑: supabase/functions/search-invoices/index.ts
// 版本: v46.0 - RPC 架構重構
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Search Invoices Function (搜尋發票函式)
 * @description 發票管理後台的核心後端服務。
 * @version v46.0
 * 
 * @update v46.0 - [RPC ARCHITECTURE REFACTOR]
 * 1. [核心架構重構] 徹底移除了所有客戶端的動態查詢建構邏輯 (.eq, .or 等)，
 *          改為直接呼叫資料庫中的 `search_invoices_advanced` RPC 函式。
 * 2. [職責轉移] 將所有複雜的篩選、JOIN 和搜尋邏輯完全轉移到資料庫層，
 *          使得此 Edge Function 變得極其輕量、穩定且易於維護。
 * 3. [功能對齊] 為了支援新的 UI (例如獨立欄位查詢)，函式現在能接收並傳遞
 *          一個更結構化的篩選器物件給 RPC 函式。
 * 4. [錯誤根除] 此修改從根本上解決了因 PostgREST .or() 語法限制而導致的
 *          所有 `PGRST100` 解析失敗錯誤。
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

    // --- 3. [v46.0 核心修正] 呼叫 RPC 函式執行查詢 ---
    const { data: invoices, error: rpcError } = await supabaseAdmin
      .rpc('search_invoices_advanced', {
        _status: filters.status || null,
        _search_term: filters.searchTerm || null,
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