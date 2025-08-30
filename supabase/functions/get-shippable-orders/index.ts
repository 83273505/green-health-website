// ==============================================================================
// 檔案路徑: supabase/functions/get-shippable-orders/index.ts
// 版本: v1.0 - 初始建立
// ------------------------------------------------------------------------------
// 【此為全新檔案，可直接覆蓋】
// ==============================================================================
/**
@file Get Shippable Orders Function (獲取待出貨訂單函式)
@description
【核心職責】
作為 tcatship-panel 模組的專屬資料接口，此函式負責根據請求的狀態類型
(pending 或 shipped)，從資料庫中查詢對應的訂單列表。
【架構定位】
作為「Functions 層」，它的職責是：
處理 HTTP 請求與回應，包括 CORS 預檢。
透過 JWT 驗證後台操作員的身份與權限。
根據前端傳入的 statusType 參數，執行不同的資料庫查詢邏輯。
將查詢結果安全地格式化後，以 JSON 格式回傳給前端。
@version v1.0
*/
import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import LoggingService, { withErrorLogging } from '../_shared/services/loggingService.ts';
const FUNCTION_NAME = 'get-shippable-orders';
const FUNCTION_VERSION = 'v1.0';
async function mainHandler(req: Request, logger: LoggingService, correlationId: string): Promise<Response> {
const { statusType } = await req.json().catch(() => ({ statusType: null }));
if (!statusType || !['pending', 'shipped'].includes(statusType)) {
logger.warn(請求中缺少或包含無效的 'statusType' 參數, correlationId, { received: statusType });
return new Response(JSON.stringify({ error: "請求中必須包含有效的 'statusType' ('pending' 或 'shipped')。" }), {
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
// 暫時使用與發票系統相同的基礎權限，未來可細化為 'module:shipping:view'
const requiredPermission = 'permissions:users:edit';
const userPermissions = user.app_metadata?.permissions || [];
if (!userPermissions.includes(requiredPermission)) {
logger.warn('權限不足，獲取訂單列表操作被拒絕', correlationId, {
userId: user.id,
requiredPermission: requiredPermission,
});
return new Response(JSON.stringify({ error: '權限不足，您無法執行此操作。' }), {
status: 403,
headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});
}
logger.info(權限驗證通過，準備查詢 (${statusType}) 狀態的訂單, correlationId, { userId: user.id });
// --- 2. 執行資料庫查詢 ---
const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
let query;
if (statusType === 'pending') {
// 查詢處於 'processing' 狀態且尚未有託運單號的訂單
// 這些是真正需要人工介入處理的訂單
query = supabaseAdmin
.from('orders')
.select('id, order_number, created_at, total_amount, shipping_address_snapshot->recipient_name as customer_name')
.eq('status', 'processing')
.is('tracking_number', null)
.order('created_at', { ascending: true }); // 優先處理較早的訂單
} else {
// 'shipped'
// 查詢今天已建立託運單的訂單
const today = new Date();
today.setHours(0, 0, 0, 0); // 設定為今天的開始
query = supabaseAdmin
  .from('orders')
  .select('id, order_number, tracking_number, shipping_address_snapshot->recipient_name as customer_name, updated_at as shipped_at') // updated_at 可視為出貨處理時間
  .eq('shipping_provider', 'tcat')
  .not('tracking_number', 'is', null)
  .gte('updated_at', today.toISOString()) // 只查詢今天更新過的
  .order('updated_at', { ascending: false }); // 顯示最新處理的
}
const { data: orders, error: dbError } = await query;
if (dbError) {
logger.error('查詢訂單時發生資料庫錯誤', correlationId, dbError);
throw dbError; // 讓全域錯誤處理器捕捉
}
// --- 3. 回傳成功響應 ---
return new Response(
JSON.stringify({
success: true,
orders: orders || [],
}),
{
status: 200,
headers: { ...corsHeaders, 'Content-Type': 'application/json' },
}
);
}
// --- Deno.serve 啟動器 ---
Deno.serve(async (req) => {
if (req.method === 'OPTIONS') {
return new Response('ok', { headers: corsHeaders });
}
const logger = new LoggingService(FUNCTION_NAME, FUNCTION_VERSION);
const wrappedHandler = withErrorLogging(mainHandler, logger);
return await wrappedHandler(req);
});
