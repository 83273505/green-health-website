// 檔案路徑: supabase/functions/get-product-stock-status/index.ts
/**
 * 檔案名稱：index.ts
 * 檔案職責：作為一個安全的 API 端點，供前端批次查詢商品的庫存狀態。
 * 版本：1.0
 * SOP 條款對應：
 * - [3.2.6] 跨層依賴完整性原則 (呼叫了 DB Function `get_public_stock_status`)
 * - [2.3.2] 統一日誌策略
 * AI 註記：
 * - 此為新建的 Edge Function。
 * - [核心邏輯]:
 *   1. 接收前端傳來的商品規格 ID 陣列 (`variantIds`)。
 *   2. 執行基礎的輸入驗證，確保傳入的是有效的 UUID 陣列。
 *   3. 建立一個 `service_role` 權限的 Supabase client。
 *   4. 呼叫我們在步驟 2 建立的資料庫函式 `get_public_stock_status`。
 *   5. 將資料庫函式回傳的結果，包裝成標準的 JSON 格式，回傳給前端。
 * - [操作指示]: 請建立 `supabase/functions/get-product-stock-status` 資料夾，並將此程式碼儲存為 `index.ts`。
 * 更新日誌 (Changelog)：
 * - v1.0 (2025-09-09)：初版建立，實現了完整的業務邏輯與企業級日誌記錄。
 */

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import LoggingService, { withErrorLogging } from '../_shared/services/loggingService.ts';

const FUNCTION_NAME = 'get-product-stock-status';
const FUNCTION_VERSION = 'v1.0';
const UUID_REGEXP = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function mainHandler(
  req: Request,
  logger: LoggingService,
  correlationId: string
): Promise<Response> {
  // 步驟 1: 解析並驗證輸入參數
  const { variantIds } = await req.json().catch(() => ({ variantIds: null }));

  if (!Array.isArray(variantIds) || variantIds.length === 0 || !variantIds.every(id => typeof id === 'string' && UUID_REGEXP.test(id))) {
    logger.warn('無效的輸入參數：variantIds 必須是一個非空的 UUID 字串陣列', correlationId, { received: variantIds });
    return new Response(
      JSON.stringify({ success: false, error: { message: '無效的輸入參數：variantIds 必須是一個非空的 UUID 字串陣列。', code: 'INVALID_INPUT' } }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  logger.info(`收到 ${variantIds.length} 個商品規格的庫存狀態查詢請求`, correlationId, { variantIds });

  // 步驟 2: 建立 Service Role Client 並呼叫資料庫函式
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data, error } = await supabaseAdmin.rpc('get_public_stock_status', {
    variant_ids: variantIds,
  });

  if (error) {
    // 任何資料庫層級的錯誤都將由此處拋出，並由 withErrorLogging 中介軟體捕捉
    logger.error('呼叫 DB 函式 get_public_stock_status 時發生錯誤', correlationId, error, { variantIds });
    throw error;
  }

  logger.info('成功從資料庫函式獲取庫存狀態', correlationId, { count: data.length });

  // 步驟 3: 回傳成功的資料
  return new Response(
    JSON.stringify({
      success: true,
      data: data,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

// 使用企業級日誌與錯誤處理中介軟體來包裹我們的核心邏輯
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const logger = new LoggingService(FUNCTION_NAME, FUNCTION_VERSION);
  const wrappedHandler = withErrorLogging(mainHandler, logger);

  return await wrappedHandler(req);
});