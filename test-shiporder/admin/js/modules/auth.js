// ==============================================================================
// 檔案路徑: test-shiporder/admin/js/modules/auth.js
// 版本: v25.3 - 診斷版
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

// 【診斷日誌 - 探針 5A】
console.log('[auth.js] 檔案開始解析...');

/**
 * @file Admin Auth Module
 * @description 處理統一後台入口的登入邏輯。
 */

import { supabase } from '../../../_shared/js/supabaseClient.js';
import { showNotification, setFormSubmitting } from '../../../_shared/js/utils.js';
import { ADMIN_ROUTES } from '../core/constants.js';

// 【診斷日誌 - 斷言 5B】
console.log('[auth.js] 正在檢查核心依賴...');
if (!supabase || typeof showNotification !== 'function' || !ADMIN_ROUTES) {
    console.error('❌ [auth.js] 核心依賴載入不完整！');
} else {
    console.log('✅ [auth.js] 核心依賴檢查通過。');
}

/**
 * 初始化登入頁面的所有功能和事件監聽器。
 */
function initLoginPage() {
    const loginForm = document.getElementById('login-form');
    if (!loginForm) {
        console.error('在 admin 登入頁找不到 #login-form 元素。');
        return;
    }
    loginForm.addEventListener('submit', handleLogin);
}

/**
 * 處理登入表單的提交事件。
 * @param {Event} event - 表單提交事件。
 */
async function handleLogin(event) {
    event.preventDefault();
    const loginForm = event.target;
    
    setFormSubmitting(loginForm, true, '登入中...');
    showNotification('', 'info', 'notification-message');

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
            throw error;
        }
        window.location.href = ADMIN_ROUTES.LAUNCHER;
    } catch (error) {
        console.error('登入失敗:', error.message);
        showNotification(`登入失敗：${error.message}`, 'error', 'notification-message');
    } finally {
        setFormSubmitting(loginForm, false, '登入');
    }
}

/**
 * 由 app.js 呼叫的主初始化函式。
 */
export async function init() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        console.log('偵測到有效的工作階段，直接跳轉至啟動台...');
        window.location.href = ADMIN_ROUTES.LAUNCHER;
        return;
    }
    
    initLoginPage();
}

// 【診斷日誌 - 探針 5C】
console.log('[auth.js] 檔案解析完成。');