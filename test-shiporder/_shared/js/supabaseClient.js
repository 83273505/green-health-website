// ==============================================================================
// 檔案路徑: test-shiporder/_shared/js/supabaseClient.js
// 版本: v25.3 - 診斷版
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

// 【診斷日誌 - 探針 2A】
console.log('[supabaseClient.js] 檔案開始解析...');

/**
 * @file Shared Supabase Client
 * @description 建立並匯出一個所有後台面板共用的 Supabase 客戶端單例。
 */

// 從 esm.sh CDN 引入 Supabase 的 createClient 函式
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

let supabaseInstance = null;

try {
    // 【診斷日誌 - 斷言 2B】
    console.log('[supabaseClient.js] 正在檢查核心依賴...');

    // 檢查 config.js 是否已正確載入並設定了全域變數
    if (!window.SUPABASE_CONFIG || !window.SUPABASE_CONFIG.url || !window.SUPABASE_CONFIG.anonKey) {
        throw new Error('全域變數 window.SUPABASE_CONFIG 未被載入或設定不完整。');
    }
    console.log('[supabaseClient.js] ✅ window.SUPABASE_CONFIG 檢查通過。');

    // 檢查 createClient 函式是否已從 CDN 成功載入
    if (typeof createClient !== 'function') {
        throw new Error('Supabase 的 createClient 函式無法從 CDN (esm.sh) 載入。');
    }
    console.log('[supabaseClient.js] ✅ createClient 函式檢查通過。');

    // 從全域設定中獲取 URL 和 Anon Key
    const supabaseUrl = window.SUPABASE_CONFIG.url;
    const supabaseAnonKey = window.SUPABASE_CONFIG.anonKey;

    // 建立 Supabase Client 實例
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
    
    if (!supabaseInstance) {
        throw new Error('createClient 函式執行後，未能成功建立 supabase 實例。');
    }
    console.log('[supabaseClient.js] ✅ Supabase Client 實例已成功建立。');

} catch (error) {
    // 如果任何一個核心依賴出錯，這是一個致命錯誤，會阻止應用程式繼續執行。
    const errorMessage = `Supabase Client 初始化失敗: ${error.message}`;
    console.error(`❌ ${errorMessage}`);
    // 在頁面上顯示一個對使用者友善的錯誤提示
    document.body.innerHTML = `<div style="padding: 2rem; text-align: center; color: red;">${errorMessage}</div>`;
    // 拋出錯誤以中斷後續所有 JavaScript 的執行
    throw new Error(errorMessage);
}


/**
 * @const {SupabaseClient} supabase
 * @description 共用的 Supabase 客戶端實例。
 *              應用程式的其他模組應該都從此處引入 supabase 實例，
 *              以確保所有部分都使用同一個連線設定。
 */
export const supabase = supabaseInstance;

// 【診斷日誌 - 探針 2C】
console.log('[supabaseClient.js] 檔案解析完成，並已匯出 supabase 實例。');