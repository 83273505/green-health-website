// 檔案路徑: warehouse-panel/js/modules/warehouse/auth.js

/**
 * @file Warehouse Authentication Logic (倉庫後台認證邏輯)
 * @description 處理倉庫後台登入頁面的表單提交和使用者認證。
 */

import { supabase } from '../../core/warehouseSupabaseClient.js';
import { showNotification, setFormSubmitting } from '../../core/utils.js';
import { WAREHOUSE_ROUTES } from '../../core/constants.js';

/**
 * 初始化登入頁面的邏輯
 */
function initLoginPage() {
    const loginForm = document.getElementById('warehouse-login-form');

    if (!loginForm) {
        console.error('找不到登入表單 #warehouse-login-form');
        return;
    }

    // 檢查使用者是否已經登入，如果已登入，直接跳轉到儀表板
    supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
            window.location.href = WAREHOUSE_ROUTES.DASHBOARD;
        }
    });

    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        setFormSubmitting(loginForm, true, '登入');
        showNotification('', 'info'); // 清除舊訊息

        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        const { error } = await supabase.auth.signInWithPassword({ email, password });

        if (error) {
            showNotification('登入失敗：' + error.message, 'error');
            setFormSubmitting(loginForm, false, '登入');
        } else {
            showNotification('登入成功！正在跳轉...', 'success');
            // onAuthStateChange 將會處理跳轉
        }
    });

    // 監聽認證狀態變化，一旦登入成功就跳轉
    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN') {
            window.location.href = WAREHOUSE_ROUTES.DASHBOARD;
        }
    });
}

/**
 * 由 app.js 呼叫的主初始化函式
 */
export function init() {
    initLoginPage();
}