// ==============================================================================
// 檔案路徑: test-shiporder/admin/js/core/auth.js
// 版本: v28.3 - 正確相對路徑修正
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Admin Auth Module
 * @description 處理所有後台系統（admin, warehouse, invoice）共用的基礎身份驗證邏輯。
 */

// 【核心修正】import 路徑改為正確的相對路徑
import { supabase } from '../../../_shared/js/supabaseClient.js';
import { ADMIN_ROUTES } from './constants.js';

/**
 * 路由守衛：要求使用者必須登入才能訪問後台相關頁面。
 * 如果驗證失敗，會自動重新導向到統一的登入頁。
 * @returns {Promise<object|null>} 如果驗證通過，回傳 user 物件；否則回傳 null。
 */
export async function requireAdminLogin() {
    try {
        const client = await supabase;
        const { data: { session }, error: sessionError } = await client.auth.getSession();

        if (sessionError || !session) {
            sessionStorage.setItem('postLoginRedirect', window.location.pathname);
            window.location.href = ADMIN_ROUTES.LOGIN;
            return null;
        }
        
        return session.user;
    } catch (error) {
        console.error('基礎驗證失敗:', error);
        window.location.href = ADMIN_ROUTES.LOGIN;
        return null;
    }
}

/**
 * 處理後台使用者登出。
 */
export async function handleAdminLogout() {
    try {
        const client = await supabase;
        await client.auth.signOut();
    } catch (error) {
        console.error('登出過程中發生未知錯誤:', error);
    } finally {
        window.location.href = ADMIN_ROUTES.LOGIN;
    }
}

/**
 * 獲取當前登入的後台使用者物件（不執行強制跳轉）。
 * @returns {Promise<object|null>}
 */
export async function getCurrentAdminUser() {
    try {
        const client = await supabase;
        const { data: { user } } = await client.auth.getUser();
        return user;
    } catch (error) {
        console.error('獲取目前使用者過程中發生未知錯誤:', error);
        return null;
    }
}