// ==============================================================================
// 檔案路徑: test-shiporder/admin/js/core/auth.js
// 版本: v45.4 - 完全正體化修正
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Admin Auth Module (管理後台 - 核心驗證模組)
 * @description 處理所有後台系統（admin, warehouse, invoice）共用的基礎身份驗證邏輯。
 * @version v45.4
 * 
 * @update v45.4 - [LOCALIZATION]
 * 1. [本地化] 將 v45.3 版本中所有殘留的簡體中文註解及錯誤訊息，完全修正為正體中文。
 * 
 * @update v45.3 - [PATH MODERNIZATION & LOCALIZATION]
 * 1. [核心修正] 檔案頂部的所有 import 語句，已全部修改為從網站根目錄 (`/`) 
 *          開始的絕對路徑，確保路徑解析的絕對可靠性。
 * 2. [正體化] 檔案內所有註解及 UI 字串均已修正為正體中文。
 */

// [v45.3 核心修正] 使用絕對路徑引用共用及內部模組
import { supabase } from '/_shared/js/supabaseClient.js';
import { ADMIN_ROUTES } from '/admin/js/core/constants.js';

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