// 檔案路徑: supabase/functions/_shared/cors.ts
// ----------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ----------------------------------------------------

/**
 * @file Shared CORS Headers (共用 CORS 標頭)
 * @description 定義一個所有 Edge Functions 都可以共用的 CORS 標頭物件。
 *              這確保了我們對跨來源請求的處理策略是一致的。
 */

export const corsHeaders = {
  // Access-Control-Allow-Origin: 允許哪些來源(網域)的請求。
  // '*' 是一個萬用字元，表示允許來自任何網域的請求。
  // 在開發階段，這很方便。
  // 在正式上線時，為了提高安全性，建議將其替換為您前端網站的具體網域，
  // 例如: 'https://your-domain.com'
  'Access-Control-Allow-Origin': '*',
  
  // Access-Control-Allow-Headers: 在實際請求中，允許客戶端(瀏覽器)
  // 包含哪些自訂的 HTTP 標頭。
  // 'authorization': 用於傳遞 JWT (JSON Web Token) 進行使用者認證。
  // 'x-client-info': Supabase JS Client 用來傳遞版本資訊的標頭。
  // 'apikey': 用於傳遞 Supabase 的 anon key。
  // 'content-type': 指示請求主體(body)的格式，例如 'application/json'。
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
Use code 