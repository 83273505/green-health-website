// ==============================================================================
// 檔案路徑: supabase/functions/export-invoices-xlsx/index.ts
// 版本: v48.1 - 最終勝利收官版
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Export Invoices to XLSX Function (匯出待開立發票為 XLSX 函式)
 * @description 最終版。為後台提供一個高效能的備用發票開立方案。
 * @version v48.1
 * 
 * @update v48.1 - [FINAL FORMATTING FIX]
 * 1. [資料清理] 在產生 Excel 列之前，將商品名稱中的所有換行符 `\n`
 *          替換為空格，解決了單一商品名稱在 Excel 中被錯誤地顯示為
 *          多行的問題，確保了最終格式的絕對正確性。
 * 2. [專案完成] 至此，所有已知問題均已修正，專案勝利收官。
 */

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import * as xlsx from 'sheetjs';

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
            const items = order.order_items || [];
            
            const itemsTotal = items.reduce((sum, item) => sum + (Number(item.price_at_order) * Number(item.quantity)), 0);
            let allocatedDiscount = 0;
            const discountedItems = items.map((item, index) => {
                const price = Number(item.price_at_order) || 0;
                const quantity = Number(item.quantity) || 0;
                const subtotal = price * quantity;
                
                let itemDiscount = 0;
                if (itemsTotal > 0) {
                    if (index === items.length - 1) {
                        itemDiscount = couponDiscount - allocatedDiscount;
                    } else {
                        itemDiscount = Math.round((subtotal / itemsTotal) * couponDiscount);
                        allocatedDiscount += itemDiscount;
                    }
                }
                
                const newSubtotal = subtotal - itemDiscount;
                const newPrice = quantity > 0 ? newSubtotal / quantity : 0;

                return {
                    name: (item.product_variants?.name || '商品').replace(/\n/g, ' '), // [v48.1] 核心修正
                    quantity: quantity,
                    price: newPrice,
                    subtotal: newSubtotal,
                    unit: '件'
                };
            });

            if (shippingFee > 0) {
                discountedItems.push({ name: '運費', quantity: 1, price: shippingFee, subtotal: shippingFee, unit: '式' });
            }

            discountedItems.forEach((item, index) => {
                const isFirstRow = index === 0;
                const carrierMapping: Record<string, string> = { 'member': 'EJ0113', 'mobile': '3J0002', 'certificate': 'CQ0001' };

                const rowData = {
                    "發票號碼": '', "隨機碼": '',
                    "發票日期": isFirstRow ? `${createdAt.getFullYear()}/${String(createdAt.getMonth() + 1).padStart(2, '0')}/${String(createdAt.getDate()).padStart(2, '0')}` : '',
                    "發票時間": isFirstRow ? `${String(createdAt.getHours()).padStart(2, '0')}:${String(createdAt.getMinutes()).padStart(2, '0')}:${String(createdAt.getSeconds()).padStart(2, '0')}` : '',
                    "稅率類型": isFirstRow ? '07' : '', "課稅別": isFirstRow ? '1' : '', "買受人註記": '',
                    "通關方式註記": '', "彙開註記": '', "零稅率註記": '',
                    "捐贈": isFirstRow ? (invoice.type === 'donation' ? '1' : '0') : '',
                    "愛心碼": isFirstRow ? (invoice.donation_code || '') : '', "信用卡末四碼": '',
                    "自訂發票編號": isFirstRow ? order.order_number : '',
                    "自訂號碼": '',
                    "商品明細": item.name,
                    "數量明細": item.quantity,
                    "單價明細": item.price,
                    "單位明細": item.unit,
                    "各明細總額": item.subtotal,
                    "含稅銷售額": item.subtotal,
                    "免稅銷售額": '', "零稅率銷售額": '',

                    "總金額": isFirstRow ? totalAmount : '',
                    "單價含稅": isFirstRow ? 'Y' : '',
                    "買受人統編": isFirstRow ? (invoice.vat_number || '') : '',
                    "買受人公司名稱": isFirstRow ? (invoice.company_name || '') : '',
                    "買受人姓名": '',
                    "電話": '', "傳真": '',
                    "信箱": isFirstRow ? (invoice.recipient_email || order.customer_email) : '',
                    "地址": '',
                    "載具類型": isFirstRow ? (invoice.type === 'cloud' ? (carrierMapping[invoice.carrier_type] || '') : '') : '',
                    "載具ID明碼": isFirstRow ? (invoice.type === 'cloud' ? (invoice.carrier_number || '') : '') : '',
                    "載具ID暗碼": isFirstRow ? (invoice.type === 'cloud' ? (invoice.carrier_number || '') : '') : '',
                    "發票證明聯備註": '',
                };
                worksheetData.push(XLSX_HEADERS.map(header => rowData[header] ?? ''));
            });
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