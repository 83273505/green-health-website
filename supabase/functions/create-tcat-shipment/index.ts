//// ==============================================================================
// 檔案路徑: supabase/functions/create-tcat-shipment/index.ts
// 版本: v1.2 - 整合物流資料覆寫層
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Create T-cat Shipment Function (建立黑貓託運單函式)
 * @description 接收前端請求，儲存操作員的物流資料修改，並呼叫核心服務建立託運單。
 * @version v1.2
 * 
 * @update v1.2 - [FEATURE: LOGISTICS_OVERRIDE]
 * 1. [核心升級] 能夠接收前端傳遞的 `overrideData` 物件。
 * 2. [資料庫整合] 在建立託運單前，會先將 `overrideData` 儲存至
 *          `orders` 表的 `shipping_details_override` 欄位，確保修改被永久記錄。
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

    const { orderId, logisticsParams, overrideData } = await req.json();
    if (!orderId || !logisticsParams) {
      throw new Error('缺少必要的 orderId 或 logisticsParams 參數。');
    }

    // [v1.2] 核心步驟：儲存操作員的修改
    if (overrideData && Object.keys(overrideData).length > 0) {
        await logger.info(`偵測到物流資料覆寫，正在更新資料庫`, correlationId, { orderId, overrideData });
        const { error: updateError } = await supabaseAdmin
            .from('orders')
            .update({ shipping_details_override: overrideData })
            .eq('id', orderId);
        
        if (updateError) {
            await logger.critical(`更新物流覆寫資料失敗`, correlationId, updateError, { orderId });
            throw new Error(`儲存物流修改失敗: ${updateError.message}`);
        }
    }

    await logger.info(`已授權使用者 ${user.email} 開始建立託運單`, correlationId, { orderId, logisticsParams });

    const tcatService = new TcatService(supabaseAdmin, logger);
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