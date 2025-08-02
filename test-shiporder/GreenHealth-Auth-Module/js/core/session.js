// 檔案路徑: js/core/session.js

/**
 * @file Session Management Module (Session 管理模組)
 * @description 提供集中化的函式來管理使用者 Session，並保護需要身分驗證的路由。
 *              在新架構下，它被歸類為核心 (core) 模組。
 */

// 【修改部分】
// 引用路徑已更新為簡單的相對路徑 './'，因為所有核心模組現在都在同一個 core/ 目錄下。
import { supabase } from './supabaseClient.js';
import { ROUTES } from './constants.js';

/**
 * 檢查目前是否存在有效的用戶 Session。
 * 如果沒有找到 Session，此函式會自動將使用者重新導向至登入頁面。
 * 這個函式扮演著保護路由的「警衛」角色。
 *
 * @returns {Promise<object|null>} 如果使用者已通過驗證，則回傳 user 物件；否則回傳 null (並已觸發頁面跳轉)。
 */
export async function requireLogin() {
    // 【未修改部分】函式的核心邏輯維持不變
    const { data, error } = await supabase.auth.getSession();

    if (error || !data.session) {
        window.location.href = ROUTES.LOGIN;
        return null;
    }

    return data.session.user;
}

/**
 * 一個用於獲取當前使用者物件的簡便函式。
 * @returns {Promise<object|null>} 如果存在 Session，則回傳 user 物件；否則回傳 null。
 */
export async function getCurrentUser() {
    // 【未修改部分】函式的核心邏輯維持不變
    const { data: { user } } = await supabase.auth.getUser();
    return user;
}