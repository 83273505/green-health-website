// ==============================================================================
// 檔案路徑: supabase/functions/create-tcat-shipment/index.ts
// 版本: v1.1 - 支援動態物流參數
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Create T-cat Shipment Function (建立黑貓託運單函式)
 * @description 作為安全的 API 閘道，接收來自後台的請求，初始化日誌服務，
 *              並呼叫 TcatService 來執行建立黑貓託運單的核心業務邏輯。
 * @version v1.1
 * 
 * @update v1.1 - [FEATURE: DYNAMIC_PARAMS]
 * 1. [核心升級] 能夠接收並處理來自前端的 logisticsParams 物件，
 *          包含溫層、尺寸、是否代收貨款等動態參數。
 * 2. [參數透傳] 將動態參數完整傳遞給 TcatService，取代原有的寫死邏輯。
 */

import { createClient, crypto } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { TcatService } from '../_shared/services/TcatService.ts';
import LoggingService from '../_shared/services/loggingService.ts';

const ALLOWED_ROLES = ['warehouse_staff', 'super_admin'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const logger = new LoggingService(supabaseAdmin);
  const correlationId = crypto.randomUUID();

  try {
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

    // [v1.1] 核心升級: 接收完整的物流參數
    const { orderId, logisticsParams } = await req.json();
    if (!orderId || !logisticsParams) {
      throw new Error('缺少必要的 orderId 或 logisticsParams 參數。');
    }

    await logger.info(`已授權使用者 ${user.email} 開始建立託運單`, correlationId, { orderId, logisticsParams });

    const tcatService = new TcatService(supabaseAdmin, logger);
    // [v1.1] 參數透傳
    const result = await tcatService.createShipment(orderId, logisticsParams, correlationId);

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