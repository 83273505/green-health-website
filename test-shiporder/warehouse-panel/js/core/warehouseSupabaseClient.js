// 檔案路徑: warehouse-panel/js/core/warehouseSupabaseClient.js

/**
 * @file Warehouse Supabase Client (倉庫後台 Supabase 客戶端)
 * @description 初始化並匯出一個單例的 Supabase client 實例，專供倉庫後台使用。
 */

// 從 CDN 引入 Supabase 的 createClient 函式
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// 從全域 window 物件讀取倉庫後台的 Supabase 連接資訊
const supabaseUrl = window.WAREHOUSE_SUPABASE_CONFIG.URL;
const supabaseAnonKey = window.WAREHOUSE_SUPABASE_CONFIG.ANON_KEY;

// 建立並匯出 Supabase client 實例
export const supabase = createClient(supabaseUrl, supabaseAnonKey);