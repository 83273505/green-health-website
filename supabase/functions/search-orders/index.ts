// ==============================================================================
// 檔案路徑: supabase/functions/search-orders/index.ts
// 版本: v1.0 - 全新多條件訂單查詢函式
// ------------------------------------------------------------------------------
// 【此為全新檔案，請建立對應資料夾與檔案】
// ==============================================================================

/**
 * @file Search Orders Function (統一訂單查詢函式)
 * @description 根據多個可選條件，查詢並回傳訂單列表。
 * @version v1.0
 *
 * @permission 呼叫者必須擁有 'warehouse_staff' 或 'super_admin' 角色。
 *
 * @param {string} [status] - 訂單狀態 (e.g., 'shipped', 'cancelled')。
 * @param {string} [orderNumber] - 訂單號碼 (模糊比對)。
 * @param {string} [customerKeyword] - 顧客關鍵字 (姓名或Email，模糊比對)。
 * @param {string} [startDate] - 查詢區間開始日期 (YYYY-MM-DD)。
 * @param {string} [endDate] - 查詢區間結束日期 (YYYY-MM-DD)。
 */

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';

const ALLOWED_ROLES = ['warehouse_staff', 'super_admin'];

function log(level: 'INFO' | 'WARN' | 'ERROR', message: string, context: object = {}) {
  console.log(
    JSON.stringify({
      level,
      timestamp: new Date().toISOString(),
      function: 'search-orders',
      message,
      ...context,
    })
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let userContext = { email: 'unknown', roles: '[]' };

  try {
    // --- 1. 權限驗證 ---
    const supabaseUserClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user } } = await supabaseUserClient.auth.getUser();
    const roles: string[] = user?.app_metadata?.roles || [];
    if (!user || !roles.some((r) => ALLOWED_ROLES.includes(r))) {
      throw new Error('FORBIDDEN: 權限不足。');
    }
    userContext = { email: user.email!, roles: JSON.stringify(roles) };
    log('INFO', '授權成功，開始處理查詢請求', userContext);

    // --- 2. 獲取並驗證參數 ---
    const params = await req.json();
    log('INFO', '接收到查詢參數', { ...userContext, params });

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // --- 3. 動態建構查詢 ---
    let query = supabaseAdmin.from('orders').select(`
      id, order_number, created_at, status, shipped_at, cancelled_at,
      cancellation_reason, shipping_tracking_code, carrier,
      shipping_address_snapshot, customer_email,
      order_items ( quantity, product_variants ( name, products (name) ) )
    `);

    if (params.status) {
      query = query.eq('status', params.status);
    }
    if (params.orderNumber) {
      query = query.ilike('order_number', `%${params.orderNumber}%`);
    }
    if (params.customerKeyword) {
      const keyword = `%${params.customerKeyword}%`;
      query = query.or(`shipping_address_snapshot->>recipient_name.ilike.${keyword},customer_email.ilike.${keyword}`);
    }
    if (params.startDate) {
      query = query.gte('created_at', new Date(params.startDate).toISOString());
    }
    if (params.endDate) {
      const endOfDay = new Date(params.endDate);
      endOfDay.setHours(23, 59, 59, 999);
      query = query.lte('created_at', endOfDay.toISOString());
    }

    // --- 4. 執行查詢 ---
    const { data: orders, error } = await query
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      log('ERROR', '資料庫查詢失敗', { ...userContext, dbError: error.message });
      throw new Error(`DB_ERROR: ${error.message}`);
    }

    log('INFO', `查詢成功，共找到 ${orders.length} 筆訂單`, { ...userContext, count: orders.length });

    // --- 5. 回傳結果 ---
    return new Response(JSON.stringify(orders), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (err: any) {
    const message = err.message || 'UNEXPECTED_ERROR';
    const status = message.startsWith('FORBIDDEN') ? 403 : message.startsWith('DB_ERROR') ? 500 : 400;
    log('ERROR', '函式執行時發生錯誤', { ...userContext, error: message, status });
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});