// ==============================================================================
// 檔案路徑: test-shiporder/_shared/js/supabaseClient.js
// ------------------------------------------------------------------------------
// 【此為新檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Shared Supabase Client
 * @description 建立並匯出一個所有後台面板共用的 Supabase 客戶端單例。
 */

// 從 esm.sh CDN 引入 Supabase 的 createClient 函式
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// 檢查 config.js 是否已正確載入並設定了全域變數
if (!window.SUPABASE_CONFIG || !window.SUPABASE_CONFIG.url || !window.SUPABASE_CONFIG.anonKey) {
    // 如果 config.js 未載入，這是一個致命錯誤，會阻止應用程式繼續執行。
    // 在瀏覽器主控台顯示一個清晰的錯誤訊息，方便除錯。
    const errorMessage = 'Supabase 設定檔 (config.js) 未被載入或設定不完整。請確保在 HTML 中已正確引用 config.js。';
    console.error(errorMessage);
    // 在頁面上顯示一個對使用者友善的錯誤提示
    document.body.innerHTML = `<div style="padding: 2rem; text-align: center; color: red;">${errorMessage}</div>`;
    // 拋出錯誤以中斷後續所有 JavaScript 的執行
    throw new Error(errorMessage);
}

// 從全域設定中獲取 URL 和 Anon Key
const supabaseUrl = window.SUPABASE_CONFIG.url;
const supabaseAnonKey = window.SUPABASE_CONFIG.anonKey;

/**
 * @const {SupabaseClient} supabase
 * @description 共用的 Supabase 客戶端實例。
 *              應用程式的其他模組應該都從此處引入 supabase 實例，
 *              以確保所有部分都使用同一個連線設定。
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey);