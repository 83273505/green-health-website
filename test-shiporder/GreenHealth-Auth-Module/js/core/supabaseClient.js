// 檔案路徑: js/core/supabaseClient.js

/**
 * @file Supabase Client 初始化模組
 * @description 此模組負責初始化並匯出一個單例 (singleton) 的 Supabase client 實例。
 *              它作為整個應用程式中所有 Supabase 互動的唯一來源。
 *              在新架構下，它被歸類為核心 (core) 模組。
 * 
 * 【架構說明】
 *   - 此檔案的內容在本次架構升級中無需修改。
 *   - 它依賴於在 HTML 中先載入的 config.js 所提供的全域變數 window.SUPABASE_CONFIG。
 */

// 從 CDN 引入 Supabase 的 createClient 函式
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// 從全域 window 物件讀取您在 config.js 中設定的 Supabase 連接資訊
const supabaseUrl = window.SUPABASE_CONFIG.URL;
const supabaseAnonKey = window.SUPABASE_CONFIG.ANON_KEY;

// 建立 Supabase client 實例，並將其匯出，以便其他模組可以引用
export const supabase = createClient(supabaseUrl, supabaseAnonKey);