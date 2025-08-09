// ==============================================================================
// 檔案路徑: test-shiporder/_shared/js/config.js
// ------------------------------------------------------------------------------
// 【此為新檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Shared Config
 * @description 所有後台面板共用的全域設定檔。
 *              這個檔案必須在 HTML 中，於所有其他腳本之前被載入。
 */

// 將 Supabase 的憑證設定在全域的 window 物件上，
// 這樣它們就可以被應用程式的其他部分（特別是 supabaseClient.js）輕鬆存取，
// 而無需在每個模組中重複 import 或硬編碼。
// 這種做法簡化了多個前端應用程式模組共用相同後端設定的流程。

window.SUPABASE_CONFIG = {
    url: 'https://zeezdsypknngfcodgjkd.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InplZXpkc3lwa25uZ2Zjb2RnamtkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjA1ODg0NDgsImV4cCI6MjAzNjE2NDQ0OH0.P_Xb_YFFQw-8F-1y-aHqxshHPSbI-0i42o_a-h48r2E'
};