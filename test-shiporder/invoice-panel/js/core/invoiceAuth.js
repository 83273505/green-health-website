// ==============================================================================
// 檔案路徑: invoice-panel/js/core/invoiceAuth.js
// 版本: v45.3 - 路徑現代化重構 (決定版)
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Invoice Panel Auth (發票管理後台驗證模組)
 * @description 發票管理後台專用的身份驗證模組。
 * @version v45.3
 * 
 * @update v45.3 - [PATH MODERNIZATION]
 * 1. [核心修正] 檔案頂部的所有 import 語句，已全部從脆弱的相對路徑
 *          ('../../../..') 修改為從網站根目錄 (`/`) 開始的絕對路徑。
 * 2. [原理] 確保此模組的依賴載入行為，與 app.js 的現代化路徑策略完全一致，
 *          提升了整個系統的健壯性與可維護性。
 * 
 * @update v45.1 - [LOCALIZATION]
 * 1. [本地化] 將 v45.0 版本中所有殘留的簡體中文註解及字串，完全修正為正體中文。
 * 
 * @update v45.0 - [SECURITY HARDENING]
 * 1. [核心修正] 恢復了先前被臨時註解的、對 'module:invoicing:view' 權限的
 *          精細化檢查。
 * 2. [安全強化] 現在，除了基礎的登入驗證外，系統還會嚴格確保只有被授予
 *          特定權限的使用者才能存取發票管理後台，實現了完整的 RBAC 
 *          (Role-Based Access Control) 安全閉環。
 */

// [v45.3 核心修正] 使用絕對路徑引用所有模組
import { supabase } from '/_shared/js/supabaseClient.js';
import { requireAdminLogin, handleAdminLogout as handleSharedLogout } from '/_shared/js/auth.js';
import { INVOICE_ROUTES } from '/invoice-panel/js/core/constants.js';

/**
 * 路由守衛：要求使用者必須登入，並且擁有存取發票模組的特定權限。
 * @returns {Promise<object|null>} 如果驗證通過，回傳 user 物件；否則回傳 null。
 */
export async function requireInvoiceLogin() {
    // 步驟 1: 呼叫共用的基礎登入驗證，確保使用者已登入
    const user = await requireAdminLogin();
    if (!user) {
        // 如果未登入，requireAdminLogin 已經處理了頁面跳轉，此處直接返回
        return null;
    }
    
    // 步驟 2: [v45.0 恢復] 執行精細化的權限檢查
    const client = await supabase;
    const userPermissions = user.app_metadata?.permissions || [];

    if (!userPermissions.includes('module:invoicing:view')) {
        alert('權限不足，您無法存取發票管理系統。');
        await client.auth.signOut(); // 為安全起見，登出沒有權限的使用者
        // 跳轉至統一登入頁
        window.location.href = INVOICE_ROUTES.LOGIN; 
        return null;
    }
    
    // 所有驗證通過，回傳使用者物件供後續頁面使用
    return user;
}

/**
 * 處理後台使用者登出流程。
 */
export async function handleInvoiceLogout() {
    // 呼叫共用的登出函式，它會處理 supabase.auth.signOut() 和頁面跳轉
    await handleSharedLogout();
}