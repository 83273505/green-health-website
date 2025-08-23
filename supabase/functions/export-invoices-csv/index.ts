// ==============================================================================
// 檔案路徑: supabase/functions/export-invoices-csv/index.ts
// 版本: v47.1 - 語法修正版
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Export Invoices to CSV Function (匯出待開立發票為 CSV 函式)
 * @description 為後台管理員提供一個備用的發票開立方案。此函式會查詢所有
 *              「已出貨」且「待開立」的發票，並將其轉換為速買配 (SmilePay)
 *              批次檔案上傳格式所要求的 CSV 檔案。
 * @version v47.1
 * 
 * @update v47.1 - 移除非程式碼文字，解決部署時的語法解析錯誤。
 */

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { stringify } from 'std/csv/stringify.ts';

// 速買配 CSV 檔案的欄位標頭 (順序至關重要)
const CSV_HEADERS = [
  "發票日期", "發票時間", "稅率類型", "課稅別", "買受人註記",
  "通關方式註記", "彙開註記", "零稅率註記", "捐贈", "愛心碼",
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

    // --- 2. 深度資料查詢 ---
    const { data: invoices, error } = await supabaseAdmin
      .from('invoices')
      .select(`
        *,
        orders (
          *,
          order_items (
            *,
            product_variants (name)
          )
        )
      `)
      .eq('status', 'pending')
      .eq('orders.status', 'shipped');

    if (error) throw error;
    if (!invoices || invoices.length === 0) {
      const emptyCsv = await stringify([CSV_HEADERS, ["沒有待處理的發票"]]);
      return new Response(emptyCsv, { headers: { ...corsHeaders, 'Content-Type': 'text/csv' } });
    }

    // --- 3. CSV 格式轉換核心邏輯 ---
    const csvData = invoices.map(invoice => {
      const order = invoice.orders;
      const now = new Date(order.created_at);

      const descriptions: string[] = (order.order_items || []).map(item => item.product_variants?.name || '商品');
      const quantities: string[] = (order.order_items || []).map(item => String(item.quantity));
      const unitPrices: string[] = (order.order_items || []).map(item => String(item.price_at_order));
      const units: string[] = (order.order_items || []).map(() => '件');
      const amounts: string[] = (order.order_items || []).map(item => String(item.price_at_order * item.quantity));

      if (Number(order.coupon_discount) > 0) {
        descriptions.push('優惠折扣');
        quantities.push('1');
        unitPrices.push(String(-Number(order.coupon_discount)));
        units.push('式');
        amounts.push(String(-Number(order.coupon_discount)));
      }
      if (Number(order.shipping_fee) > 0) {
        descriptions.push('運費');
        quantities.push('1');
        unitPrices.push(String(order.shipping_fee));
        units.push('式');
        amounts.push(String(order.shipping_fee));
      }
      
      const carrierMapping: Record<string, string> = { 'member': 'EJ0113', 'mobile': '3J0002', 'certificate': 'CQ0001' };

      return {
        "發票日期": `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`,
        "發票時間": `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`,
        "稅率類型": '07',
        "課稅別": '1',
        "買受人註記": '',
        "通關方式註記": '',
        "彙開註記": '',
        "零稅率註記": '',
        "捐贈": invoice.type === 'donation' ? '1' : '0',
        "愛心碼": invoice.donation_code || '',
        "信用卡末四碼": '',
        "自訂發票編號": `INV-${invoice.id}`,
        "自訂號碼": order.order_number,
        "商品明細": descriptions.join('|'),
        "數量明細": quantities.join('|'),
        "單價明細": unitPrices.join('|'),
        "單位明細": units.join('|'),
        "各明細總額": amounts.join('|'),
        "總金額(含稅)": String(order.total_amount),
        "單價含稅": 'Y',
        "買受人統編": invoice.vat_number || '',
        "買受人公司名稱": invoice.company_name || '',
        "買受人姓名": invoice.type !== 'business' ? (invoice.recipient_name || order.customer_name) : '',
        "電話": '',
        "傳真": '',
        "信箱": invoice.recipient_email || order.customer_email,
        "地址": '',
        "載具類型": invoice.type === 'cloud' ? (carrierMapping[invoice.carrier_type] || '') : '',
        "載具ID明碼": invoice.type === 'cloud' ? (invoice.carrier_number || '') : '',
        "載具ID暗碼": invoice.type === 'cloud' ? (invoice.carrier_number || '') : '',
        "發票證明聯備註": '',
      };
    });

    // --- 4. 產生 CSV 字串並回傳 ---
    const csvString = await stringify(csvData, { columns: CSV_HEADERS, headers: true });
    
    const fileName = `invoices_export_${new Date().toISOString().slice(0, 10)}.csv`;
    const headers = {
      ...corsHeaders,
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fileName}"`
    };

    return new Response(csvString, { headers });

  } catch (error) {
    console.error('[export-invoices-csv] 函式發生錯誤:', error);
    return new Response(JSON.stringify({ error: `產生 CSV 檔案時發生錯誤: ${error.message}` }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});