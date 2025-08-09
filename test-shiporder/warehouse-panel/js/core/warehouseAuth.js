// ==============================================================================
// 檔案路徑: warehouse-panel/js/core/warehouseAuth.js
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋 - v24.0 共用模組版】
// ==============================================================================

/**
 * @file Warehouse Panel Auth
 * @description 倉庫後台專用的身份驗證模組。
 *              它依賴於 _shared/auth.js 提供的基礎驗證功能，
 *              並在其之上增加了本模組特定的角色權限檢查。
 */

// 【核心架構】從共用的 _shared 模組引入 supabase client 和基礎驗證邏輯
// 這個相對路徑是從 /warehouse-panel/js/core/ 出發，向上返回三層到達 /test-shiporder/，
// 然後再進入 _shared/js/，路徑完全正確。
import { supabase } from '../../../_shared/js/supabaseClient.js';
import { requireAdminLogin, handleAdminLogout as handleSharedLogout } from '../../../_shared/js/auth.js';
import { WAREHOUSE_ROUTES } from './constants.js';

/**
 * 路由守衛：要求使用者必須登入，並且具備 'warehouse_staff' 或 'super_admin' 角色。
 * 如果驗證失敗，會自動重新導向到統一的 admin 登入頁。
 * @returns {Promise<object|null>} 如果驗證通過，回傳 user 物件；否則回傳 null。
 */
export async function requireWarehouseLogin() {
    // 步驟 1: 呼叫共用的基礎登入驗證，確保使用者已登入
    const user = await requireAdminLogin();
    if (!user) {
        // 如果未登入，requireAdminLogin 已經處理了頁面跳轉，此處直接返回
        return null;
    }
    
    // 步驟 2: 進行此模組特定的角色權限檢查
    const userRoles = user.app_metadata?.roles || [];

    if (!userRoles.includes('warehouse_staff') && !userRoles.includes('super_admin')) {
        alert('權限不足，您無法存取此頁面。');
        await supabase.auth.signOut(); // 為安全起見，登出沒有權限的使用者
        // 跳轉至統一登入頁
        window.location.href = WAREHOUSE_ROUTES.LOGIN; 
        return null;
    }
    
    // 所有驗證通過，回傳使用者物件供後續頁面使用
    return user;
}

/**
 * 處理後台使用者登出流程。
 */
export async function handleWarehouseLogout() {
    // 呼叫共用的登出函式，它會處理 supabase.auth.signOut() 和頁面跳轉
    await handleSharedLogout();
}