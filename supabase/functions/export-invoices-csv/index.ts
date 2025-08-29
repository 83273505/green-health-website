// ==============================================================================
// 檔案路徑: supabase/functions/export-invoices-csv/index.ts
// 版本: v48.0 - 企業級日誌與安全稽核整合
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Export Invoices to CSV Function (匯出待開立發票為 CSV 函式)
 * @description 為後台管理員提供一個備用的發票開立方案。此函式能根據傳入的
 *              發票 ID 陣列，精準匯出指定的發票；若無指定 ID，則匯出所有
 *              符合條件的發票。
 * @version v48.0
 *
 * @update v48.0 - [ENTERPRISE LOGGING & SECURITY AUDIT INTEGRATION]
 * 1. [核心架構] 引入 `LoggingService` v2.0，取代所有 `console.*` 呼叫。
 * 2. [全域錯誤捕捉] 使用 `withErrorLogging` 中介軟體處理未預期異常。
 * 3. [安全稽核日誌] 對每一次 CSV 匯出操作都留下了詳細的稽核日誌，記錄了
 *          操作者、查詢條件及匯出結果摘要。
 *
 * @update v47.4 - [CSV FORMAT FINAL FIX]
 * 1. [核心修正] 徹底重構 `CSV_HEADERS` 陣列，使其欄位順序、名稱與數量
 *          與速買配官方範例檔案 100% 一致。
 */

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { stringify } from 'std/csv';
import LoggingService, { withErrorLogging } from '../_shared/services/loggingService.ts';

const FUNCTION_NAME = 'export-invoices-csv';
const FUNCTION_VERSION = 'v48.0';

const CSV_HEADERS = [
  "發票號碼", "隨機碼", "發票日期", "發票時間", "稅率類型", "課稅別",
  "買受人註記", "通關方式註記", "彙開註記", "零稅率註記", "捐贈", "愛心碼",
  "信用卡末四碼", "自訂發票編號", "自訂號碼", "商品明細", "數量明細",
  "單價明細", "單位明細", "各明細總額", "總金額(含稅)", "單價含稅",
  "買受人統編", "買受人公司名稱", "買受人姓名", "電話", "傳真",
  "信箱", "地址", "載具類型", "載具ID明碼", "載具ID暗碼",
  "發票證明聯備註"
];

