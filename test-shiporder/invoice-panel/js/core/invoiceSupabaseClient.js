// ==============================================================================
// 檔案路徑: invoice-panel/js/core/invoiceSupabaseClient.js
// ------------------------------------------------------------------------------
// 【發票管理後台 - Supabase Client 實例 (安全非同步版)】
// ==============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// --- 模組內部變數，用於實現單例模式 ---

// 用於儲存已成功建立的 Supabase Client 實例
let supabaseClientInstance = null; 
// 用於儲存正在進行中的 client 建立 Promise，防止重複建立
let clientPromise = null; 

/**
 * 安全地、非同步地獲取 Supabase Client 實例。
 * 此函式會先從 Netlify Function API (/.netlify/functions/config) 獲取金鑰，
 * 然後才建立 Client。它確保了金鑰不會被硬編碼在前端程式碼中。
 * 
 * @returns {Promise<SupabaseClient>} 一個解析為 Supabase Client 實例的 Promise。
 */
async function getSupabaseClient() {
    // 如果實例已成功建立，則立即回傳，避免重複工作 (單例模式)
    if (supabaseClientInstance) {
        return supabaseClientInstance;
    }
    
    // 如果正在建立中 (即 clientPromise 存在)，則等待該 Promise 完成
    if (clientPromise) {
        return clientPromise;
    }

    // 如果尚未建立，則開始一個新的非同步建立過程
    clientPromise = (async () => {
        try {
            // 步驟 1: 呼叫我們在 Netlify 上部署的 config function
            console.log('[invoiceSupabaseClient] 正在從伺服器獲取 Supabase 設定...');
            const response = await fetch('/.netlify/functions/config');
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`無法從伺服器獲取 Supabase 設定: ${response.status} ${errorText}`);
            }
            const config = await response.json();

            // 驗證從伺服器獲取的設定是否完整
            if (!config.supabaseUrl || !config.supabaseAnonKey) {
                throw new Error('從伺服器獲取的 Supabase 設定不完整。');
            }

            // 步驟 2: 使用獲取到的金鑰來建立 client
            const client = createClient(config.supabaseUrl, config.supabaseAnonKey);
            console.log('✅ Invoice Panel Supabase Client 初始化成功');
            
            // 將成功建立的實例存起來，供後續直接使用
            supabaseClientInstance = client;
            return client;

        } catch (error) {
            console.error('❌ Invoice Panel Supabase Client 初始化失敗:', error);
            // 失敗後將 clientPromise 重設為 null，這樣下次呼叫時才能夠重新嘗試
            clientPromise = null;
            // 重新拋出錯誤，讓呼叫者 (例如 app.js) 能夠捕捉到並處理
            throw error;
        }
    })();
    
    return clientPromise;
}

/**
 * 為了讓其他模組能以 `import { supabase } from ...` 的方式方便地使用，
 * 我們直接匯出一個立即執行的函式呼叫。
 * 其他模組在拿到這個 `supabase` 物件時，它實際上是一個 Promise。
 * 在使用時，需要透過 `await supabase` 來獲取真正的 client 實例。
 * 例如: `const client = await supabase; client.from(...)`
 */
export const supabase = getSupabaseClient();