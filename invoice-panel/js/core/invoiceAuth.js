// ==============================================================================
// 檔案路徑: invoice-panel/js/core/invoiceAuth.js
// ------------------------------------------------------------------------------
// 【發票管理後台 - 身份驗證模組】
// ==============================================================================

import { supabase } from './invoiceSupabaseClient.js';
import { INVOICE_ROUTES } from './constants.js';

/**
 * 路由守衛：要求使用者必須登入，並且具備特定角色才能訪問頁面。
 * 如果驗證失敗，會自動重新導向到登入頁。
 * @returns {Promise<object|null>} 如果驗證通過，回傳 user 物件；否則回傳 null。
 */
export async function requireInvoiceLogin() {
    // 【核心修正】在使用 supabase 之前，先用 await 等待 Promise 解析
    const client = await supabase;
    const { data: { session }, error: sessionError } = await client.auth.getSession();

    if (sessionError || !session) {
        // 如果沒有 session，直接導向登入頁
        window.location.href = INVOICE_ROUTES.LOGIN;
        return null;
    }
    
    const user = session.user;
    const userRoles = user.app_metadata?.roles || [];

    // 【核心權限檢查】
    // 檢查使用者角色陣列中，是否包含 'accounting_staff' 或 'super_admin'
    if (!userRoles.includes('accounting_staff') && !userRoles.includes('super_admin')) {
        // 權限不足
        alert('權限不足，您無法存取此頁面。');
        await client.auth.signOut(); // 登出沒有權限的使用者
        window.location.href = INVOICE_ROUTES.LOGIN;
        return null;
    }
    
    // 驗證通過
    return user;
}

/**
 * 處理使用者登出
 */
export async function handleInvoiceLogout() {
    const client = await supabase;
    await client.auth.signOut();
    window.location.href = INVOICE_ROUTES.LOGIN;
}

/**
 * 獲取當前登入的使用者物件（不執行強制跳轉）
 * @returns {Promise<object|null>}
 */
export async function getCurrentInvoiceUser() {
    const client = await supabase;
    const { data: { user } } = await client.auth.getUser();
    return user;
}