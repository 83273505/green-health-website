// ==============================================================================
// 檔案路徑: invoice-panel/js/core/invoiceAuth.js
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋 - v23.1 統一入口版】
// ==============================================================================

// 【核心修改】從共用的 _shared 模組引入 supabase client 和基礎驗證邏輯
// 這個相對路徑是從 /invoice-panel/js/core/ 出發，返回到專案根目錄下的 _shared/
import { supabase } from '../../../_shared/js/supabaseClient.js';
import { requireAdminLogin, handleAdminLogout as handleSharedLogout } from '../../../_shared/js/auth.js';
import { INVOICE_ROUTES } from './constants.js';

/**
 * 路由守衛：要求使用者必須登入，並且具備 'accounting_staff' 或 'super_admin' 角色。
 * 如果驗證失敗，會自動重新導向到統一的 admin 登入頁。
 * @returns {Promise<object|null>} 如果驗證通過，回傳 user 物件；否則回傳 null。
 */
export async function requireInvoiceLogin() {
    // 步驟 1: 呼叫共用的基礎登入驗證
    const user = await requireAdminLogin();
    if (!user) {
        // 如果未登入，requireAdminLogin 已經處理了跳轉，此處直接返回
        return null;
    }
    
    // 步驟 2: 進行此模組特定的角色權限檢查
    const userRoles = user.app_metadata?.roles || [];

    if (!userRoles.includes('accounting_staff') && !userRoles.includes('super_admin')) {
        alert('權限不足，您無法存取此頁面。');
        await supabase.auth.signOut(); // 登出沒有權限的使用者
        // 【核心修改】跳轉至統一登入頁
        window.location.href = INVOICE_ROUTES.LOGIN; 
        return null;
    }
    
    // 所有驗證通過
    return user;
}

/**
 * 處理後台使用者登出流程。
 */
export async function handleInvoiceLogout() {
    // 呼叫共用的登出函式，它會自動處理 supabase 的登出和頁面跳轉
    await handleSharedLogout();
}