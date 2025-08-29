// ==============================================================================
// 檔案路徑: supabase/functions/convert-anonymous-user/index.ts
// 版本: v45.0 - 企業級日誌與安全稽核整合
// ------------------------------------------------------------------------------
// 【此為全新檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Convert Anonymous User Function (匿名使用者轉正函式)
 * @description 實現「無感註冊」的核心後端邏輯。此函式負責為一個已存在的
 *              匿名使用者，安全地“補上”Email 和密碼，使其轉化為正式會員。
 * @version v45.0
 *
 * @update v45.0 - [ENTERPRISE LOGGING & SECURITY AUDIT INTEGRATION]
 * 1. [核心架構] 引入 `LoggingService` v2.0，並使用 `withErrorLogging` 處理異常。
 * 2. [安全稽核日誌] 對每一次成功的匿名使用者轉正操作，都留下了詳細的 `audit` 級別
 *          日誌，記錄了原始匿名 ID 與新 Email 的對應關係。
 * 3. [錯誤處理優化] 針對「Email 已存在」的場景，回傳語意更明確的 409 狀態碼，
 *          並記錄對應的 `warn` 日誌。
 *
 * @update v44.1 - [SYNTAX FIX]
 * 1. [修正] 修正了因錯誤使用 Markdown 註解導致的 TypeScript 語法解析錯誤。
 */

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import LoggingService, { withErrorLogging } from '../_shared/services/loggingService.ts';

const FUNCTION_NAME = 'convert-anonymous-user';
const FUNCTION_VERSION = 'v45.0';

async function mainHandler(req: Request, logger: LoggingService, correlationId: string): Promise<Response> {
  // --- 1. 初始化 Admin Client 並驗證請求者身份 ---
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
  );
  const { data: { user } } = await supabaseAdmin.auth.getUser();
  if (!user) {
    logger.warn('使用者未授權或 Token 無效', correlationId);
    return new Response(JSON.stringify({ error: '使用者未授權或 Token 無效。' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // --- 2. 解析請求參數並進行基礎驗證 ---
  const { newPassword, email } = await req.json().catch(() => ({}));
  if (!newPassword || newPassword.length < 6) {
    logger.warn('密碼長度不足', correlationId, { userId: user.id });
    return new Response(JSON.stringify({ error: '密碼為必填項，且長度至少需要6位數。' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (!email) {
    logger.warn('缺少 Email 參數', correlationId, { userId: user.id });
    return new Response(JSON.stringify({ error: '缺少必要的 Email 參數。' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  
  // --- 3. 核心邏輯：驗證使用者狀態並執行“升級”操作 ---
  if (!user.is_anonymous) {
    logger.info('使用者已是正式會員，無需轉換', correlationId, { userId: user.id, email: user.email });
    return new Response(JSON.stringify({ success: true, message: '使用者已是正式會員。' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  
  logger.info('授權成功，準備將匿名使用者轉換為正式會員', correlationId, { userId: user.id, newEmail: email });

  const { data: updatedUserResponse, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
    user.id,
    { email: email, password: newPassword, email_confirm: true }
  );

  if (updateError) {
    if (updateError.message.includes('unique constraint')) {
      logger.warn('Email 已被註冊', correlationId, { userId: user.id, email });
      return new Response(JSON.stringify({ error: '此 Email 已被註冊，請嘗試使用其他 Email 登入。' }), {
        status: 409, // 409 Conflict
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    throw updateError; // 其他資料庫錯誤由 withErrorLogging 捕捉
  }

  // --- 4. 記錄稽核日誌並回傳成功響應 ---
  logger.audit('匿名使用者已成功轉換為正式會員', correlationId, {
    anonymousUserId: user.id,
    newEmail: updatedUserResponse.user?.email,
    newUserId: updatedUserResponse.user?.id
  });

  return new Response(
    JSON.stringify({
      success: true,
      message: '帳號已成功升級為正式會員！',
      user: {
        id: updatedUserResponse.user?.id,
        email: updatedUserResponse.user?.email,
      },
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const logger = new LoggingService(FUNCTION_NAME, FUNCTION_VERSION);

  // 使用 withErrorLogging 中介軟體包裹主要處理邏輯
  const wrappedHandler = withErrorLogging(mainHandler, logger);

  return await wrappedHandler(req);
});