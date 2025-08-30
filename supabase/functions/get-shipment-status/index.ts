// ==============================================================================
// 檔案路徑: supabase/functions/get-shipment-status/index.ts
// 版本: v1.0 - 初始建立
// ==============================================================================
/**
@file Get Shipment Status Function (查詢貨態函式)
@description
【核心職責】
此檔案作為一個安全的 API 端點 (API Gateway)，供前端應用程式（如訂單詳情頁）
呼叫，以獲取特定訂單的最新物流配送狀態。
【架構定位】
作為「Functions 層」，它的職責是：
處理 HTTP 請求與回應，包括 CORS 預檢。
透過解析 Authorization 標頭來驗證使用者身份 (JWT)。
校驗傳入的請求參數 (如 orderId)。
呼叫 ShipmentService 來執行實際的業務邏輯。
將 Service 回傳的結果或錯誤，格式化為標準的 JSON 回應給前端。
@version v1.0
*/
import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { ShipmentService } from '../_shared/services/ShipmentService.ts';
import LoggingService, { withErrorLogging } from '../_shared/services/loggingService.ts';
const FUNCTION_NAME = 'get-shipment-status';
const FUNCTION_VERSION = 'v1.0';
async function mainHandler(req: Request, logger: LoggingService, correlationId: string): Promise<Response> {
const { orderId } = await req.json().catch(() => ({ orderId: null }));
if (!orderId) {
logger.warn("請求中缺少必要的 'orderId' 參數", correlationId);
return new Response(JSON.stringify({ error: "請求中缺少必要的 'orderId' 參數。" }), {
status: 400,
headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});
}
// --- 1. 使用者身份驗證 ---
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
logger.info('使用者身份驗證通過，準備查詢貨態', correlationId, { userId: user.id, orderId });
// --- 2. 呼叫 Service 執行核心業務邏輯 ---
// 注意：此處使用 Admin Client，因為 RLS 權限檢查的邏輯已在 Service 層內部完成。
const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const shipmentService = new ShipmentService(supabaseAdmin, logger, correlationId);
// 將使用者 ID 傳入 Service 層進行權限校驗
const result = await shipmentService.getShipmentStatusForOrder(orderId, user.id);
// --- 3. 回傳成功響應 ---
return new Response(JSON.stringify(result), {
status: 200,
headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});
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