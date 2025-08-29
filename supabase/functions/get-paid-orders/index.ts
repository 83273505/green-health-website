// ==============================================================================
// 檔案路徑: supabase/functions/get-paid-orders/index.ts
// 版本: v2.1 - 向下相容擴充版
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Get Orders by Status (依狀態獲取訂單函式)
 * @description 根據傳入的訂單狀態，查詢並回傳對應的訂單列表。
 * @version v2.1
 *
 * @update v2.1 - [BACKWARD COMPATIBLE]
 * 1. [核心原則] 維持函式名稱 'get-paid-orders' 不變，確保對現有系統的完全向下相容性。
 * 2. [功能擴充] 擴充 status 參數的接受範圍，新增對 'cancelled' 狀態的支援。
 * 3. [條件化邏輯] 僅在 status 為 'cancelled' 時，才查詢額外欄位並採用新的排序方式，
 *              原有 'paid' 與 'pending_payment' 的查詢邏輯保持不變。
 *
 * @param {string} status - 欲查詢的訂單狀態 ('pending_payment', 'paid', 'cancelled')。
 */

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';

function log(level: 'INFO' | 'ERROR', message: string, context: object = {}) {
  console.log(
    JSON.stringify({
      level,
      timestamp: new Date().toISOString(),
      function: 'get-paid-orders', // 維持原始函式名
      message,
      ...context,
    })
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { status } = await req.json();

    // v2.1 擴充：在不改變函式名稱的前提下，增加對 'cancelled' 狀態的支援
    const allowedStatus = ['pending_payment', 'paid', 'cancelled'];
    if (!status || !allowedStatus.includes(status)) {
      log('ERROR', '缺少或無效的 status 參數', { receivedStatus: status });
      return new Response(JSON.stringify({ error: '缺少或無效的 status 參數' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    log('INFO', '請求已接收', { status });

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 基礎查詢欄位
    let columns = `
      id,
      order_number,
      created_at,
      status,
      payment_status,
      payment_reference,
      shipping_address_snapshot,
      shipping_rates (
        method_name
      )
    `;

    // v2.1 新增：如果請求的是 'cancelled' 狀態，則加入額外的欄位
    if (status === 'cancelled') {
      columns += `,
        cancelled_at,
        cancellation_reason
      `;
    }

    let query = supabaseClient.from('orders').select(columns).eq('status', status);

    // v2.1 調整：根據不同狀態設定排序
    if (status === 'cancelled') {
      // 已取消訂單按取消時間倒序排列
      query = query.order('cancelled_at', { ascending: false });
    } else {
      // 維持原有邏輯：待付款和待出貨訂單按建立時間正序排列
      query = query.order('created_at', { ascending: true });
    }

    // 維持原有 'paid' 狀態的特定過濾邏輯
    if (status === 'paid') {
      query = query.is('shipping_tracking_code', null);
    }

    const { data: orders, error } = await query.limit(100); // 增加上限以防查詢過多資料

    if (error) {
      log('ERROR', '查詢訂單時發生資料庫錯誤', { status, dbError: error.message });
      throw error;
    }

    log('INFO', `查詢成功，找到 ${orders.length} 筆訂單`, { status });

    return new Response(JSON.stringify(orders), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    log('ERROR', '函式發生未預期的錯誤', { errorMessage: error.message });
    return new Response(JSON.stringify({ error: '伺服器內部錯誤' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});