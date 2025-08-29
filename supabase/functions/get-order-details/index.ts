// ==============================================================================
// 檔案路徑: supabase/functions/get-order-details/index.ts
// 版本: v2.0 - 安全性強化與日誌框架整合
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Get Order Details Function (獲取訂單詳細資訊函式)
 * @description 根據 orderId，安全地查詢並回傳該訂單的商品項目列表。
 * @version v2.0
 *
 * @update v2.0 - [SECURITY ENHANCEMENT & LOGGING INTEGRATION]
 * 1. [核心安全修正] 函式現在強制要求使用者授權 (JWT)。所有查詢都在使用者的
 *          權限上下文中執行，並依賴 RLS 策略確保使用者只能查詢自己的訂單，
 *          徹底修復了先前版本中存在的資料外洩風險。
 * 2. [核心架構] 引入 `LoggingService` v2.0，取代所有 `console.*` 呼叫。
 * 3. [全域錯誤捕捉] 使用 `withErrorLogging` 中介軟體處理未預期異常。
 * 4. [安全稽核日誌] 清晰記錄每一次的查詢請求，包括操作者與目標訂單 ID。
 */

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import LoggingService, { withErrorLogging } from '../_shared/services/loggingService.ts';

const FUNCTION_NAME = 'get-order-details';
const FUNCTION_VERSION = 'v2.0';

async function mainHandler(
  req: Request,
  logger: LoggingService,
  correlationId: string
): Promise<Response> {
  // 步驟 1: 驗證使用者身份
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    logger.warn('缺少授權標頭', correlationId);
    return new Response(JSON.stringify({ error: '使用者未授權' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // 建立在使用者權限上下文中的 Supabase Client
  const supabaseUserClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user } } = await supabaseUserClient.auth.getUser();
  if (!user) {
    logger.warn('無效的 Token，使用者未授權', correlationId);
    return new Response(JSON.stringify({ error: '使用者未授權' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // 步驟 2: 獲取並驗證輸入參數
  const { orderId } = await req.json().catch(() => ({ orderId: null }));
  if (!orderId) {
    logger.warn('缺少 orderId 參數', correlationId, { userId: user.id });
    return new Response(JSON.stringify({ error: '缺少 orderId 參數' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  
  logger.info('授權成功，開始查詢訂單詳細資訊', correlationId, { userId: user.id, orderId });

  // 步驟 3: 使用 user client 進行查詢，自動應用 RLS
  const { data: items, error } = await supabaseUserClient
    .from('order_items')
    .select(
      `
      quantity,
      price_at_order,
      product_variants (
        name, 
        sku,
        products (
          name,
          image_url
        )
      )
    `
    )
    .eq('order_id', orderId);

  // 任何資料庫錯誤都將被 `withErrorLogging` 捕捉
  if (error) {
    throw error;
  }
  
  logger.info(`成功查詢到 ${items.length} 筆商品項目`, correlationId, { userId: user.id, orderId });

  // 步驟 4: 回傳查詢到的商品項目陣列
  return new Response(JSON.stringify(items), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 200,
  });
}

Deno.serve(async (req) => {
  // 處理 CORS 預檢請求
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const logger = new LoggingService(FUNCTION_NAME, FUNCTION_VERSION);

  // 使用 withErrorLogging 中介軟體包裹主要處理邏輯
  const wrappedHandler = withErrorLogging(mainHandler, logger);

  return await wrappedHandler(req);
});