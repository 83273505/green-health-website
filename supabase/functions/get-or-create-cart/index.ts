// ==============================================================================
// 檔案路徑: supabase/functions/get-or-create-cart/index.ts
// 版本: v43.0 - 企業級日誌框架整合
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Get or Create Cart Function (獲取或建立購物車函式)
 * @description 處理使用者（包括匿名使用者）購物流程的起點。
 * @version v43.0
 *
 * @update v43.0 - [ENTERPRISE LOGGING FRAMEWORK INTEGRATION]
 * 1. [核心架構] 引入 `LoggingService` v2.0，取代所有 `console.*` 呼叫。
 * 2. [全域錯誤捕捉] 使用 `withErrorLogging` 中介軟體處理未預期異常。
 * 3. [情境感知日誌] 清晰記錄是為「已登入使用者」還是「匿名訪客」分配購物車，
 *          並記錄回傳的匿名 token，極大提升了使用者會話的可追溯性。
 * 4. [追蹤 ID] 整個請求生命週期由 `correlationId` 貫穿。
 *
 * @update v42.2 - [ANONYMOUS USER PERSISTENCE SYNC]
 * 1. [核心修正] 為了配合前端 CartService (v42.2) 的匿名身份持久化策略，
 *          此函式現在會在建立匿名使用者時，一併回傳其 access_token。
 * 2. [原理] 前端將儲存此 token，並在下次初始化時透過 supabase.auth.setSession()
 *          來恢復同一個匿名會話，確保了 RLS 策略的正確性。
 * 3. [不變] 對於已登入的真實使用者，token 欄位將回傳 null，行為保持不變。
 */

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import LoggingService, { withErrorLogging } from '../_shared/services/loggingService.ts';

const FUNCTION_NAME = 'get-or-create-cart';
const FUNCTION_VERSION = 'v43.0';

async function mainHandler(
  req: Request,
  logger: LoggingService,
  correlationId: string
): Promise<Response> {
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } }
  );

  const authHeader = req.headers.get('Authorization');
  let user = null;
  let session = null; // [v42.2 新增] 用於儲存 session 以獲取 token

  // 步驟 1: 嘗試從 Authorization 標頭中獲取已登入的使用者
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const { data } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''));
    if (data.user) {
      user = data.user;
      logger.info('透過 JWT 識別到已登入使用者', correlationId, { userId: user.id });
    }
  }

  // 步驟 2: 如果沒有已登入的使用者，則建立一個匿名使用者
  if (!user) {
    logger.info('無有效 JWT，開始建立匿名使用者會話', correlationId);
    const {
      data: anonData,
      error: anonError,
    } = await supabaseAdmin.auth.signInAnonymously();
    if (anonError || !anonData.user || !anonData.session) {
      throw anonError || new Error('建立匿名使用者失敗。');
    }
    user = anonData.user;
    session = anonData.session; // [v42.2 新增] 保存匿名使用者的 session
    logger.info('成功建立匿名使用者會話', correlationId, { userId: user.id });
  }

  const isAnonymous = !user.email;
  const userId = user.id;

  // 步驟 3: 為使用者找到或建立一個活躍的購物車
  const { data: cart, error: cartError } = await supabaseAdmin
    .from('carts')
    .upsert({ user_id: userId, status: 'active' }, { onConflict: 'user_id' })
    .select('id')
    .single();

  if (cartError) throw cartError;

  logger.info('成功為使用者分配購物車', correlationId, {
    userId,
    cartId: cart.id,
    isAnonymous,
  });

  const responsePayload = {
    cartId: cart.id,
    isAnonymous: isAnonymous,
    userId: userId,
    // [v42.2 核心修正] 如果是匿名使用者，回傳其 token；否則回傳 null
    token: isAnonymous ? session?.access_token : null,
  };
  
  logger.info('準備回傳購物車資料', correlationId, {
      cartId: responsePayload.cartId,
      userId: responsePayload.userId,
      isAnonymous: responsePayload.isAnonymous,
      tokenReturned: !!responsePayload.token,
  });

  // 步驟 4: 回傳包含匿名狀態、User ID 和 Token 的完整資料
  return new Response(JSON.stringify(responsePayload), {
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