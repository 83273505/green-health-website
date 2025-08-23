// ==============================================================================
// 檔案路徑: test-shiporder/_shared/js/auth.js
// 版本: v29.1 - 鏡像 warehouse-panel
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Shared Auth Functions
 * @description 提供所有後台面板共用的基礎身份驗證函式。
 */

import { supabase } from './supabaseClient.js';

// 為了避免循環依賴，直接在此處定義路由
const ADMIN_LOGIN_ROUTE = '/admin/index.html';

/**
 * 基礎路由守衛：要求使用者必須登入才能訪問後台相關頁面。
 * 如果驗證失敗，會自動重新導向到統一的登入頁。
 * @returns {Promise<object|null>} 如果驗證通過，回傳 user 物件；否則回傳 null。
 */
export async function requireAdminLogin() {
    try {
        const client = await supabase;
        const { data: { session }, error: sessionError } = await client.auth.getSession();

        if (sessionError || !session) {
            sessionStorage.setItem('postLoginRedirect', window.location.pathname);
            console.warn('使用者未登入或 session 已過期，正在重新導向至登入頁...');
            window.location.href = ADMIN_LOGIN_ROUTE;
            return null;
        }
        
        return session.user;
    } catch (error) {
        console.error('基礎驗證失敗:', error);
        window.location.href = ADMIN_LOGIN_ROUTE;
        return null;
    }
}

/**
 * 處理後台使用者登出。
 */
export async function handleAdminLogout() {
    try {
        const client = await supabase;
        const { error } = await client.auth.signOut();
        if (error) {
            console.error('登出時發生錯誤:', error);
        }
    } catch (error) {
        console.error('登出過程中發生未知錯誤:', error);
    } finally {
        // 無論成功與否，都跳轉到登入頁
        window.location.href = ADMIN_LOGIN_ROUTE;
    }
}

/**
 * 獲取當前登入的後台使用者物件（不執行強制跳轉）。
 * @returns {Promise<object|null>}
 */
export async function getCurrentAdminUser() {
    try {
        const client = await supabase;
        const { data: { user }, error } = await client.auth.getUser();
        if (error) {
            console.error('獲取目前使用者資訊時發生錯誤:', error);
            return null;
        }
        return user;
    } catch (error) {
        console.error('獲取目前使用者過程中發生未知錯誤:', error);
        return null;
    }
}