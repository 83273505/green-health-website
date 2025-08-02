// 檔案路徑: js/modules/dashboard/dashboard.js

/**
 * @file Dashboard Module (會員主頁模組)
 * @description 處理會員主頁的資料獲取、渲染及使用者互動。
 */

// 從核心模組明確引入所有依賴
import { supabase } from '../../core/supabaseClient.js';
import { requireLogin, getCurrentUser } from '../../core/session.js';
import { ROUTES, TABLE_NAMES, SUPABASE_ERRORS } from '../../core/constants.js';

// --- DOM 元素獲取 ---
const loadingView = document.getElementById('loading-view');
const dashboardView = document.getElementById('dashboard-view');
const logoutButton = document.getElementById('logout-button');

/**
 * 初始化儀表板，獲取並顯示其個人資料。
 * 此函式現在假設使用者已通過驗證。
 */
async function initializeDashboard() {
    const user = await getCurrentUser();
    if (!user) {
        console.error('在儀表板初始化時無法獲取使用者資訊。');
        if (loadingView) loadingView.textContent = '無法獲取使用者資訊，請重新登入。';
        return;
    }

    const { data: profile, error } = await supabase
        .from(TABLE_NAMES.PROFILES)
        .select('*')
        .eq('id', user.id)
        .single();

    // 處理資料庫查詢錯誤
    if (error && error.code !== SUPABASE_ERRORS.NO_ROWS_FOUND) {
        if (loadingView) loadingView.textContent = '讀取資料失敗：' + error.message;
        return;
    }
    
    // 關鍵業務邏輯：如果 profile 不存在或不完整，導向設定頁面
    if (!profile || !profile.is_profile_complete) { 
        console.warn(`個人資料不完整或不存在，將導向設定頁面。`);
        window.location.href = ROUTES.PROFILE_SETUP;
    } else { 
        displayDashboard(profile, user); 
    }
}

/**
 * 將使用者和個人資料填充到儀表板的 UI 介面中。
 * @param {object} profile - 來自 'profiles' 表的用戶個人資料。
 * @param {object} user - 來自 Supabase Auth 的使用者物件。
 */
function displayDashboard(profile, user) {
    if (loadingView) loadingView.style.display = 'none';
    if (dashboardView) dashboardView.style.display = 'block';

    const userNameEl = document.getElementById('user-name');
    const userEmailEl = document.getElementById('user-email');
    const userPhoneEl = document.getElementById('user-phone');
    const userBirthdayEl = document.getElementById('user-birthday');

    if (userNameEl) userNameEl.textContent = profile.name || '使用者';
    if (userEmailEl) userEmailEl.textContent = user.email || 'N/A';
    if (userPhoneEl) userPhoneEl.textContent = profile.phone || '尚未提供';
    if (userBirthdayEl) userBirthdayEl.textContent = profile.birthday || '尚未提供';
}

/**
 * 處理使用者登出流程。
 */
async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = ROUTES.LOGIN;
}

/**
 * 由 app.js 呼叫的主初始化函式。
 */
export async function init() {
    // 1. 在模組初始化的第一步就進行登入驗證
    const user = await requireLogin();
    // 如果 requireLogin 發現未登入，會自動跳轉，後面的程式碼不會執行
    if (!user) return; 

    // 2. 綁定事件
    if (logoutButton) {
        logoutButton.addEventListener('click', handleLogout);
    }
    
    // 3. 只有在確認使用者已登入後，才繼續執行頁面的核心邏輯
    initializeDashboard();
}