// ==============================================================================
// 檔案路徑: test-shiporder/_shared/js/auth.js
// ------------------------------------------------------------------------------
// 【此為新檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Shared Auth Functions
 * @description 提供所有後台面板共用的基礎身份驗證函式。
 */

import { supabase } from './supabaseClient.js';

// 為了避免循環依賴，直接在此處定義路由，或從一個更基礎的 constants 檔案引入
const ADMIN_LOGIN_ROUTE = '/admin/index.html';

/**
 * 基礎路由守衛：要求使用者必須登入才能訪問後台相關頁面。
 * 如果驗證失敗，會自動重新導向到統一的登入頁。
 * 這個基礎守衛不檢查特定角色，只確保有登入 session。
 * @returns {Promise<object|null>} 如果驗證通過，回傳 user 物件；否則回傳 null (並已觸發頁面跳轉)。
 */
export async function requireAdminLogin() {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
        // 如果沒有 session，儲存當前頁面以便登入後跳回 (可選功能)
        sessionStorage.setItem('postLoginRedirect', window.location.pathname);
        console.warn('使用者未登入或 session 已過期，正在重新導向至登入頁...');
        window.location.href = ADMIN_LOGIN_ROUTE;
        return null;
    }
    
    // 驗證通過，回傳使用者物件
    return session.user;
}

/**
 * 處理後台使用者登出。
 */
export async function handleAdminLogout() {
    const { error } = await supabase.auth.signOut();
    if (error) {
        console.error('登出時發生錯誤:', error);
    }
    // 登出後，統一導向到 admin 登入頁
    window.location.href = ADMIN_LOGIN_ROUTE;
}

/**
 * 獲取當前登入的後台使用者物件（不執行強制跳轉）。
 * @returns {Promise<object|null>}
 */
export async function getCurrentAdminUser() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) {
        console.error('獲取目前使用者資訊時發生錯誤:', error);
        return null;
    }
    return user;
}