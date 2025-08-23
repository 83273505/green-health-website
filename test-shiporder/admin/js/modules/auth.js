// ==============================================================================
// 檔案路徑: test-shiporder/admin/js/modules/auth.js
// 版本: v45.3 - 路徑現代化重構 (決定版)
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Admin Auth Module (管理後台 - 登入邏輯模組)
 * @description 處理統一後台入口的登入邏輯。
 * @version v45.3
 * 
 * @update v45.3 - [PATH MODERNIZATION & LOCALIZATION]
 * 1. [核心修正] 檔案頂部的所有 import 語句，已全部修改為從網站根目錄 (`/`) 
 *          開始的絕對路徑，確保路徑解析的絕對可靠性。
 * 2. [正體化] 檔案內所有註解及 UI 字串均已修正為正體中文。
 */

// [v45.3 核心修正] 使用絕對路徑引用所有模組
import { supabase } from '/_shared/js/supabaseClient.js';
import { showNotification, setFormSubmitting } from '/_shared/js/utils.js';
import { ADMIN_ROUTES } from '/admin/js/core/constants.js';

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
        const client = await supabase;
        const { error } = await client.auth.signInWithPassword({ email, password });
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
    try {
        const client = await supabase;
        const { data: { session } } = await client.auth.getSession();
        if (session) {
            // 已登入，直接跳轉
            window.location.href = ADMIN_ROUTES.LAUNCHER;
            return;
        }
        
        // 未登入，初始化登入頁面
        initLoginPage();
    } catch (error) {
        console.error('Auth 模組初始化失敗:', error);
        showNotification('系統驗證服務初始化失敗，請重新整理頁面。', 'error', 'notification-message');
    }
}