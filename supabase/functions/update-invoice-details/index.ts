// ==============================================================================
// 檔案路徑: supabase/functions/update-invoice-details/index.ts
// 版本: v47.0 - 發票詳情更新 (為審核修正功能而新建)
// ------------------------------------------------------------------------------
// 【此為全新檔案，可直接使用】
// ==============================================================================

/**
 * @file Update Invoice Details Function (更新發票詳情函式)
 * @description 為後台「審核與修正中心」提供後端支援。允許授權使用者在
 *              發票開立前，安全地修改 `invoices` 表中的買受人相關資訊。
 * @version v47.0
 * 
 * @architectural_notes
 * 1. [安全] 嚴格執行權限檢查，確保只有具備 'permissions:users:edit' 權限
 *          的管理員才能執行此操作。
 * 2. [職責單一] 此函式的唯一職責是更新發票資料，不涉及任何開立或作廢邏輯。
 * 3. [資料驗證] 在執行資料庫更新前，會對傳入的資料進行基本的格式驗證，
 *          例如檢查統一編號是否為 8 位數字。
 * 4. [權限模型] 採用與 `issue-invoice-manually` (v45.1) 相同的、分離的
 *          Client 權限模型，確保操作的安全與正確。
 */

import { createClient } from '../_shared/deps.ts'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  // 處理 CORS 預檢請求
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // --- 1. 初始化 Client 並驗證使用者權限 ---
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    
    const supabaseUserClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user } } = await supabaseUserClient.auth.getUser();
    if (!user || !(user.app_metadata?.permissions || []).includes('permissions:users:edit')) {
      return new Response(JSON.stringify({ error: '權限不足，您無法修改發票資料。' }), { 
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- 2. 解析並驗證前端傳來的資料 ---
    const { invoiceId, updates } = await req.json();
    if (!invoiceId || !updates) {
        throw new Error("請求中缺少 'invoiceId' 或 'updates' 參數。");
    }

    // 簡單的後端驗證
    if (updates.vat_number && !/^\d{8}$/.test(updates.vat_number)) {
        throw new Error('統一編號格式不正確，應為 8 位數字。');
    }
    if ('company_name' in updates && !updates.company_name) {
        throw new Error('公司抬頭不可為空。');
    }

    // --- 3. 執行資料庫更新操作 ---
    const { data, error } = await supabaseAdmin
      .from('invoices')
      .update(updates)
      .eq('id', invoiceId)
      .select('id') // 只選擇 id 以確認更新成功
      .single();

    if (error) {
        console.error(`[update-invoice-details] 更新發票 (ID: ${invoiceId}) 失敗:`, error);
        throw new Error(`資料庫更新失敗: ${error.message}`);
    }

    // --- 4. 回傳成功響應 ---
    return new Response(
      JSON.stringify({
        success: true,
        message: `發票 (ID: ${data.id}) 的資料已成功更新。`,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('[update-invoice-details] 函式發生未預期錯誤:', error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400, // Bad Request，通常由無效輸入引起
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});