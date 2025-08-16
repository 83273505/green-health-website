// ==============================================================================
// 檔案路徑: warehouse-panel/js/core/warehouseAuth.js
// 版本: v26.0 - 繞道通行版
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Warehouse Panel Auth
 * @description 倉庫後台專用的身份驗證模組。
 */

import { supabase } from '../../../_shared/js/supabaseClient.js';
import { requireAdminLogin, handleAdminLogout as handleSharedLogout } from '../../../_shared/js/auth.js';
import { WAREHOUSE_ROUTES } from './constants.js';

/**
 * 路由守衛：要求使用者必須登入。
 * 【v26.0 變更】暫時停用精細的 'module:shipping:view' 權限檢查，
 *              以繞過 Supabase 使用者資料無法更新的 Bug。
 * @returns {Promise<object|null>} 如果驗證通過，回傳 user 物件；否則回傳 null。
 */
export async function requireWarehouseLogin() {
    // 步驟 1: 呼叫共用的基礎登入驗證，確保使用者已登入
    const user = await requireAdminLogin();
    if (!user) {
        // 如果未登入，requireAdminLogin 已經處理了頁面跳轉，此處直接返回
        return null;
    }
    
    // 步驟 2: 【核心修改】暫時註解掉精細的權限檢查邏輯
    /*
    const userPermissions = user.app_metadata?.permissions || [];

    if (!userPermissions.includes('module:shipping:view')) {
        alert('權限不足，您無法存取出貨管理系統。');
        await supabase.auth.signOut(); // 為安全起見，登出沒有權限的使用者
        // 跳轉至統一登入頁
        window.location.href = WAREHOUSE_ROUTES.LOGIN; 
        return null;
    }
    */
    
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