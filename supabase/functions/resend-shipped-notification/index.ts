// ==============================================================================
// 檔案路徑: supabase/functions/resend-shipped-notification/index.ts
// 版本: v1.0 - 安全重構、架構優化與日誌整合
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Resend Shipped Notification Function (重寄出貨通知函式)
 * @description 允許授權使用者為已出貨的訂單手動重新發送出貨通知郵件。
 * @version v1.0
 *
 * @update v1.0 - [SECURITY REFACTOR, ARCHITECTURE & LOGGING]
 * 1. [核心安全修正] 新增了 RBAC 權限檢查，僅允許 'warehouse_staff' 或 'super_admin'
 *          執行此操作，徹底修復了未授權存取漏洞。
 * 2. [架構優化] 移除了本地的郵件範本生成邏輯，改為呼叫全新的、可複用的
 *          `NotificationService`，遵循了 DRY (Don't Repeat Yourself) 原則。
 * 3. [核心架構] 引入 `LoggingService` v2.0，並使用 `withErrorLogging` 處理異常。
 * 4. [安全稽核日誌] 對每一次手動重寄郵件的操作都留下了詳細的 `audit` 級別日誌。
 */

import { createClient, Resend } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { NotificationService } from '../_shared/services/NotificationService.ts';
import LoggingService, { withErrorLogging } from '../_shared/services/loggingService.ts';

const FUNCTION_NAME = 'resend-shipped-notification';
const FUNCTION_VERSION = 'v1.0';

const ALLOWED_ROLES = ['warehouse_staff', 'super_admin'];

async function mainHandler(req: Request, logger: LoggingService, correlationId: string): Promise<Response> {
    // --- 1. 權限驗證 ---
    const supabaseUserClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );
    const { data: { user } } = await supabaseUserClient.auth.getUser();
    const roles: string[] = user?.app_metadata?.roles || [];
    if (!user || !roles.some(r => ALLOWED_ROLES.includes(r))) {
        logger.warn('權限不足，操作被拒絕', correlationId, { callerUserId: user?.id, callerRoles: roles });
        return new Response(JSON.stringify({ error: '權限不足。' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // --- 2. 輸入驗證 ---
    const { orderId } = await req.json().catch(() => ({}));
    if (!orderId) {
        logger.warn('缺少必要的 orderId 參數', correlationId, { operatorId: user.id });
        return new Response(JSON.stringify({ error: '缺少必要的 orderId 參數。' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    logger.info('授權成功，準備重寄出貨通知', correlationId, { operatorId: user.id, orderId });

    // --- 3. 核心邏輯 ---
    const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        { auth: { persistSession: false } }
    );
    const resend = new Resend(Deno.env.get('RESEND_API_KEY')!);
    const notificationService = new NotificationService();

    const { data: orderDetails, error: detailsError } = await supabaseAdmin
      .from('orders')
      .select(`*, profiles(email), order_items(quantity, price_at_order, product_variants(name, products(name)))`)
      .eq('id', orderId)
      .eq('status', 'shipped')
      .single();

    if (detailsError) {
        logger.warn('查詢不到指定的已出貨訂單', correlationId, { operatorId: user.id, orderId });
        return new Response(JSON.stringify({ error: '找不到指定的已出貨訂單，或查詢時發生錯誤。' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const recipientEmail = orderDetails.profiles?.email || orderDetails.customer_email;
    if (!recipientEmail) {
        logger.error('訂單找不到顧客 Email，無法重寄通知', correlationId, new Error("Missing recipient email"), { operatorId: user.id, orderId });
        return new Response(JSON.stringify({ error: `訂單 ${orderDetails.order_number} 找不到顧客 Email，無法重寄通知。` }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    try {
        const emailText = notificationService.createShippedEmailText(orderDetails, true); // 標記為重寄
        await resend.emails.send({
          from: 'Green Health 出貨中心 <service@greenhealthtw.com.tw>',
          to: [recipientEmail],
          bcc: ['a896214@gmail.com'],
          reply_to: 'service@greenhealthtw.com.tw',
          subject: `[重寄] 您的 Green Health 訂單 ${orderDetails.order_number} 已出貨`,
          text: emailText,
        });
    } catch (emailError) {
        logger.error(`郵件服務提供商返回錯誤`, correlationId, emailError, { operatorId: user.id, orderId });
        throw new Error('郵件服務提供商 (Resend) 返回錯誤。'); // 拋出讓 withErrorLogging 處理
    }

    // --- 4. 記錄稽核日誌並回傳成功響應 ---
    logger.audit('出貨通知已成功手動重寄', correlationId, {
        operatorId: user.id,
        orderId: orderId,
        recipientEmail: recipientEmail,
    });

    return new Response(JSON.stringify({ 
      success: true, 
      message: `訂單 #${orderDetails.order_number} 的出貨通知已成功重新發送。`
    }), { 
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') { 
        return new Response('ok', { headers: corsHeaders }); 
    }
    const logger = new LoggingService(FUNCTION_NAME, FUNCTION_VERSION);
    const wrappedHandler = withErrorLogging(mainHandler, logger);
    return await wrappedHandler(req);
});