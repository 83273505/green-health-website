// ==============================================================================
// 檔案路徑: test-shiporder/admin/js/modules/launcher.js
// 版本: v45.3 - 路徑現代化重構 (決定版)
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Admin Launcher Module (管理後台 - 應用程式啟動台模組)
 * @description 處理應用程式啟動台的邏輯，包括權限驗證、獲取模組與動態渲染。
 * @version v45.3
 * 
 * @update v45.3 - [PATH MODERNIZATION & LOCALIZATION]
 * 1. [核心修正] 檔案頂部的所有 import 語句，已全部修改為從網站根目錄 (`/`) 
 *          開始的絕對路徑，確保路徑解析的絕對可靠性。
 * 2. [正體化] 檔案內所有註解及 UI 字串均已修正為正體中文。
 */

// [v45.3 核心修正] 使用絕對路徑引用所有模組
import { supabase } from '/_shared/js/supabaseClient.js';
import { requireAdminLogin, handleAdminLogout } from '/admin/js/core/auth.js';

// --- DOM 元素獲取 ---
const launcherContent = document.getElementById('launcher-content');
const currentUserEmailEl = document.getElementById('current-user-email');
const logoutBtn = document.getElementById('logout-btn');

/**
 * 從後端獲取使用者可訪問的模組清單。
 * @returns {Promise<Array>} - 模組物件的陣列。
 */
async function fetchModules() {
    try {
        const client = await supabase;
        const { data, error } = await client.functions.invoke('get-launcher-modules');
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('獲取應用程式模組清單失敗:', error);
        throw new Error('無法載入應用程式清單，請稍後再試。');
    }
}

/**
 * 將從後端獲取的模組資料，渲染成 HTML 卡片。
 * @param {Array} modules - 模組物件的陣列。
 */
function renderModules(modules) {
    if (!launcherContent) return;

    if (!modules || modules.length === 0) {
        launcherContent.innerHTML = `
            <div class="error-container">
                <p>您目前沒有任何可用的應用程式存取權限。</p>
                <p>如果您認為這是錯誤，請聯繫系統管理員。</p>
            </div>
        `;
        return;
    }

    const modulesHtml = modules.map(module => `
        <a href="${module.url}" class="module-card">
            <div class="card-content">
                ${module.badge ? `<div class="card-badge">${module.badge}</div>` : ''}
                <h3 class="card-title">${module.name}</h3>
                <p class="card-description">${module.description}</p>
            </div>
            <div class="card-footer">
                <span>前往系統</span>
            </div>
        </a>
    `).join('');

    launcherContent.innerHTML = `<div class="module-grid">${modulesHtml}</div>`;
}

/**
 * 由 app.js 呼叫的主初始化函式。
 */
export async function init() {
    // requireAdminLogin 內部會處理 await supabase
    const user = await requireAdminLogin();
    if (!user) {
        return;
    }

    if (currentUserEmailEl) {
        currentUserEmailEl.textContent = user.email;
    }
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleAdminLogout);
    }

    try {
        const modules = await fetchModules();
        renderModules(modules);
    } catch (error) {
        if (launcherContent) {
            launcherContent.innerHTML = `<div class="error-container"><p>${error.message}</p></div>`;
        }
    }
}