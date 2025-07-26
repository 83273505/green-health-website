// 檔案路徑: js/modules/dashboard/dashboard.js (Logout Double Check - Final Version)

import { supabase } from '../../core/supabaseClient.js';
import { requireLogin, getCurrentUser } from '../../core/session.js';
import { ROUTES, TABLE_NAMES, SUPABASE_ERRORS } from '../../core/constants.js';

const loadingView = document.getElementById('loading-view');
const dashboardView = document.getElementById('dashboard-view');
const logoutButton = document.getElementById('logout-button');

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

    if (error && error.code !== SUPABASE_ERRORS.NO_ROWS_FOUND) {
        if (loadingView) loadingView.textContent = '讀取資料失敗：' + error.message;
        return;
    }
    
    if (!profile || !profile.is_profile_complete) { 
        window.location.href = ROUTES.PROFILE_SETUP;
    } else { 
        displayDashboard(profile, user); 
    }
}

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
 * 處理使用者登出流程
 */
async function handleLogout() {
    // 1. 執行 Supabase 的登出操作
    const { error } = await supabase.auth.signOut();
    if (error) {
        console.error('登出時發生錯誤:', error);
    }
    
    // ✅ 【釜底抽薪的修正】
    // 在頁面跳轉之前，強制清除 localStorage 中的 cartId
    localStorage.removeItem('cartId');

    // 3. 最後才將使用者導向登入頁
    window.location.href = ROUTES.LOGIN;
}

export async function init() {
    const user = await requireLogin();
    if (!user) return; 

    if (logoutButton) {
        logoutButton.addEventListener('click', handleLogout);
    }
    
    initializeDashboard();
}