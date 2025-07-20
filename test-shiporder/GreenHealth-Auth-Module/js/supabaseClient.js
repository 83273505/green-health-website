// 檔案路徑: GreenHealth-Auth-Module/js/supabaseClient.js

/**
 * @file Supabase Client Initializer
 * @description This module initializes and exports a singleton Supabase client instance.
 * It serves as the single source of truth for all Supabase interactions across the application.
 * By centralizing the client creation, we ensure consistent configuration and make future updates easier.
 */

// 從 CDN 引入 Supabase 的 createClient 函式
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// 從全域 window 物件讀取您在 config.js 中設定的 Supabase 連接資訊
// 這樣做可以讓我們保持 config.js 不變，同時將 Client 實例模組化
const supabaseUrl = window.SUPABASE_CONFIG.URL;
const supabaseAnonKey = window.SUPABASE_CONFIG.ANON_KEY;

// 建立 Supabase client 實例
export const supabase = createClient(supabaseUrl, supabaseAnonKey);