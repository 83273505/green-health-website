// ==============================================================================
// 檔案路徑: warehouse-panel/js/modules/warehouse/users.js
// 版本: v24.0 - 全域共用模組重構版
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

// 【核心修正】將 import 路徑指向 _shared 共用模組
import { supabase } from '../../../../_shared/js/supabaseClient.js';
import { showNotification } from '../../../../_shared/js/utils.js';

// 維持引用本模組內的 auth 和 constants
import { requireWarehouseLogin, handleWarehouseLogout } from '../../core/warehouseAuth.js';
import { FUNCTION_NAMES } from '../../core/constants.js';

// --- 狀態管理 ---
let currentUser = null;
// 【核心修正】移除硬編碼的 SUPER_ADMIN_USER_ID
// const SUPER_ADMIN_USER_ID = '...';
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
        // 【核心修正】動態判斷一個使用者是否為超級管理員
        const isTargetUserSuperAdmin = user.roles.includes('super_admin');
        
        // 只有超級管理員才能修改權限，且不能修改其他超級管理員的權限
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
    if (emailQuery.length < 3 && emailQuery !== '*') { // 允許 * 搜尋全部
        userListContainer.innerHTML = '<p class="initial-message">請至少輸入 3 個字元以開始搜尋 (或輸入 * 搜尋全部)。</p>';
        return;
    }

    userListContainer.innerHTML = '<p>搜尋中...</p>';
    showNotification('', 'info');

    try {
        const { data, error } = await supabase.functions.invoke(FUNCTION_NAMES.SEARCH_USERS, {
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

    target.disabled = true; // 防止重複點擊
    showNotification('正在更新權限...', 'info');

    try {
        const { data, error } = await supabase.functions.invoke(FUNCTION_NAMES.MANAGE_USER_ROLE, {
            body: { targetUserId, role: 'warehouse_staff', action } // 明確指定要操作的角色
        });
        
        if (error) throw error;
        if (data.error) throw new Error(data.error);

        showNotification('權限已成功更新！', 'success');
        
        // 更新本地快取並重新渲染
        const userIndex = userListCache.findIndex(u => u.id === targetUserId);
        if (userIndex !== -1) {
            userListCache[userIndex].roles = data.updatedUser.roles;
        }
        renderUserList();

    } catch (err) {
        console.error('更新權限時發生錯誤:', err);
        showNotification(`更新失敗：${err.message}`, 'error');
        target.checked = !target.checked; // 如果失敗，將開關恢復原狀
    } finally {
        // 重新啟用開關（基於 renderUserList 的新狀態）
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

    // 【核心權限檢查】改為檢查使用者角色
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