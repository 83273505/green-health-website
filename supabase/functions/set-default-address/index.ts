// ==============================================================================
// 檔案路徑: supabase/functions/set-default-address/index.ts
// 版本: v2.0 - 企業級日誌與安全稽核整合
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Set Default Address Function (設定預設地址函式)
 * @description 允許已登入的使用者將其名下的某個地址設定為預設地址。
 * @version v2.0
 *
 * @update v2.0 - [ENTERPRISE LOGGING & SECURITY AUDIT INTEGRATION]
 * 1. [核心架構] 引入 `LoggingService` v2.0，並使用 `withErrorLogging` 處理異常。
 * 2. [安全稽核日誌] 對每一次預設地址的變更操作都留下了詳細的 `audit` 級別日誌，
 *          記錄了操作者與目標地址 ID，實現了完整的操作追蹤。
 * 3. [標準化] 程式碼結構與平台其他函式保持一致，提升了可維護性。
 */

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import LoggingService, { withErrorLogging } from '../_shared/services/loggingService.ts';

const FUNCTION_NAME = 'set-default-address';
const FUNCTION_VERSION = 'v2.0';

async function mainHandler(req: Request, logger: LoggingService, correlationId: string): Promise<Response> {
  // --- 1. 權限驗證 ---
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    logger.warn('缺少授權標頭', correlationId);
    return new Response(JSON.stringify({ error: '使用者未授權' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''));
  if (userError || !user) {
    logger.warn('使用者認證失敗', correlationId, { error: userError?.message });
    return new Response(JSON.stringify({ error: '使用者認證失敗。' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // --- 2. 輸入驗證 ---
  const { addressId } = await req.json().catch(() => ({}));
  if (!addressId) {
    logger.warn('請求主體中缺少 addressId', correlationId, { userId: user.id });
    return new Response(JSON.stringify({ error: '請求主體中缺少 addressId。' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  logger.info('授權成功，準備設定預設地址', correlationId, { userId: user.id, addressId });

  // --- 3. 核心事務邏輯 ---
  // 步驟 3.1: 將該使用者所有的地址都設為非預設
  const { error: resetError } = await supabaseAdmin
    .from('addresses')
    .update({ is_default: false })
    .eq('user_id', user.id);
  if (resetError) throw resetError;

  // 步驟 3.2: 將指定的地址 ID 設為預設
  const { error: setError } = await supabaseAdmin
    .from('addresses')
    .update({ is_default: true })
    .eq('id', addressId)
    .eq('user_id', user.id); // 雙重確認這個地址確實屬於該使用者
  if (setError) throw setError;

  // --- 4. 記錄稽核日誌並回傳成功響應 ---
  logger.audit('預設地址已成功設定', correlationId, {
    operatorId: user.id,
    newDefaultAddressId: addressId,
  });

  return new Response(JSON.stringify({ message: '預設地址已成功更新。' }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 200,
  });
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