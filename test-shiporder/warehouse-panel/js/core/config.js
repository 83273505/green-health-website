// 檔案路徑: warehouse-panel/js/core/config.js

/**
 * @file Warehouse Panel Configuration (倉庫後台設定檔)
 * @description 集中管理倉庫後台應用程式的公開設定，特別是 Supabase 的連接資訊。
 *              此檔案應在所有其他腳本之前被 HTML 頁面載入。
 */

// 將 Supabase 的公開 URL 和 Anon Key 設為全域變數，供 warehouseSupabaseClient.js 使用。
window.WAREHOUSE_SUPABASE_CONFIG = {
  URL: 'https://zeezdsypknngfcodgjkd.supabase.co', // 與前端應用程式相同
  ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InplZXpkc3lwa25uZ2Zjb2RnamtkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE3MTMwODQsImV4cCI6MjA2NzI4OTA4NH0.h9aDnPMxMHYNjebSRC2bgxEwZDnGE_x5JRQNELOqZs0' // 與前端應用程式相同
};