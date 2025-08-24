// ==============================================================================
// 檔案路徑: supabase/functions/export-invoices-xlsx/index.ts
// 版本: v47.8 - 效能優化勝利收官版
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Export Invoices to XLSX Function (匯出待開立發票為 XLSX 函式)
 * @description 最終版。為後台提供一個高效能的備用發票開立方案。
 * @version v47.8
 * 
 * @update v47.8 - [PERFORMANCE OPTIMIZATION & SYNTAX FIX]
 * 1. [核心優化] 徹底重寫 Supabase 查詢的 `select()` 語句，從 `select(*)`
 *          改為只查詢產生 Excel 所需的最小欄位集。
 * 2. [原理] 此修改大幅減少了資料庫 I/O 與網路傳輸負載，顯著降低了函式的
 *          執行時間與記憶體消耗，旨在解決因平台逾時而導致的 `EarlyDrop` 錯誤。
 * 3. [// ==============================================================================
// 檔案路徑: supabase/functions/export-invoices-xlsx/index.ts
// 版本: v47.9 - 逐筆明細勝利收官版
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Export Invoices to XLSX Function (匯出待開立發票為 XLSX 函式)
 * @description 最終版。為後台提供一個高效能的備用發票開立方案。
 * @version v47.9
 * 
 * @update v47.9 - [MULTI-ROW & PRECISE MAPPING]
 * 1. [核心重構] 徹底重構資料處理邏輯，實現「逐筆明細」模式。現在每個商品、
 *          折扣、運費都會在 Excel 中產生獨立的一列。
 * 2. [精準對應] 嚴格按照使用者最終需求，重新定義 XLSX 欄位順序與名稱，並
 *          將金額精準地填入「含稅銷售額」、「總金額」等指定欄位。
 * 3. [格式合規] 「買受人姓名」欄位現在固定留空，以符合 B2B/B2C 規範。
 */

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import * as xlsx from 'sheetjs';

// [v47.9] 根據 OCR 辨識結果與使用者最終需求，重新定義欄位順序
const XLSX_HEADERS = [
    "發票號碼", "隨機碼", "發票日期", "發票時間", "稅率類型", "課稅別", "買受人註記",
    "通關方式註記", "彙開註記", "零稅率註記", "捐贈", "愛心碼", "信用卡末四碼",
    "自訂發票編號", "自訂號碼", "商品明細", "數量明細", "單價明細", "單位明細",
    "各明細總額", "含稅銷售額", "免稅銷售額", "零稅率銷售額", "總金額", "單價含稅",
    "買受人統編", "買受人公司名稱", "買受人姓名", "電話", "傳真", "信箱", "地址",
    "載具類型", "載具ID明碼", "載具ID暗碼", "發票證明聯備註"
];

async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: '缺少授權標頭。' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const supabaseUserClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    
    const { data: { user } } = await supabaseUserClient.auth.getUser();
    if (!user || !(user.app_metadata?.permissions || []).includes('module:invoicing:view')) {
      return new Response(JSON.stringify({ error: '權限不足。' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const payload = await req.json().catch(() => ({}));
    const invoiceIds = payload.invoiceIds;

    const selectStatement = `
      id, type, status, recipient_name, recipient_email, vat_number, company_name,
      carrier_type, carrier_number, donation_code,
      orders (
        order_number, customer_name, customer_email, total_amount, coupon_discount, 
        shipping_fee, created_at,
        order_items (
          quantity, price_at_order,
          product_variants (name)
        )
      )
    `;

    let query = supabaseAdmin
      .from('invoices')
      .select(selectStatement)
      .in('status', ['pending', 'failed'])
      .eq('orders.status', 'shipped');

    if (Array.isArray(invoiceIds) && invoiceIds.length > 0) {
      query = query.in('id', invoiceIds);
    }
      
    const { data: invoices, error } = await query;
    if (error) throw error;

    const worksheetData: (string | number)[][] = [XLSX_HEADERS];
    if (!invoices || invoices.length === 0) {
        worksheetData.push(["沒有找到符合條件的待處理發票"]);
    } else {
        invoices.forEach(invoice => {
            const order = invoice.orders;
            const createdAt = new Date(order.created_at);
            const couponDiscount = Number(order.coupon_discount) || 0;
            const shippingFee = Number(order.shipping_fee) || 0;
            const totalAmount = Number(order.total_amount) || 0;
            const carrierMapping: Record<string, string> = { 'member': 'EJ0113', 'mobile': '3J0002', 'certificate': 'CQ0001' };

            // [v47.9] 建立一個基礎資料列物件，所有品項列共用此基礎
            const baseRow = {
                "發票號碼": '', "隨機碼": '',
                "發票日期": `${createdAt.getFullYear()}/${String(createdAt.getMonth() + 1).padStart(2, '0')}/${String(createdAt.getDate()).padStart(2, '0')}`,
                "發票時間": `${String(createdAt.getHours()).padStart(2, '0')}:${String(createdAt.getMinutes()).padStart(2, '0')}:${String(createdAt.getSeconds()).padStart(2, '0')}`,
                "稅率類型": '07', "課稅別": '1', "買受人註記": '', "通關方式註記": '', "彙開註記": '', "零稅率註記": '',
                "捐贈": invoice.type === 'donation' ? '1' : '0', "愛心碼": invoice.donation_code || '', "信用卡末四碼": '',
                "自訂發票編號": `INV-${invoice.id}`, "自訂號碼": order.order_number,
                "總金額": totalAmount,
                "單價含稅": 'Y', "買受人統編": invoice.vat_number || '', "買受人公司名稱": invoice.company_name || '',
                "買受人姓名": '', // 根據要求固定留空
                "電話": '', "傳真": '', "信箱": invoice.recipient_email || order.customer_email, "地址": '',
                "載具類型": invoice.type === 'cloud' ? (carrierMapping[invoice.carrier_type] || '') : '',
                "載具ID明碼": invoice.type === 'cloud' ? (invoice.carrier_number || '') : '',
                "載具ID暗碼": invoice.type === 'cloud' ? (invoice.carrier_number || '') : '',
                "發票證明聯備註": '',
                "免稅銷售額": '', "零稅率銷售額": '',
            };

            // 逐筆處理商品
            (order.order_items || []).forEach(item => {
                const quantity = Number(item.quantity) || 0;
                const price = Number(item.price_at_order) || 0;
                const subtotal = quantity * price;
                const itemRow = {
                    ...baseRow,
                    "商品明細": item.product_variants?.name || '商品',
                    "數量明細": quantity,
                    "單價明細": price,
                    "單位明細": '件',
                    "各明細總額": subtotal,
                    "含稅銷售額": subtotal,
                };
                worksheetData.push(XLSX_HEADERS.map(header => itemRow[header]));
            });

            // 處理優惠折扣
            if (couponDiscount > 0) {
                const discountRow = { ...baseRow, "商品明細": '優惠折扣', "數量明細": 1, "單價明細": -couponDiscount, "單位明細": '式', "各明細總額": -couponDiscount, "含稅銷售額": -couponDiscount, };
                worksheetData.push(XLSX_HEADERS.map(header => discountRow[header]));
            }

            // 處理運費
            if (shippingFee > 0) {
                const shippingRow = { ...baseRow, "商品明細": '運費', "數量明細": 1, "單價明細": shippingFee, "單位明細": '式', "各明細總額": shippingFee, "含稅銷售額": shippingFee, };
                worksheetData.push(XLSX_HEADERS.map(header => shippingRow[header]));
            }
        });
    }

    const worksheet = xlsx.utils.aoa_to_sheet(worksheetData);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Invoices');
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
}

Deno.serve(handler);