// ==============================================================================
// 檔案路徑: supabase/functions/get-customer-summary/index.ts
// 版本: v1.0 - 全新顧客歷史輪廓函式
// ------------------------------------------------------------------------------
// 【此為全新檔案，請在此路徑下建立 index.ts 並貼上內容】
// ==============================================================================

/**
 * @file Get Customer Summary Function (獲取顧客摘要函式)
 * @description 根據 user_id，查詢並回傳該顧客的歷史訂單摘要資訊，
 *              包括首次下單日、總訂單數、總消費金額與取消次數。
 * @version v1.0
 *
 * @permission 呼叫者必須擁有 'warehouse_staff' 或 'super_admin' 角色。
 * @param {string} userId - 要查詢的顧客 user_id。
 */

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';

const ALLOWED_ROLES = ['warehouse_staff', 'super_admin'];

function log(level: 'INFO' | 'WARN' | 'ERROR', message: string, context: object = {}) {
  console.log(
    JSON.stringify({
      level,
      timestamp: new Date().toISOString(),
      function: 'get-customer-summary',
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
    
    // --- 2. 輸入驗證 ---
    const { userId } = await req.json();
    if (!userId || typeof userId !== 'string') {
      log('WARN', '缺少有效的 userId 參數', userContext);
      throw new Error('BAD_REQUEST: 缺少有效的 userId 參數。');
    }
    log('INFO', '授權成功，開始查詢顧客摘要', { ...userContext, targetUserId: userId });

    // --- 3. 執行資料庫查詢 ---
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 平行執行三個查詢以提升效能
    const [profilePromise, firstOrderPromise, statsPromise] = [
        // 查詢 1: 獲取取消次數
        supabaseAdmin.from('profiles').select('cancellation_count').eq('id', userId).single(),
        // 查詢 2: 獲取首次下單日期
        supabaseAdmin.from('orders').select('created_at').eq('user_id', userId).order('created_at', { ascending: true }).limit(1).single(),
        // 查詢 3: 統計總訂單數與總金額
        supabaseAdmin.from('orders').select('total_amount').eq('user_id', userId).in('status', ['paid', 'shipped', 'completed'])
    ];

    const [
        { data: profileData, error: profileError },
        { data: firstOrderData, error: firstOrderError },
        { data: statsData, error: statsError }
    ] = await Promise.all([profilePromise, firstOrderPromise, statsPromise]);

    if (profileError || firstOrderError || statsError) {
        log('ERROR', '查詢顧客摘要時資料庫發生錯誤', { ...userContext, targetUserId: userId, errors: { profileError, firstOrderError, statsError } });
        throw new Error('DB_ERROR: 查詢時發生錯誤。');
    }

    // --- 4. 組合回傳資料 ---
    const totalOrders = statsData.length;
    const totalSpent = statsData.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);

    const summary = {
      firstOrderDate: firstOrderData?.created_at || null,
      totalOrders: totalOrders,
      totalSpent: totalSpent,
      cancellationCount: profileData?.cancellation_count || 0,
    };

    log('INFO', '顧客摘要查詢成功', { ...userContext, targetUserId: userId, summary });

    // --- 5. 回傳成功響應 ---
    return new Response(JSON.stringify(summary), {
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