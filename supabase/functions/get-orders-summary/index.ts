// ==============================================================================
// 檔案路徑: supabase/functions/get-orders-summary/index.ts
// 版本: v1.0 - 全新訂單彙總資訊函式
// ------------------------------------------------------------------------------
// 【此為全新檔案，請在此路徑下建立 index.ts 並貼上內容】
// ==============================================================================

/**
 * @file Get Orders Summary Function (獲取訂單彙總資訊函式)
 * @description 根據可選的日期區間，查詢並回傳該區間內所有新顧客的訂單彙總資訊，
 *              包括首次下單總數、總訂單數、以及總消費金額。
 * @version v1.0
 *
 * @permission 呼叫者必須擁有 'warehouse_staff' 或 'super_admin' 角色。
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
      function: 'get-orders-summary',
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
    if (!user || !roles.some(r => ALLOWED_ROLES.includes(r))) {
        log('WARN', '權限不足，操作被拒絕', { userId: user?.id, roles });
        throw new Error('FORBIDDEN: 權限不足。');
    }
    userContext = { email: user.email!, roles: JSON.stringify(roles) };
    
    // --- 2. 輸入驗證 (日期區間為可選) ---
    const { startDate, endDate } = await req.json();
    log('INFO', '授權成功，開始查詢訂單彙總資訊', { ...userContext, startDate, endDate });

    // --- 3. 執行資料庫查詢 (使用 RPC 以在資料庫層級進行彙總計算) ---
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 我們將使用 RPC 函式來執行高效的彙總查詢
    // 這樣可以避免將大量訂單資料拉到 Edge Function 中進行計算
    const { data, error } = await supabaseAdmin.rpc('get_new_customers_summary', {
        p_start_date: startDate || null,
        p_end_date: endDate || null
    }).single();
    
    if (error) {
        log('ERROR', '查詢訂單彙總資訊時 RPC 函式發生錯誤', { ...userContext, rpcError: error.message });
        throw new Error(`DB_ERROR: ${error.message}`);
    }

    log('INFO', '訂單彙總資訊查詢成功', { ...userContext, summary: data });

    // --- 4. 回傳成功響應 ---
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (err: any) {
    const message = err.message || 'UNEXPECTED_ERROR';
    const status = 
        message.startsWith('FORBIDDEN') ? 403 :
        message.startsWith('BAD_REQUEST') ? 400 :
        message.startsWith('DB_ERROR') ? 500 : 500;

    log('ERROR', '函式執行時發生錯誤', { ...userContext, error: message, status });

    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});