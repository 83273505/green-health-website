// ==============================================================================
// 檔案路徑: supabase/functions/update-invoice-details/index.ts
// 版本: v47.1 - 流程完整性最終收官版
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Update Invoice Details Function (更新發票詳情函式)
 * @description 處理來自後台的發票資料更新請求，包含修正與手動校正。
 * @version v47.1
 * 
 * @update v47.1 - [FINAL WORKFLOW COMPLETION]
 * 1. [安全性重構] 引入 `allowedFields` 白名單機制，取代了獨立的欄位驗證，
 *          使函式更安全、更具擴展性。
 * 2. [功能閉環] 在白名單中新增了 `invoice_number`, `random_number`, `status`, 
 *          `issued_at` 等欄位，授權了前端「手動開立並回填」及「手動校正」
 *          操作所需的所有欄位更新權限，完整地閉環了所有手動作業流程。
 */

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';

// [v47.1] 引入欄位白名單，提升安全性與擴展性
const allowedFields = [
  'vat_number', 'company_name', 
  'carrier_type', 'carrier_number', 
  'donation_code',
  'invoice_number', 'random_number', 'status', 'issued_at'
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const supabaseUserClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization')! } } });
    
    const { data: { user } } = await supabaseUserClient.auth.getUser();
    if (!user || !(user.app_metadata?.permissions || []).includes('module:invoicing:view')) {
      return new Response(JSON.stringify({ error: '權限不足。' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { invoiceId, updates } = await req.json();
    if (!invoiceId || !updates || typeof updates !== 'object') {
      throw new Error('缺少 invoiceId 或 updates 物件。');
    }

    // [v47.1] 使用白名單過濾要更新的欄位
    const filteredUpdates: { [key: string]: any } = {};
    for (const key in updates) {
      if (allowedFields.includes(key)) {
        filteredUpdates[key] = updates[key];
      } else {
        console.warn(`[update-invoice-details] 偵測到不允許的欄位更新嘗試: ${key}`);
        throw new Error(`不允許的欄位: ${key}`);
      }
    }

    if (Object.keys(filteredUpdates).length === 0) {
      throw new Error('沒有提供任何有效的更新欄位。');
    }
    
    filteredUpdates.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('invoices')
      .update(filteredUpdates)
      .eq('id', invoiceId)
      .select()
      .single();

    if (error) throw error;

    return new Response(JSON.stringify({ success: true, data, message: '發票資料已成功更新。' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('[update-invoice-details] 函式發生錯誤:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});