async function mainHandler(req: Request, logger: LoggingService, correlationId: string): Promise<Response> {
  // --- 1. 安全驗證 ---
  const supabaseUserClient = createClient(
    Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
  );
  const { data: { user } } = await supabaseUserClient.auth.getUser();
  if (!user || !(user.app_metadata?.permissions || []).includes('module:invoicing:view')) {
    logger.warn('權限不足，操作被拒絕', correlationId, { callerUserId: user?.id });
    return new Response(JSON.stringify({ error: '權限不足。' }), { status: 403, headers: corsHeaders });
  }

  // --- 2. 解析請求主體 ---
  const payload = await req.json().catch(() => ({}));
  const invoiceIds = payload.invoiceIds;
  logger.info('授權成功，開始處理 CSV 匯出請求', correlationId, { operatorId: user.id, hasSpecificIds: Array.isArray(invoiceIds) && invoiceIds.length > 0 });

  // --- 3. 深度資料查詢 ---
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
  let query = supabaseAdmin
    .from('invoices')
    .select(`*, orders ( *, order_items ( *, product_variants (name)))`)
    .eq('orders.status', 'shipped');

  if (Array.isArray(invoiceIds) && invoiceIds.length > 0) {
    query = query.in('id', invoiceIds);
  } else {
    query = query.in('status', ['pending', 'failed']);
  }
    
  const { data: invoices, error } = await query;
  if (error) throw error; // 由 withErrorLogging 捕捉
  
  logger.info(`查詢完成，共找到 ${invoices?.length ?? 0} 筆發票資料待匯出`, correlationId, { operatorId: user.id });

  if (!invoices || invoices.length === 0) {
    const emptyCsv = await stringify([CSV_HEADERS, ["沒有找到符合條件的待處理發票"]]);
    return new Response(emptyCsv, { headers: { ...corsHeaders, 'Content-Type': 'text/csv' } });
  }

  // --- 4. CSV 格式轉換核心邏輯 ---
  const csvData = invoices.map(invoice => {
    const order = invoice.orders;
    const createdAt = new Date(order.created_at);
    const descriptions: string[] = (order.order_items || []).map(item => item.product_variants?.name || '商品');
    const quantities: string[] = (order.order_items || []).map(item => String(item.quantity));
    const unitPrices: string[] = (order.order_items || []).map(item => String(item.price_at_order));
    const units: string[] = (order.order_items || []).map(() => '件');
    const amounts: string[] = (order.order_items || []).map(item => String(item.price_at_order * item.quantity));

    if (Number(order.coupon_discount) > 0) {
      descriptions.push('優惠折扣'); quantities.push('1'); unitPrices.push(String(-Number(order.coupon_discount))); units.push('式'); amounts.push(String(-Number(order.coupon_discount)));
    }
    if (Number(order.shipping_fee) > 0) {
      descriptions.push('運費'); quantities.push('1'); unitPrices.push(String(order.shipping_fee)); units.push('式'); amounts.push(String(order.shipping_fee));
    }
    
    const carrierMapping: Record<string, string> = { 'member': 'EJ0113', 'mobile': '3J0002', 'certificate': 'CQ0001' };

    return {
      "發票號碼": '', "隨機碼": '',
      "發票日期": `${createdAt.getFullYear()}/${String(createdAt.getMonth() + 1).padStart(2, '0')}/${String(createdAt.getDate()).padStart(2, '0')}`,
      "發票時間": `${String(createdAt.getHours()).padStart(2, '0')}:${String(createdAt.getMinutes()).padStart(2, '0')}:${String(createdAt.getSeconds()).padStart(2, '0')}`,
      "稅率類型": '07', "課稅別": '1', "買受人註記": '', "通關方式註記": '', "彙開註記": '', "零稅率註記": '',
      "捐贈": invoice.type === 'donation' ? '1' : '0', "愛心碼": invoice.donation_code || '',
      "信用卡末四碼": '', "自訂發票編號": `INV-${invoice.id}`, "自訂號碼": order.order_number,
      "商品明細": descriptions.join('|'), "數量明細": quantities.join('|'), "單價明細": unitPrices.join('|'),
      "單位明細": units.join('|'), "各明細總額": amounts.join('|'), "總金額(含稅)": String(order.total_amount),
      "單價含稅": 'Y', "買受人統編": invoice.vat_number || '', "買受人公司名稱": invoice.company_name || '',
      "買受人姓名": invoice.type !== 'business' ? (invoice.recipient_name || order.customer_name) : '',
      "電話": '', "傳真": '', "信箱": invoice.recipient_email || order.customer_email, "地址": '',
      "載具類型": invoice.type === 'cloud' ? (carrierMapping[invoice.carrier_type] || '') : '',
      "載具ID明碼": invoice.type === 'cloud' ? (invoice.carrier_number || '') : '',
      "載具ID暗碼": invoice.type === 'cloud' ? (invoice.carrier_number || '') : '',
      "發票證明聯備註": '',
    };
  });

  // --- 5. 產生 CSV 字串並回傳 ---
  const csvString = await stringify(csvData, { columns: CSV_HEADERS, headers: true });
  const fileName = `invoices_export_${new Date().toISOString().slice(0, 10)}.csv`;
  const headers = {
    ...corsHeaders,
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${fileName}"`
  };
  
  logger.info(`CSV 檔案產生成功，準備回傳 ${csvData.length} 筆發票資料`, correlationId, { operatorId: user.id, fileName });

  return new Response(csvString, { headers });
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