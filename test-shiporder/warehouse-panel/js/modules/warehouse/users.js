// ==============================================================================
// 檔案路徑: warehouse-panel/js/modules/warehouse/users.js
// 版本: v45.4 - 完全正體化修正
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file User Management Module (使用者管理模組)
 * @description 負責處理後台使用者權限的管理介面。
 * @version v45.4
 * 
 * @update v45.4 - [LOCALIZATION]
 * 1. [本地化] 將 v45.3 版本中所有殘留的簡體中文註解及錯誤訊息，完全修正為正體中文。
 * 
 * @update v45.3 - [PATH MODERNIZATION]
 * 1. [核心修正] 檔案頂部的所有 import 語句，已全部從脆弱的相對路徑
 *          ('../../../../..') 修改為從網站根目錄 (`/`) 開始的絕對路徑。
 * 2. [原理] 確保此模組的依賴載入行為，與 app.js 的現代化路徑策略完全一致，
 *          提升了整個系統的健壯性與可維護性。
 */

// [v45.3 核心修正] 使用絕對路徑引用所有模組
import { supabase } from '/_shared/js/supabaseClient.js';
import { showNotification } from '/_shared/js/utils.js';
import { requireWarehouseLogin, handleWarehouseLogout } from '/warehouse-panel/js/core/warehouseAuth.js';
import { FUNCTION_NAMES } from '/warehouse-panel/js/core/constants.js';

// --- 狀態管理 ---
let currentUser = null;
let userListCache = [];

// --- DOM 元素獲取 ---
const logoutBtn = document.getElementById('logout-btn');
const currentUserEmailEl = document.getElementById('current-user-email');
const adminCheckView = document.getElementById('admin-check-view');
const mainContent = document.getElementById('main-content');
const searchInput = document.getElementById('user-search-input');
const userListContainer = document.getElementById('user-list-container');

// --- 核心函式 ---

/**
 * 根據搜尋結果渲染使用者列表
 */
function renderUserList() {
    if (userListCache.length === 0) {
        userListContainer.innerHTML = '<p>找不到符合條件的使用者。</p>';
        return;
    }

    const currentUserRoles = currentUser.app_metadata?.roles || [];
    const isCurrentUserSuperAdmin = currentUserRoles.includes('super_admin');

    userListContainer.innerHTML = userListCache.map(user => {
        const hasPermission = user.roles.includes('warehouse_staff');
        const isTargetUserSuperAdmin = user.roles.includes('super_admin');
        
        const disabledAttribute = !isCurrentUserSuperAdmin || isTargetUserSuperAdmin 
            ? `disabled title="${isTargetUserSuperAdmin ? '無法修改超級管理員的權限' : '權限不足'}"` 
            : '';

        return `
            <div class="user-item">
                <span class="user-email">${user.email} ${isTargetUserSuperAdmin ? '(超級管理員)' : ''}</span>
                <div class="permission-toggle">
                    <label class="switch">
                        <input 
                            type="checkbox" 
                            data-user-id="${user.id}"
                            ${hasPermission ? 'checked' : ''}
                            ${disabledAttribute}
                        >
                        <span class="slider round"></span>
                    </label>
                    <span class="permission-label">${hasPermission ? '具備出貨權限' : '無出貨權限'}</span>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * 處理使用者搜尋
 */
async function handleUserSearch() {
    const emailQuery = searchInput.value.trim();
    if (emailQuery.length < 3 && emailQuery !== '*') {
        userListContainer.innerHTML = '<p class="initial-message">請至少輸入 3 個字元以開始搜尋 (或輸入 * 搜尋全部)。</p>';
        return;
    }

    userListContainer.innerHTML = '<p>搜尋中...</p>';
    showNotification('', 'info');

    try {
        const client = await supabase;
        const { data, error } = await client.functions.invoke(FUNCTION_NAMES.SEARCH_USERS, {
            body: { emailQuery }
        });

        if (error) throw error;
        if (data.error) throw new Error(data.error);

        userListCache = data;
        renderUserList();

    } catch (err) {
        console.error('搜尋使用者時發生錯誤:', err);
        showNotification(`搜尋失敗：${err.message}`, 'error');
        userListContainer.innerHTML = '<p class="error-message">搜尋時發生錯誤。</p>';
    }
}

/**
 * 處理權限變更
 * @param {Event} event
 */
async function handlePermissionChange(event) {
    const target = event.target;
    if (target.type !== 'checkbox' || target.disabled) return;

    const targetUserId = target.dataset.userId;
    const action = target.checked ? 'grant' : 'revoke';

    target.disabled = true;
    showNotification('正在更新權限...', 'info');

    try {
        const client = await supabase;
        const { data, error } = await client.functions.invoke(FUNCTION_NAMES.MANAGE_USER_ROLE, {
            body: { targetUserId, action } // [修正] 移除 role，role 在後端定義
        });
        
        if (error) throw error;
        if (data.error) throw new Error(data.error);

        showNotification('權限已成功更新！', 'success');
        
        const userIndex = userListCache.findIndex(u => u.id === targetUserId);
        if (userIndex !== -1) {
            userListCache[userIndex].roles = data.updatedUser.roles;
        }
        renderUserList();

    } catch (err) {
        console.error('更新權限時發生錯誤:', err);
        showNotification(`更新失敗：${err.message}`, 'error');
        target.checked = !target.checked;
    } finally {
        const reRenderedCheckbox = userListContainer.querySelector(`input[data-user-id="${targetUserId}"]`);
        if (reRenderedCheckbox && !reRenderedCheckbox.hasAttribute('disabled')) {
            reRenderedCheckbox.disabled = false;
        }
    }
}

/**
 * 綁定事件監聽器
 */
function bindEvents() {
    logoutBtn.addEventListener('click', handleWarehouseLogout);
    
    let searchTimeout;
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(handleUserSearch, 500);
    });

    userListContainer.addEventListener('change', handlePermissionChange);
}

/**
 * 由 app.js 呼叫的主初始化函式
 */
export async function init() {
    currentUser = await requireWarehouseLogin();
    if (!currentUser) return;

    if (currentUserEmailEl) {
        currentUserEmailEl.textContent = currentUser.email;
    }

    const userRoles = currentUser.app_metadata?.roles || [];
    if (userRoles.includes('super_admin')) {
        adminCheckView.classList.add('hidden');
        mainContent.classList.remove('hidden');
        bindEvents();
    } else {
        adminCheckView.innerHTML = '<p class="error-message">權限不足。只有超級管理員才能存取此頁面。</p>';
        adminCheckView.classList.remove('hidden');
        mainContent.classList.add('hidden');
    }
}