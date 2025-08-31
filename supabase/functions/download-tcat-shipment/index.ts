// ==============================================================================
// 檔案路徑: supabase/functions/download-tcat-shipment/index.ts
// 版本: v1.0 - 核心功能首次發布
// ------------------------------------------------------------------------------
// 【此為全新檔案，可直接使用】
// ==============================================================================

/**
 * @file Download T-cat Shipment PDF Function (下載黑貓託運單 PDF 函式)
 * @description 作為安全的 API 閘道，接收前端請求，驗證權限，並呼叫 TcatService
 *              來獲取託運單的 PDF 二進位資料流，然後回傳給前端。
 * @version v1.0
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
      await logger.warn('未授權的託運單下載嘗試', correlationId, { userEmail: user?.email });
      return new Response(JSON.stringify({ error: '權限不足。' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { fileNo, trackingNumber } = await req.json();
    if (!fileNo || !trackingNumber) {
      throw new Error('缺少必要的 fileNo 或 trackingNumber 參數。');
    }

    await logger.info(`已授權使用者 ${user.email} 開始下載託運單`, correlationId, { fileNo, trackingNumber });

    const tcatService = new TcatService(supabaseAdmin, logger);
    const pdfBlob = await tcatService.downloadShipmentPDF(fileNo, trackingNumber, correlationId);

    // 關鍵步驟：回傳二進位資料流
    return new Response(pdfBlob, {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="tcat-shipment-${trackingNumber}.pdf"`
      },
      status: 200,
    });

  } catch (error) {
    await logger.critical('download-tcat-shipment 函式發生未預期錯誤', correlationId, error, {});
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});