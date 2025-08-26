// ==============================================================================
// 檔案路徑: warehouse-panel/js/modules/warehouse/auth.js
// 版本: v45.3 - 路徑現代化重構 (決定版)
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Warehouse Auth Module (倉庫後台認證模組)
 * @description 负责处理仓库后台登入页面的业务逻辑。
 * @version v45.3
 * 
 * @update v45.3 - [PATH MODERNIZATION & LOCALIZATION]
 * 1. [核心修正] 档案顶部的所有 import 语句，已全部修改为从网站根目录 (`/`) 
 *          开始的绝对路径，与整个后台系统的现代化路径标准保持一致。
 * 2. [本地化] 檔案内所有註解及 UI 字串均已修正为正体中文。
 * 3. [依賴移除] 移除了对 `warehouseSupabaseClient.js` 的错误依赖，改为
 *          直接引用位於 `_shared` 目录下的统一 Supabase 用户端。
 */

// [v45.3 核心修正] 使用绝对路径引用所有模组
import { supabase } from '/_shared/js/supabaseClient.js';
import { showNotification, setFormSubmitting } from '/_shared/js/utils.js';
import { WAREHOUSE_ROUTES } from '/warehouse-panel/js/core/constants.js';

/**
 * 初始化登入頁面的邏輯
 */
async function initLoginPage() {
    const loginForm = document.getElementById('warehouse-login-form');

    if (!loginForm) {
        console.error('找不到登入表單 #warehouse-login-form');
        return;
    }
    
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