// ==============================================================================
// 檔案路徑: supabase/functions/create-tcat-shipment/index.ts
// 版本: v1.0 - 企業級日誌框架整合
// ------------------------------------------------------------------------------
// 【此為全新檔案，可直接使用】
// ==============================================================================

/**
 * @file Create T-cat Shipment Function (建立黑貓託運單函式)
 * @description 作為安全的 API 閘道，接收來自後台的請求，初始化日誌服務，
 *              並呼叫 TcatService 來執行建立黑貓託運單的核心業務邏輯。
 * @version v1.0
 */

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { TcatService } from '../_shared/services/TcatService.ts';
import LoggingService from '../_shared/services/loggingService.ts';

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
      await logger.warn('未授權的託運單建立嘗試', correlationId, { userEmail: user?.email, userRoles });
      return new Response(JSON.stringify({ error: '權限不足，無法建立託運單。' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // --- 3. 參數驗證 ---
    const { orderId } = await req.json();
    if (!orderId) {
      throw new Error('缺少必要的 orderId 參數。');
    }

    await logger.info(`已授權使用者 ${user.email} 開始建立託運單`, correlationId, { orderId });

    // --- 4. 呼叫核心服務 ---
    const tcatService = new TcatService(supabaseAdmin, logger);
    const result = await tcatService.createShipment(orderId, correlationId);

    // --- 5. 回傳成功結果 ---
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    await logger.critical('create-tcat-shipment 函式發生未預期錯誤', correlationId, error, {});
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});