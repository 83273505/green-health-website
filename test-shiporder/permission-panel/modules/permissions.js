// ==============================================================================
// 檔案路徑: permission-panel/js/modules/permissions.js
// 版本: v25.1 - 權限管理儀表板
// ------------------------------------------------------------------------------
// 【此為新檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Permission Management Module
 * @description 處理權限管理儀表板的核心業務邏輯。
 */

import { supabase } from '../../../_shared/js/supabaseClient.js';
import { requirePermissionPanelLogin, handlePermissionPanelLogout } from '../core/auth.js';
import { FUNCTION_NAMES } from '../core/constants.js';

// --- 狀態管理 ---
let currentUser = null;
let rbacSettings = {
    roles: [],
    permissions: [],
    role_permissions: []
};

// --- DOM 元素獲取 ---
const loadingView = document.getElementById('loading-view');
const mainContent = document.getElementById('main-content');
const permissionMatrix = document.getElementById('permission-matrix');
const currentUserEmailEl = document.getElementById('current-user-email');
const logoutBtn = document.getElementById('logout-btn');

// --- 核心函式 ---

/**
 * 從後端獲取所有 RBAC 相關的設定資料。
 */
async function fetchRbacSettings() {
    try {
        const client = await supabase;
        const { data, error } = await client.functions.invoke(FUNCTION_NAMES.GET_RBAC_SETTINGS);
        if (error) throw error;
        if (data.error) throw new Error(data.error);
        return data;
    } catch (error) {
        console.error('獲取權限設定時發生錯誤:', error);
        throw new Error('無法載入權限設定資料，請稍後再試。');
    }
}

/**
 * 將獲取到的 RBAC 資料，渲染成權限矩陣表格。
 */
function renderPermissionMatrix() {
    if (!permissionMatrix) return;

    const { roles, permissions, role_permissions } = rbacSettings;

    // 步驟 1: 建立表頭 (Thead)，以角色為欄
    const headerRow = roles.map(role => `<th class="role-col">${role.description.split('：')[0]}</th>`).join('');
    const thead = `<thead><tr><th class="permission-name-col">權限</th>${headerRow}</tr></thead>`;

    // 步驟 2: 建立表格主體 (Tbody)，以權限為列
    const tbodyRows = permissions.map(permission => {
        const cells = roles.map(role => {
            // 檢查在 role_permissions 中是否存在對應的關聯
            const hasPermission = role_permissions.some(rp => rp.role_id === role.id && rp.permission_id === permission.id);
            // 超級管理員的角色永遠被勾選且禁用
            const isDisabled = role.name === 'super_admin' ? 'disabled checked' : '';
            
            return `
                <td class="role-col">
                    <div class="permission-toggle">
                        <input 
                            type="checkbox" 
                            data-role-id="${role.id}"
                            data-permission-id="${permission.id}"
                            ${hasPermission ? 'checked' : ''}
                            ${isDisabled}
                        />
                    </div>
                </td>
            `;
        }).join('');

        return `
            <tr>
                <td class="permission-name-col">
                    ${permission.description.split('：')[1] || permission.name}
                    <small>${permission.name}</small>
                </td>
                ${cells}
            </tr>
        `;
    }).join('');
    const tbody = `<tbody>${tbodyRows}</tbody>`;

    permissionMatrix.innerHTML = thead + tbody;
}

/**
 * 處理權限核取方塊的變更事件。
 * @param {Event} event - Change 事件物件
 */
async function handlePermissionChange(event) {
    const checkbox = event.target;
    if (checkbox.type !== 'checkbox' || checkbox.disabled) return;

    const roleId = checkbox.dataset.roleId;
    const permissionId = checkbox.dataset.permissionId;
    const action = checkbox.checked ? 'grant' : 'revoke';

    checkbox.disabled = true; // 防止重複點擊

    try {
        const client = await supabase;
        const { data, error } = await client.functions.invoke(FUNCTION_NAMES.MANAGE_PERMISSION, {
            body: { roleId, permissionId, action }
        });

        if (error) throw error;
        if (data.error) throw new Error(data.error);

        // 成功後，更新本地快取以反映變更
        if (action === 'grant') {
            rbacSettings.role_permissions.push({ role_id: roleId, permission_id: permissionId });
        } else {
            rbacSettings.role_permissions = rbacSettings.role_permissions.filter(
                rp => !(rp.role_id === roleId && rp.permission_id === permissionId)
            );
        }
        
    } catch (error) {
        console.error('更新權限時發生錯誤:', error);
        alert(`更新失敗：${error.message}`);
        // 如果後端更新失敗，將 checkbox 的狀態還原
        checkbox.checked = !checkbox.checked;
    } finally {
        checkbox.disabled = false;
    }
}

/**
 * 綁定所有事件監聽器。
 */
function bindEvents() {
    if (logoutBtn) logoutBtn.addEventListener('click', handlePermissionPanelLogout);
    if (permissionMatrix) permissionMatrix.addEventListener('change', handlePermissionChange);
}


/**
 * 由 app.js 呼叫的主初始化函式。
 */
export async function init() {
    try {
        // 步驟 1: 驗證使用者權限
        currentUser = await requirePermissionPanelLogin();
        if (!currentUser) return;

        // 步驟 2: 顯示使用者資訊並綁定登出事件
        if (currentUserEmailEl) currentUserEmailEl.textContent = currentUser.email;
        bindEvents();

        // 步驟 3: 獲取 RBAC 設定並渲染
        rbacSettings = await fetchRbacSettings();
        renderPermissionMatrix();

        // 步驟 4: 顯示主內容
        if (loadingView) loadingView.classList.add('hidden');
        if (mainContent) mainContent.classList.remove('hidden');
        
    } catch (error) {
        if (loadingView) {
            loadingView.innerHTML = `<div class="error-view"><h2>載入失敗</h2><p>${error.message}</p></div>`;
        }
    }
}