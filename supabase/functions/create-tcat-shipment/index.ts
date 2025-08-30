// ==============================================================================
// 檔案路徑: supabase/functions/create-tcat-shipment/index.ts
// 版本: v1.1 - 對齊代理架構
// ------------------------------------------------------------------------------
// 【此為全新檔案，可直接覆蓋】
// 原檔案共 0 行，新檔案共 112 行
// 合理性：此為全新的 Edge Function 端點，作為後台觸發建立託運單的標準
// 入口。它嚴格遵循了專案的安全與日誌標準，包含了完整的 CORS 處理、
// 基於 JWT 的權限驗證、全域錯誤捕捉、日誌框架整合以及呼叫核心服務的
// 所有必要樣板程式碼。
// ==============================================================================
/**
@file Create T-cat Shipment Function (建立黑貓託運單函式)
@description 允許授權的後台使用者為特定訂單建立黑貓託運單。
@version v1.1
@update v1.1 - [ALIGN WITH PROXY ARCHITECTURE]
[架構確認] 端點邏輯無需任何變動。
*/
import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { ShipmentService } from '../_shared/services/ShipmentService.ts';
import LoggingService, { withErrorLogging } from '../_shared/services/loggingService.ts';
const FUNCTION_NAME = 'create-tcat-shipment';
const FUNCTION_VERSION = 'v1.1';
async function mainHandler(req: Request, logger: LoggingService, correlationId: string): Promise<Response> {
const { orderId } = await req.json().catch(() => ({ orderId: null }));
if (!orderId) {
logger.warn("請求中缺少必要的 'orderId' 參數", correlationId);
return new Response(JSON.stringify({ error: "請求中缺少必要的 'orderId' 參數。" }), {
status: 400,
headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});
}
// --- 1. 權限驗證 ---
const supabaseUserClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
global: { headers: { Authorization: req.headers.get('Authorization')! } },
});
const {
data: { user },
error: userError,
} = await supabaseUserClient.auth.getUser();
if (userError || !user) {
logger.warn('使用者認證失敗', correlationId, { error: userError?.message });
return new Response(JSON.stringify({ error: '使用者未授權或 Token 無效。' }), {
status: 401,
headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});
}
// TODO: 根據您的權限模型設定，例如 'permissions:shipments:create' 或 'module:warehouse:operate'
const requiredPermission = 'permissions:users:edit'; // 暫時使用與發票相同的權限
const userPermissions = user.app_metadata?.permissions || [];
if (!userPermissions.includes(requiredPermission)) {
logger.warn('權限不足，建立託運單操作被拒絕', correlationId, {
userId: user.id,
orderId: orderId,
requiredPermission: requiredPermission,
});
return new Response(JSON.stringify({ error: '權限不足，您無法執行此操作。' }), {
status: 403,
headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});
}
logger.info('權限驗證通過，準備建立託運單', correlationId, { userId: user.id, orderId });
// --- 2. 呼叫 Service 執行核心業務邏輯 ---
const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const shipmentService = new ShipmentService(supabaseAdmin, logger, correlationId);
const result = await shipmentService.createShipmentFromOrder(orderId);
// --- 3. 記錄稽核日誌並回傳成功響應 ---
logger.audit('託運單已成功建立', correlationId, {
operatorId: user.id,
orderId: orderId,
trackingNumber: result.obtNumber,
});
return new Response(
JSON.stringify({
success: true,
message: 訂單 (ID: ${orderId}) 的託運單已成功建立。,
data: result,
}),
{
status: 200,
headers: { ...corsHeaders, 'Content-Type': 'application/json' },
}
);
}
// --- Deno.serve 啟動器 ---
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