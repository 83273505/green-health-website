// 檔案路徑: supabase/functions/_shared/cors.ts
// ==============================================================================
/**
 * 檔案名稱：cors.ts
 * 檔案職責：【v50.3 熔爐協議修正版】定義所有 Edge Functions 共用的 CORS 標頭。
 * 版本：50.3
 * SOP 條款對應：
 * - [SOP-CE 13] 競爭性熔爐協議
 * AI 註記：
 * 變更摘要:
 * - [Access-Control-Allow-Headers]::[修正]::【✅ Alpha 組方案】在此處的白名單中，明確新增了 `'x-cart-token'`。
 * - [原理]::[說明]:: 此修正解決了因瀏覽器 Preflight Request (預檢請求) 失敗，而導致所有購物車 API 呼叫均被 CORS 策略阻斷的致命錯誤。
 * 更新日誌 (Changelog)：
 * - v50.3 (2025-09-27)：新增 x-cart-token 至允許標頭，修復 CORS 錯誤。
 * - v50.2 (2025-09-27)：舊版，缺少 x-cart-token。
 */

export const corsHeaders = {
  // Access-Control-Allow-Origin: 允許哪些來源(網域)的請求。
  // '*' 是一個萬用字元，表示允許來自任何網域的請求。
  // 在正式上線時，為了提高安全性，建議將其替換為您前端網站的具體網域，
  // 例如: 'https://greenhealthtw.com.tw'
  'Access-Control-Allow-Origin': '*',
  
  // Access-Control-Allow-Headers: 在實際請求中，允許客戶端(瀏覽器)
  // 包含哪些自訂的 HTTP 標頭。
  // 【v50.3 核心修正】在此處新增 'x-cart-token'
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cart-token',
}