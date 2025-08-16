// ==============================================================================
// 檔案路徑: account-module/js/modules/dashboard/dashboard.js
// 版本: v32.0 - 消費者端模組拆分
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Dashboard Module (會員主頁模組)
 * @description 處理會員主頁的資料獲取、渲染及使用者互動。
 */

// 【核心修正】將 import 路徑指向新的 account-module 內部
import { supabase } from '../../core/supabaseClient.js';
import { requireLogin, getCurrentUser } from '../../core/session.js';
import { ROUTES, TABLE_NAMES, SUPABASE_ERRORS } from '../../core/constants.js';
import { showNotification } from '../../core/utils.js';

// --- DOM 元素獲取 ---
const loadingView = document.getElementById('loading-view');
const dashboardView = document.getElementById('dashboard-view');
const logoutButton = document.getElementById('logout-button');
const notificationMessageEl = document.getElementById('notification-message');

/**
 * 初始化儀表板，獲取並顯示其個人資料。
 */
async function initializeDashboard() {
    try {
        const user = await getCurrentUser();
        if (!user) {
            throw new Error('在儀表板初始化時無法獲取使用者資訊。');
        }

        const client = await supabase;
        const { data: profile, error } = await client
            .from(TABLE_NAMES.PROFILES)
            .select('*')
            .eq('id', user.id)
            .single();

        if (error && error.code !== SUPABASE_ERRORS.NO_ROWS_FOUND) {
            throw new Error(`讀取資料失敗：${error.message}`);
        }
        
        if (!profile || !profile.is_profile_complete) { 
            console.warn(`個人資料不完整或不存在，將導向設定頁面。`);
            window.location.href = ROUTES.PROFILE_SETUP;
        } else { 
            displayDashboard(profile, user); 
        }
    } catch (error) {
        console.error('儀表板初始化失敗:', error);
        if (loadingView) loadingView.textContent = '無法載入您的資料，請重新登入。';
    }
}

/**
 * 將使用者和個人資料填充到儀表板的 UI 介面中。
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
    try {
        const client = await supabase;
        await client.auth.signOut();
        window.location.href = ROUTES.LOGIN;
    } catch (error) {
        console.error('登出時發生錯誤:', error);
        alert('登出失敗，請稍後再試。');
    }
}

/**
 * 檢查並顯示從 auth-callback 頁面傳來的合併成功通知。
 */
function checkMergeNotification() {
    const notificationElementId = notificationMessageEl ? 'notification-message' : undefined;
    const shouldShow = sessionStorage.getItem('showMergeSuccessNotification');
    if (shouldShow === 'true') {
        showNotification('您的訪客購物車已成功合併！', 'success', notificationElementId);
        sessionStorage.removeItem('showMergeSuccessNotification');
    }
}

/**
 * 由 app.js 呼叫的主初始化函式。
 */
export async function init() {
    const user = await requireLogin();
    if (!user) return; 

    if (!notificationMessageEl && dashboardView) {
        const notificationDiv = document.createElement('div');
        notificationDiv.id = 'notification-message';
        notificationDiv.style.display = 'none';
        dashboardView.insertBefore(notificationDiv, dashboardView.firstChild);
    }
    
    checkMergeNotification();

    if (logoutButton) {
        logoutButton.addEventListener('click', handleLogout);
    }
    
    initializeDashboard();
}