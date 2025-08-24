// ==============================================================================
// 檔案路徑: supabase/functions/export-invoices-xlsx/index.ts
// 版本: v47.5 - XLSX 批次匯出功能 (最終方案)
// ------------------------------------------------------------------------------
// 【此為全新檔案，可直接使用】
// ==============================================================================

/**
 * @file Export Invoices to XLSX Function (匯出待開立發票為 XLSX 函式)
 * @description 為後台管理員提供一個更穩健的備用發票開立方案。此函式能根據
 *              傳入的發票 ID 陣列，精準匯出指定的發票為速買配 (SmilePay)
 *              批次上傳格式所要求的 XLSX (Excel) 檔案。
 * @version v47.5
 */

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import * as xlsx from 'sheetjs';

// [v47.5] 根據速買配官方文件，定義 XLSX 的欄位標頭
const XLSX_HEADERS = [
  "發票號碼", "隨機碼", "發票日期", "發票時間", "稅率類型", "課稅別", 
  "買受人註記", "通關方式註記", "彙開註記", "零稅率註記", "捐贈", "愛心碼", 
  "信用卡末四碼", "自訂發票編號", "自訂號碼", "商品明細", "數量明細",
  "單價明細", "單位明細", "各明細總額", "總金額(含稅)", "單價含稅",
  "買受人統編", "買受人公司名稱", "買受人姓名", "電話", "傳真",
  "信箱", "地址", "載具類型", "載具ID明碼", "載具ID暗碼",
  "發票證明聯備註"
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // --- 1. 安全驗證 ---
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    const supabaseUserClient = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );
    const { data: { user } } = await supabaseUserClient.auth.getUser();
    if (!user || !(user.app_metadata?.permissions || []).includes('module:invoicing:view')) {
      return new Response(JSON.stringify({ error: '權限不足。' }), { status: 403, headers: corsHeaders });
    }

    // --- 2. 解析請求主體 ---
    const payload = await req.json().catch(() => ({}));
    const invoiceIds = payload.invoiceIds;

    // --- 3. 深度資料查詢 ---
    let query = supabaseAdmin
      .from('invoices')
      .select(`*, orders ( *, order_items ( *, product_variants (name)))`)
      .in('status', ['pending', 'failed']) // 可匯出待開立或失敗的
      .eq('orders.status', 'shipped');

    if (Array.isArray(invoiceIds) && invoiceIds.length > 0) {
      query = query.in('id', invoiceIds);
    }
      
    const { data: invoices, error } = await query;

    if (error) throw error;

    // --- 4. XLSX 格式轉換核心邏輯 ---
    const worksheetData = [];
    worksheetData.push(XLSX_HEADERS); // 加入標頭列

    if (!invoices || invoices.length === 0) {
        worksheetData.push(["沒有找到符合條件的待處理發票"]);
    } else {
        invoices.forEach(invoice => {
            const order = invoice.orders;
            const createdAt = new Date(order.created_at);
            const descriptions: string[] = (order.order_items || []).map(item => item.product_variants?.name || '商品');
            const quantities: (string|number)[] = (order.order_items || []).map(item => item.quantity);
            const unitPrices: (string|number)[] = (order.order_items || []).map(item => item.price_at_order);
            const units: string[] = (order.order_items || []).map(() => '件');
            const amounts: (string|number)[] = (order.order_items || []).map(item => item.price_at_order * item.quantity);

            if (Number(order.coupon_discount) > 0) {
                descriptions.push('優惠折扣'); quantities.push(1); unitPrices.push(-Number(order.coupon_discount)); units.push('式'); amounts.push(-Number(order.coupon_discount));
            }
            if (Number(order.shipping_fee) > 0) {
                descriptions.push('運費'); quantities.push(1); unitPrices.push(order.shipping_fee); units.push('式'); amounts.push(order.shipping_fee);
            }
            
            const carrierMapping: Record<string, string> = { 'member': 'EJ0113', 'mobile': '3J0002', 'certificate': 'CQ0001' };

            const rowData = {
                "發票號碼": '', "隨機碼": '',
                "發票日期": `${createdAt.getFullYear()}/${String(createdAt.getMonth() + 1).padStart(2, '0')}/${String(createdAt.getDate()).padStart(2, '0')}`,
                "發票時間": `${String(createdAt.getHours()).padStart(2, '0')}:${String(createdAt.getMinutes()).padStart(2, '0')}:${String(createdAt.getSeconds()).padStart(2, '0')}`,
                "稅率類型": '07', "課稅別": '1', "買受人註記": '', "通關方式註記": '', "彙開註記": '', "零稅率註記": '',
                "捐贈": invoice.type === 'donation' ? '1' : '0',
                "愛心碼": invoice.donation_code || '',
                "信用卡末四碼": '', "自訂發票編號": `INV-${invoice.id}`, "自訂號碼": order.order_number,
                "商品明細": descriptions.join('|'), "數量明細": quantities.join('|'), "單價明細": unitPrices.join('|'),
                "單位明細": units.join('|'), "各明細總額": amounts.join('|'), "總金額(含稅)": order.total_amount,
                "單價含稅": 'Y', "買受人統編": invoice.vat_number || '', "買受人公司名稱": invoice.company_name || '',
                "買受人姓名": invoice.type !== 'business' ? (invoice.recipient_name || order.customer_name) : '',
                "電話": '', "傳真": '', "信箱": invoice.recipient_email || order.customer_email, "地址": '',
                "載具類型": invoice.type === 'cloud' ? (carrierMapping[invoice.carrier_type] || '') : '',
                "載具ID明碼": invoice.type === 'cloud' ? (invoice.carrier_number || '') : '',
                "載具ID暗碼": invoice.type === 'cloud' ? (invoice.carrier_number || '') : '',
                "發票證明聯備註": '',
            };
            worksheetData.push(XLSX_HEADERS.map(header => rowData[header]));
        });
    }

    // --- 5. 產生 XLSX 檔案並回傳 ---
    const worksheet = xlsx.utils.aoa_to_sheet(worksheetData);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Invoices');
    
    // 將 workbook 轉換為二進位資料
    const xlsxOutput = xlsx.write(workbook, { bookType: "xlsx", type: "array" });
    const xlsxBuffer = new Uint8Array(xlsxOutput);

    const fileName = `invoices_export_${new Date().toISOString().slice(0, 10)}.xlsx`;
    const headers = {
      ...corsHeaders,
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`
    };

    return new Response(xlsxBuffer, { headers });

  } catch (error) {
    console.error('[export-invoices-xlsx] 函式發生錯誤:', error);
    return new Response(JSON.stringify({ error: `產生 XLSX 檔案時發生錯誤: ${error.message}` }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});