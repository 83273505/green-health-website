// ==============================================================================
// 檔案路徑: supabase/functions/issue-invoice-manually/index.ts
// 版本: v45.0 - 發票系統激活 (新建檔案)
// ------------------------------------------------------------------------------
// 【此為全新檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Issue Invoice Manually Function (手動開立發票函式)
 * @description 發票管理後台的核心操作功能之一。允許授權使用者對處於
 *              'pending' 或 'failed' 狀態的發票記錄，手動觸發開立流程。
 * @version v45.0
 * 
 * @architectural_notes
 * 1. [安全] 此函式強制要求 JWT 驗證，並在內部檢查使用者是否擁有 'permissions:users:edit' 
 *          權限，確保只有高權限管理員才能執行此敏感操作。
 * 2. [職責分離] 此函式本身不包含複雜的開票邏輯，而是作為一個安全的閘道，
 *          將請求轉發給 _shared/services/InvoiceService.ts 進行處理。
 *          所有與第三方 API (SmilePay) 的互動都封裝在 Service 和 Adapter 層。
 * 3. [狀態檢查] 在執行開立前，會先檢查目標發票的狀態，避免對已開立或已作廢的
 *          發票進行重複操作。
 */

import { createClient } from '../_shared/deps.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { InvoiceService } from '../_shared/services/InvoiceService.ts'

Deno.serve(async (req) => {
  // 處理 CORS 預檢請求
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // --- 1. 初始化 Admin Client 並驗證使用者與權限 ---
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser();
    
    if (userError) throw userError;
    if (!user) throw new Error('使用者未授權或 Token 無效。');
    
    const userPermissions = user.app_metadata?.permissions || [];
    // 假設手動開票是一個較高權限的操作，需要編輯權限
    if (!userPermissions.includes('permissions:users:edit')) {
      return new Response(JSON.stringify({ error: '權限不足，您無法執行手動開立發票的操作。' }), { 
        status: 403, // Forbidden
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- 2. 解析前端傳來的發票 ID ---
    const { invoiceId } = await req.json();
    if (!invoiceId) {
        throw new Error("請求中缺少必要的 'invoiceId' 參數。");
    }

    // --- 3. 執行前的狀態檢查 ---
    const { data: invoiceToCheck, error: checkError } = await supabaseAdmin
        .from('invoices')
        .select('status')
        .eq('id', invoiceId)
        .single();

    if (checkError) throw new Error(`找不到指定的發票記錄 (ID: ${invoiceId})。`);
    
    if (!['pending', 'failed'].includes(invoiceToCheck.status)) {
        throw new Error(`此發票的狀態為 "${invoiceToCheck.status}"，無法執行開立操作。`);
    }

    // --- 4. 呼叫 InvoiceService 執行核心開票邏輯 ---
    const invoiceService = new InvoiceService(supabaseAdmin);
    await invoiceService.issueInvoiceViaAPI(invoiceId); // Service 內部已有完整的錯誤處理

    // --- 5. 回傳成功響應 ---
    return new Response(
      JSON.stringify({
        success: true,
        message: `發票 (ID: ${invoiceId}) 已成功送交開立。`,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('[issue-invoice-manually] 函式發生未預期錯誤:', error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});