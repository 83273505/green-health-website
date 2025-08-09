// ==============================================================================
// 檔案路徑: warehouse-panel/js/modules/warehouse/auth.js
// ------------------------------------------------------------------------------
// 【倉庫後台認證邏輯 (安全非同步版)】
// ==============================================================================

import { supabase } from '../../core/warehouseSupabaseClient.js';
import { showNotification, setFormSubmitting } from '../../core/utils.js';
import { WAREHOUSE_ROUTES } from '../../core/constants.js';

/**
 * 初始化登入頁面的邏輯
 */
async function initLoginPage() {
    const loginForm = document.getElementById('warehouse-login-form');

    if (!loginForm) {
        console.error('找不到登入表單 #warehouse-login-form');
        return;
    }
    
    // 【核心修正】在使用 supabase 之前，先用 await 等待 Promise 解析
    const client = await supabase;

    // 檢查使用者是否已經登入，如果已登入，直接跳轉到儀表板
    const { data: { session } } = await client.auth.getSession();
    if (session) {
        window.location.href = WAREHOUSE_ROUTES.DASHBOARD;
        return; // 如果已登入，後續的事件綁定就不需要了
    }

    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        setFormSubmitting(loginForm, true, '登入中...');
        showNotification('', 'info'); // 清除舊訊息

        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        // 使用已經 await 過的 client 實例
        const { error } = await client.auth.signInWithPassword({ email, password });

        if (error) {
            showNotification('登入失敗：' + error.message, 'error');
            setFormSubmitting(loginForm, false, '登入');
        } else {
            showNotification('登入成功！正在跳轉...', 'success');
            // onAuthStateChange 將會處理跳轉，這裡無需手動跳轉
        }
    });

    // 監聽認證狀態變化，一旦登入成功就跳轉
    client.auth.onAuthStateChange((event, session) => {
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