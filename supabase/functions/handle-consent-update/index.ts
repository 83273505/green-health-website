// ==============================================================================
// 檔案路徑: supabase/functions/handle-consent-update/index.ts
// 版本: v2.0 - 企業級日誌框架整合
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Handle Consent Update Function (處理使用者同意權更新函式)
 * @description 更新使用者的行銷偏好設定，並在 consent_logs 表中留下稽核記錄。
 * @version v2.0
 *
 * @update v2.0 - [ENTERPRISE LOGGING FRAMEWORK INTEGRATION]
 * 1. [核心架構] 引入 `LoggingService` v2.0，取代所有 `console.*` 呼叫。
 * 2. [全域錯誤捕捉] 使用 `withErrorLogging` 中介軟體處理未預期異常。
 * 3. [稽核日誌強化] 對使用者認證、偏好設定變更等關鍵操作加入了詳細的結構化日誌。
 * 4. [非阻斷錯誤處理] 將 `consent_logs` 寫入失敗的事件升級為標準的 `error` 級別日誌，
 *          確保在不影響主流程的情況下，仍能對此類事件進行監控與告警。
 * 5. [追蹤 ID] 整個請求生命週期由 `correlationId` 貫穿。
 */

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import LoggingService, { withErrorLogging } from '../_shared/services/loggingService.ts';

const FUNCTION_NAME = 'handle-consent-update';
const FUNCTION_VERSION = 'v2.0';

async function mainHandler(
  req: Request,
  logger: LoggingService,
  correlationId: string
): Promise<Response> {
  // --- 1. 輸入驗證 ---
  const { consent_type, new_status } = await req.json().catch(() => ({}));
  if (!consent_type || typeof new_status !== 'boolean') {
    logger.warn('無效的輸入參數', correlationId, { consent_type, new_status });
    return new Response(
      JSON.stringify({ error: '請提供 consent_type (string) 和 new_status (boolean)。' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // --- 2. 權限驗證 ---
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    logger.warn('缺少授權標頭', correlationId);
    return new Response(JSON.stringify({ error: '使用者未授權' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

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
  
  logger.info('使用者認證成功，開始更新偏好設定', correlationId, {
      userId: user.id,
      consent_type,
      new_status
  });

  // --- 3. 更新使用者 Profile ---
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('marketing_preferences')
    .eq('id', user.id)
    .single();
  if (profileError) throw profileError;

  const marketingPreferences = profile.marketing_preferences || {};
  const previous_status = marketingPreferences[consent_type] ?? null;
  const newPreferences = { ...marketingPreferences, [consent_type]: new_status };

  const { error: updateProfileError } = await supabaseAdmin
    .from('profiles')
    .update({
      marketing_preferences: newPreferences,
      preferences_last_updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);
  if (updateProfileError) throw updateProfileError;

  // --- 4. 寫入稽核日誌 (非阻斷性) ---
  const { error: logError } = await supabaseAdmin.from('consent_logs').insert({
    user_id: user.id,
    consent_type: consent_type,
    previous_status: previous_status,
    new_status: new_status,
    ip_address: req.headers.get('x-forwarded-for') ?? 'unknown',
    correlation_id: correlationId // 將追蹤 ID 一併寫入
  });
  
  if (logError) {
    // 升級為標準錯誤日誌，以便監控，但不中斷給使用者的成功回應
    logger.error('寫入 consent_logs 稽核記錄失敗 (非阻斷性)', correlationId, logError, {
      userId: user.id,
    });
  }

  logger.info('偏好設定已成功更新', correlationId, { userId: user.id });

  return new Response(JSON.stringify({ message: '偏好設定已成功更新。' }), {
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