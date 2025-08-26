// ==============================================================================
// 檔案路徑: permission-panel/js/core/auth.js
// 版本: v28.3 - 正確相對路徑修正
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Permission Panel Auth
 * @description 權限管理面板專用的身份驗證模組。
 *              它依賴於 _shared/auth.js 提供的基礎驗證功能，
 *              並在其之上增加了本模組特定的「權限」檢查。
 */

import { supabase } from '../../../_shared/js/supabaseClient.js';
import { requireAdminLogin, handleAdminLogout as handleSharedLogout } from '../../../_shared/js/auth.js';
import { PERMISSION_ROUTES } from './constants.js';

/**
 * 路由守衛：要求使用者必須登入，並且具備 'module:permissions:view' 權限。
 * 如果驗證失敗，會自動重新導向到統一的 admin 登入頁。
 * @returns {Promise<object|null>} 如果驗證通過，回傳 user 物件；否則回傳 null。
 */
export async function requirePermissionPanelLogin() {
    // 步驟 1: 呼叫共用的基礎登入驗證，確保使用者已登入
    const user = await requireAdminLogin();
    if (!user) {
        // 如果未登入，requireAdminLogin 已經處理了頁面跳轉，此處直接返回
        return null;
    }
    
    // 步驟 2: 進行此模組特定的「權限」檢查
    const userPermissions = user.app_metadata?.permissions || [];

    if (!userPermissions.includes('module:permissions:view')) {
        alert('權限不足，您無法存取權限管理系統。');
        // 【核心修正】修正 await supabase 的呼叫方式
        const client = await supabase;
        await client.auth.signOut();
        // 跳轉至統一登入頁
        window.location.href = PERMISSION_ROUTES.LOGIN; 
        return null;
    }
    
    // 所有驗證通過，回傳使用者物件供後續頁面使用
    return user;
}

/**
 * 處理後台使用者登出流程。
 */
export async function handlePermissionPanelLogout() {
    // 呼叫共用的登出函式，它會處理 supabase.auth.signOut() 和頁面跳轉
    await handleSharedLogout();
}