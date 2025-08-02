// 檔案路徑: warehouse-panel/js/core/warehouseAuth.js

/**
 * @file Warehouse Authentication Module (倉庫後台身份驗證模組)
 * @description 提供函式來管理倉庫後台使用者的 Session，並保護需要身分驗證的路由。
 */

import { supabase } from './warehouseSupabaseClient.js';
import { WAREHOUSE_ROUTES } from './constants.js';

/**
 * 檢查當前是否存在有效的後台用戶 Session。
 * 如果沒有，此函式會自動將使用者重新導向至後台登入頁面。
 *
 * @returns {Promise<object|null>} 如果使用者已通過驗證，則回傳 user 物件；否則回傳 null (並已觸發頁面跳轉)。
 */
export async function requireWarehouseLogin() {
    const { data, error } = await supabase.auth.getSession();

    if (error || !data.session) {
        window.location.href = WAREHOUSE_ROUTES.LOGIN;
        return null;
    }
    
    // 未來可以增加角色驗證，例如檢查 user.app_metadata.roles 是否包含 'warehouse_staff'
    // if (!data.session.user.app_metadata.roles?.includes('warehouse_staff')) {
    //     alert('您沒有權限存取此頁面。');
    //     await supabase.auth.signOut();
    //     window.location.href = WAREHOUSE_ROUTES.LOGIN;
    //     return null;
    // }

    return data.session.user;
}

/**
 * 獲取當前登入的後台使用者物件。
 * @returns {Promise<object|null>} 如果存在 Session，則回傳 user 物件；否則回傳 null。
 */
export async function getCurrentWarehouseUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
}

/**
 * 處理後台使用者登出流程。
 */
export async function handleWarehouseLogout() {
    await supabase.auth.signOut();
    window.location.href = WAREHOUSE_ROUTES.LOGIN;
}