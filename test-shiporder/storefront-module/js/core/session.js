// ==============================================================================
// 檔案路徑: storefront-module/js/core/session.js
// 版本: v32.0 - 消費者端模組拆分
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Session Management Module (商店前端 Session 管理模組)
 * @description 提供集中化的函式來管理使用者 Session，並保護需要身分驗證的路由。
 */

// 【核心修正】將 import 路徑指向本模組內部
import { supabase } from './supabaseClient.js';
import { ROUTES } from './constants.js';

/**
 * 檢查目前是否存在有效的用戶 Session。
 * 如果沒有找到 Session，此函式會自動將使用者重新導向至登入頁面。
 */
export async function requireLogin() {
    try {
        const client = await supabase;
        const { data, error } = await client.auth.getSession();

        if (error || !data.session) {
            // 【核心修正】導向新的會員中心登入頁
            window.location.href = ROUTES.LOGIN;
            return null;
        }

        return data.session.user;
    } catch (error) {
        console.error('Session 驗證失敗:', error);
        window.location.href = ROUTES.LOGIN;
        return null;
    }
}

/**
 * 獲取當前使用者物件的簡便函式。
 */
export async function getCurrentUser() {
    try {
        const client = await supabase;
        const { data: { user } } = await client.auth.getUser();
        return user;
    } catch (error) {
        console.error('獲取目前使用者資訊失敗:', error);
        return null;
    }
}