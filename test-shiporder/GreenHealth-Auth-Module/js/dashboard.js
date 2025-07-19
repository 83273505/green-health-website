// 檔案路徑: GreenHealth-Auth-Module/js/dashboard.js

/**
 * @file Dashboard Module
 * @description Provides a library of functions for the user dashboard page.
 * This module is initialized by app.js.
 */

import { supabase } from './supabaseClient.js';
import { requireLogin } from './session.js';
import { TABLE_NAMES, ROUTES, SUPABASE_ERRORS } from './constants.js';

// --- 私有函式 (模組內部使用) ---

async function initializeDashboard() {
    const user = await requireLogin();
    if (!user) return;

    const { data: profile, error } = await supabase
        .from(TABLE_NAMES.PROFILES)
        .select('*')
        .eq('id', user.id)
        .single();
    
    if (error && error.code !== SUPABASE_ERRORS.NO_ROWS_FOUND) {
        // 在 dashboard 頁面，如果讀取失敗，可以直接顯示錯誤
        const loadingView = document.getElementById('loading-view');
        if(loadingView) loadingView.textContent = '讀取資料失敗：' + error.message;
        return;
    }
    
    if (!profile || !profile.is_profile_complete) { 
        console.warn(`Profile is not complete. Redirect to ${ROUTES.PROFILE_SETUP} is temporarily disabled for testing.`);
        displayDashboard(profile || {}, user);
    } else { 
        displayDashboard(profile, user); 
    }
}

function displayDashboard(profile, user) {
    const loadingView = document.getElementById('loading-view');
    const dashboardView = document.getElementById('dashboard-view');
    
    if(loadingView) loadingView.style.display = 'none';
    if(dashboardView) dashboardView.style.display = 'block';

    const userNameEl = document.getElementById('user-name');
    const userEmailEl = document.getElementById('user-email');
    const userPhoneEl = document.getElementById('user-phone');
    const userBirthdayEl = document.getElementById('user-birthday');

    if(userNameEl) userNameEl.textContent = profile.name || '使用者';
    if(userEmailEl) userEmailEl.textContent = user.email || 'N/A';
    if(userPhoneEl) userPhoneEl.textContent = profile.phone || '尚未提供';
    if(userBirthdayEl) userBirthdayEl.textContent = profile.birthday || '尚未提供';
}

async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = ROUTES.LOGIN;
}


// --- 公開的初始化函式 (由 app.js 呼叫) ---

/**
 * Main initializer for the dashboard module.
 */
export function init() {
    const logoutButton = document.getElementById('logout-button');
    if(logoutButton) {
        logoutButton.addEventListener('click', handleLogout);
    }
    initializeDashboard();
}