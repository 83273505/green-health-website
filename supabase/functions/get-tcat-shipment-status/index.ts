// ==============================================================================
// 檔案路徑: supabase/functions/get-tcat-shipment-status/index.ts
// 版本: v1.0 - 核心功能首次發布
// ------------------------------------------------------------------------------
// 【此為全新檔案，可直接使用】
// ==============================================================================

/**
 * @file Get T-cat Shipment Status Function (獲取黑貓託運單貨態函式)
 * @description 作為安全的 API 閘道，接收來自後台的請求，驗證權限，
 *              並呼叫 TcatService 來執行獲取託運單最新狀態的核心業務邏輯。
 * @version v1.0
 */

import { createClient, crypto } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { TcatService } from '../_shared/services/TcatService.ts';
import LoggingService from '../_shared/services/loggingService.ts';

// 權限設定：與建立託運單的權限保持一致
const ALLOWED_ROLES = ['warehouse_staff', 'super_admin'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // --- 1. 初始化日誌服務與 Supabase Admin ---
  const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const logger = new LoggingService(supabaseAdmin);
  const correlationId = crypto.randomUUID();

  try {
    // --- 2. 安全驗證 ---
    const supabaseUserClient = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );
    
    const { data: { user } } = await supabaseUserClient.auth.getUser();
    const userRoles = user?.app_metadata?.roles || [];
    const isAuthorized = userRoles.some(role => ALLOWED_ROLES.includes(role));

    if (!user || !isAuthorized) {
      await logger.warn('未授權的貨態查詢嘗試', correlationId, { userEmail: user?.email, userRoles });
      return new Response(JSON.stringify({ error: '權限不足，無法查詢貨態。' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // --- 3. 參數驗證 ---
    const { trackingNumbers } = await req.json();
    if (!trackingNumbers || !Array.isArray(trackingNumbers) || trackingNumbers.length === 0) {
      throw new Error('缺少必要的 trackingNumbers 參數，或格式不正確 (應為陣列)。');
    }

    await logger.info(`已授權使用者 ${user.email} 開始查詢貨態`, correlationId, { trackingNumbers });

    // --- 4. 呼叫核心服務 ---
    const tcatService = new TcatService(supabaseAdmin, logger);
    const result = await tcatService.getShipmentStatus(trackingNumbers, correlationId);

    // --- 5. 回傳成功結果 ---
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    await logger.critical('get-tcat-shipment-status 函式發生未預期錯誤', correlationId, error, {});
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});