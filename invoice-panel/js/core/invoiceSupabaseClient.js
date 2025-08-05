// ==============================================================================
// 檔案路徑: invoice-panel/js/core/invoiceSupabaseClient.js
// ------------------------------------------------------------------------------
// 【發票管理後台 - Supabase Client 實例 (安全非同步版)】
// ==============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// 使用 let 來宣告變數，以便在非同步函式中賦值
let supabaseClientInstance = null;
let clientPromise = null;

/**
 * 安全地、非同步地獲取 Supabase Client 實例。
 * 這個函式會先從 Netlify Function API 獲取金鑰，然後才建立 Client。
 * 
 * @returns {Promise<SupabaseClient>}
 */
async function getSupabaseClient() {
    // 如果實例已存在，直接回傳 (單例模式)
    if (supabaseClientInstance) {
        return supabaseClientInstance;
    }
    
    // 如果正在建立中，等待該 Promise 完成
    if (clientPromise) {
        return clientPromise;
    }

    // 建立一個新的 Promise 來處理非同步的建立過程
    clientPromise = (async () => {
        try {
            // 步驟 1: 呼叫我們在 Netlify 上部署的 config function
            // 注意：路徑是相對於網站根目錄的絕對路徑
            const response = await fetch('/.netlify/functions/config');
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`無法從伺服器獲取 Supabase 設定: ${response.status} ${errorText}`);
            }
            const config = await response.json();

            if (!config.supabaseUrl || !config.supabaseAnonKey) {
                throw new Error('從伺服器獲取的 Supabase 設定不完整。');
            }

            // 步驟 2: 使用獲取到的金鑰來建立 client
            const client = createClient(config.supabaseUrl, config.supabaseAnonKey);
            console.log('✅ Invoice Panel Supabase Client 初始化成功');
            
            // 將建立好的實例存起來
            supabaseClientInstance = client;
            return client;

        } catch (error) {
            console.error('❌ Invoice Panel Supabase Client 初始化失敗:', error);
            alert("發票後台系統初始化失敗，請聯絡管理員。");
            // 失敗後重設 promise，允許重試
            clientPromise = null;
            throw error;
        }
    })();
    
    return clientPromise;
}

/**
 * 為了最大限度地減少對其他檔案的修改，我們匯出一個 Promise。
 * 其他檔案仍然可以 `import { supabase } from ...`。
 * 在使用時，只需要將 `supabase.from(...)` 改為 `(await supabase).from(...)`。
 */
export const supabase = getSupabaseClient();