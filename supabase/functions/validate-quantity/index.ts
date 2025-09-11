// 檔案路徑: supabase/functions/validate-quantity/index.ts
/**
 * 檔案名稱：index.ts
 * 檔案職責：提供一個輕量級的、即時的庫存數量預檢服務。
 * 版本：1.0
 * SOP 條款對應：
 * - [專案憲章 ECOMMERCE-V1, 1.1] 交易數據絕對準確性原則
 * AI 註記：
 * - 此為「無聲守護者 v2.0」方案的核心後端實現。
 * - 它接收 variantId 和 requestedQuantity，並直接呼叫 DB Function 
 *   `get_public_stock_status` 來獲取權威的庫存數據，然後回傳一個簡單的布林值結果。
 * - [操作指示]: 請建立 `supabase/functions/validate-quantity` 資料夾，並將此程式碼儲存為 `index.ts`。
 */

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import LoggingService, { withErrorLogging } from '../_shared/services/loggingService.ts';

const FUNCTION_NAME = 'validate-quantity';
const FUNCTION_VERSION = 'v1.0';
const UUID_REGEXP = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function mainHandler(
  req: Request,
  logger: LoggingService,
  correlationId: string
): Promise<Response> {
  const { variantId, requestedQuantity } = await req.json().catch(() => ({}));

  // 1. 輸入驗證
  if (!variantId || typeof variantId !== 'string' || !UUID_REGEXP.test(variantId) || 
      !Number.isInteger(requestedQuantity) || requestedQuantity <= 0) {
    return new Response(JSON.stringify({ success: false, error: { message: '無效的輸入參數。' } }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
  
  // 2. 建立 Admin Client 並呼叫 DB Function
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data, error } = await supabaseAdmin.rpc('get_public_stock_status', {
    variant_ids: [variantId],
  }).single();

  if (error) {
    logger.error('呼叫 DB 函式 get_public_stock_status 時發生錯誤', correlationId, error, { variantId });
    throw error;
  }
  
  if (!data) {
      return new Response(JSON.stringify({ success: false, error: { message: '找不到該商品。' } }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
  }

  // 3. 核心業務邏輯
  const isValid = requestedQuantity <= data.available_stock;

  // 4. 回傳結果
  if (isValid) {
    return new Response(JSON.stringify({ success: true, valid: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } else {
    return new Response(JSON.stringify({
      success: true,
      valid: false,
      message: `庫存不足，此商品最多只能購買 ${data.available_stock} 件。`,
      available_stock: data.available_stock,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  const logger = new LoggingService(FUNCTION_NAME, FUNCTION_VERSION);
  const wrappedHandler = withErrorLogging(mainHandler, logger);
  return await wrappedHandler(req);
});