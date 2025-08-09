// ==============================================================================
// 檔案路徑: test-shiporder/admin/js/core/adminAuth.js
// ------------------------------------------------------------------------------
// 【此為新檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Admin Auth Module
 * @description 處理所有後台系統（admin, warehouse, invoice）共用的基礎身份驗證邏輯。
 */

import { supabase } from '../../../../_shared/js/supabaseClient.js';
import { ADMIN_ROUTES } from './constants.js';

/**
 * 路由守衛：要求使用者必須登入才能訪問後台相關頁面。
 * 如果驗證失敗，會自動重新導向到統一的登入頁。
 * 這個基礎守衛不檢查特定角色，只確保有登入 session。
 * @returns {Promise<object|null>} 如果驗證通過，回傳 user 物件；否則回傳 null。
 */
export async function requireAdminLogin() {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
        // 如果沒有 session，儲存當前頁面以便登入後跳回，然後導向登入頁
        sessionStorage.setItem('postLoginRedirect', window.location.pathname);
        window.location.href = ADMIN_ROUTES.LOGIN;
        return null;
    }
    
    // 驗證通過，回傳使用者物件
    return session.user;
}

/**
 * 處理後台使用者登出。
 */
export async function handleAdminLogout() {
    await supabase.auth.signOut();
    // 登出後，統一導向到 admin 登入頁
    window.location.href = ADMIN_ROUTES.LOGIN;
}

/**
 * 獲取當前登入的後台使用者物件（不執行強制跳轉）。
 * @returns {Promise<object|null>}
 */
export async function getCurrentAdminUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
}