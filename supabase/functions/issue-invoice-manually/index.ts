// ==============================================================================
// 檔案路徑: supabase/functions/issue-invoice-manually/index.ts
// 版本: v45.1 - 權限模型修正 (根本原因修復版)
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Issue Invoice Manually Function (手動開立發票函式)
 * @description 發票管理後台的核心操作功能之一。允許授權使用者對處於
 *              'pending' 或 'failed' 狀態的發票記錄，手動觸發開立流程。
 * @version v45.1
 * 
 * @update v45.1 - [PERMISSION MODEL FIX]
 * 1. [核心修正] 徹底分離了 Supabase Client 的初始化職責。現在有兩個 Client：
 *          - `supabaseUserClient`: 專門用於載入使用者傳來的 Authorization 標頭，
 *            其唯一職責是呼叫 `auth.getUser()` 來驗證使用者身份與權限。
 *          - `supabaseAdmin`: 純粹使用 SERVICE_ROLE_KEY 初始化，不載入任何
 *            使用者標頭。此 Client 用於後續所有資料庫操作，確保能以
 *            系統最高權限繞過 RLS 限制，正確讀寫資料。
 * 2. [原理] 此修改解決了因使用者 Token 優先級高於 Service Key，導致後端操作
 *          意外受到 RLS 限制的根本問題，修正了「找不到指定的發票記錄」的錯誤。
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
    // --- 1. 初始化 Client 並分離職責 ---
    
    // 步驟 1.1: 建立一個純粹的 Admin Client，用於後續所有資料庫操作 (繞過 RLS)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 步驟 1.2: 建立一個帶有使用者 Token 的 Client，專門用於驗證使用者身份
    const supabaseUserClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!, // 使用 anon key 即可，因為 token 在標頭中
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user }, error: userError } = await supabaseUserClient.auth.getUser();
    
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

    // --- 3. 執行前的狀態檢查 (使用 supabaseAdmin 進行) ---
    const { data: invoiceToCheck, error: checkError } = await supabaseAdmin
        .from('invoices')
        .select('status')
        .eq('id', invoiceId)
        .single();

    if (checkError) throw new Error(`找不到指定的發票記錄 (ID: ${invoiceId})。`);
    
    if (!['pending', 'failed'].includes(invoiceToCheck.status)) {
        throw new Error(`此發票的狀態為 "${invoiceToCheck.status}"，無法執行開立操作。`);
    }

    // --- 4. 呼叫 InvoiceService 執行核心開票邏輯 (將 supabaseAdmin 傳入) ---
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