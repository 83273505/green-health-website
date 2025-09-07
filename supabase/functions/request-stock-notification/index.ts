// 檔案路徑: supabase/functions/request-stock-notification/index.ts
/**
 * 檔案名稱：index.ts
 * 檔案職責：處理使用者對缺貨商品的「貨到通知」登記請求。
 * 版本：1.0
 * SOP 條款對應：
 * - [2.3.3] 錯誤處理策略
 * - [2.3.2] 統一日誌策略
 * AI 註記：
 * - 此為新建的 Edge Function，是「庫存管理昇華專案」的最後一個後端元件。
 * - [核心邏輯]:
 *   1. 接收前端傳來的 `variantId` 和可選的 `email`。
 *   2. 透過 JWT 判斷使用者是否為已登入會員。
 *   3. 根據使用者身份（已登入 vs. 匿名），將請求寫入 `product_stock_notifications` 資料表。
 *   4. 依賴資料庫層級的 UNIQUE 索引來自動處理重複登記的請求，並向前端回傳友善的提示。
 * - [操作指示]: 請建立 `supabase/functions/request-stock-notification` 資料夾，並將此程式碼儲存為 `index.ts`。
 * 更新日誌 (Changelog)：
 * - v1.0 (2025-09-09)：初版建立，實現了完整的登記邏輯與錯誤處理。
 */

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import LoggingService, { withErrorLogging } from '../_shared/services/loggingService.ts';

const FUNCTION_NAME = 'request-stock-notification';
const FUNCTION_VERSION = 'v1.0';
const UUID_REGEXP = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_REGEXP = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function mainHandler(
  req: Request,
  logger: LoggingService,
  correlationId: string
): Promise<Response> {
  const { variantId, email } = await req.json().catch(() => ({ variantId: null, email: null }));

  // --- 1. 輸入驗證 ---
  if (!variantId || typeof variantId !== 'string' || !UUID_REGEXP.test(variantId)) {
    logger.warn('無效的輸入參數：variantId 格式錯誤', correlationId, { received: variantId });
    return new Response(JSON.stringify({ success: false, error: { message: '無效的商品 ID。', code: 'INVALID_INPUT' } }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // --- 2. 身份識別 ---
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
  
  const authHeader = req.headers.get('Authorization');
  let userId: string | null = null;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (user && !user.is_anonymous) {
      userId = user.id;
    }
  }

  const insertPayload: { product_variant_id: string, user_id?: string, email?: string } = {
    product_variant_id: variantId,
  };

  if (userId) {
    insertPayload.user_id = userId;
    logger.info('已登入使用者請求貨到通知', correlationId, { userId, variantId });
  } else {
    if (!email || typeof email !== 'string' || !EMAIL_REGEXP.test(email)) {
      logger.warn('匿名使用者請求貨到通知，但未提供有效 Email', correlationId, { email, variantId });
      return new Response(JSON.stringify({ success: false, error: { message: '請提供有效的 Email 地址。', code: 'INVALID_EMAIL' } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    insertPayload.email = email;
    logger.info('匿名使用者請求貨到通知', correlationId, { email, variantId });
  }

  // --- 3. 執行資料庫寫入 ---
  const { error } = await supabaseAdmin
    .from('product_stock_notifications')
    .insert(insertPayload);
  
  if (error) {
    // 利用資料庫的 UNIQUE 約束來處理重複請求
    if (error.code === '23505') { // unique_violation
      logger.info('使用者重複登記貨到通知', correlationId, { userId, email, variantId });
      return new Response(
        JSON.stringify({ success: true, message: '您已登記過此商品的通知，請耐心等候。' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    // 其他資料庫錯誤
    logger.error('寫入 product_stock_notifications 表時發生錯誤', correlationId, error, insertPayload);
    throw error;
  }
  
  logger.audit('貨到通知請求登記成功', correlationId, { details: insertPayload });

  // --- 4. 回傳成功響應 ---
  return new Response(
    JSON.stringify({
      success: true,
      message: '登記成功！商品到貨後我們將透過 Email 通知您。'
    }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

// 使用企業級日誌與錯誤處理中介軟體
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const logger = new LoggingService(FUNCTION_NAME, FUNCTION_VERSION);
  const wrappedHandler = withErrorLogging(mainHandler, logger);

  return await wrappedHandler(req);
});