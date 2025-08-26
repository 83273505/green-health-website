// ==============================================================================
// 檔案路徑: storefront-module/js/core/supabaseClient.js
// 版本: v32.0 - 消費者端模組拆分
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Supabase Client 初始化模組 (商店前端版)
 * @description 此模組負責初始化並匯出一個單例 (singleton) 的 Supabase client 實例。
 *              它不再依賴於 config.js，而是透過呼叫 Netlify Function 來安全地獲取金鑰。
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// --- 模組內部變數，用於實現單例模式 ---
let supabaseClientInstance = null; 
let clientPromise = null; 

/**
 * 安全地、非同步地獲取 Supabase Client 實例。
 * @returns {Promise<SupabaseClient>} 一個解析為 Supabase Client 實例的 Promise。
 */
async function getSupabaseClient() {
    if (supabaseClientInstance) {
        return supabaseClientInstance;
    }
    
    if (clientPromise) {
        return clientPromise;
    }

    clientPromise = (async () => {
        try {
            const response = await fetch('/.netlify/functions/config');
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`無法從伺服器獲取 Supabase 設定: ${response.status} ${errorText}`);
            }
            const config = await response.json();

            if (!config.supabaseUrl || !config.supabaseAnonKey) {
                throw new Error('從伺服器獲取的 Supabase 設定不完整。');
            }

            const client = createClient(config.supabaseUrl, config.supabaseAnonKey);
            
            supabaseClientInstance = client;
            return client;

        } catch (error) {
            console.error('❌ 商店前端 Supabase Client 初始化失敗:', error);
            clientPromise = null;
            throw error;
        }
    })();
    
    return clientPromise;
}

/**
 * 為了讓其他模組能以 `import { supabase } from ...` 的方式方便地使用，
 * 我們直接匯出一個立即執行的函式呼叫，它回傳的是一個 Promise。
 * 其他模組在使用時，需要透過 `await supabase` 來獲取真正的 client 實例。
 */
export const supabase = getSupabaseClient();