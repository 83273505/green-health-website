// ==============================================================================
// 檔案路徑: netlify/functions/config.js
// ------------------------------------------------------------------------------
// 【Netlify Function - 提供環境變數】
// ==============================================================================
// 這個函式會在伺服器端執行，它的作用是將安全的環境變數，
// 作為一個 API 端點，提供給前端的 JavaScript。

exports.handler = async function (event, context) {
  // process.env 會自動包含我們在 Netlify UI 上設定的環境變數
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

  // 進行基本的驗證，確保環境變數已設定
  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "伺服器端的 Supabase 環境變數未設定。"
      }),
    };
  }
  
  // 將金鑰作為 JSON 回應傳回給前端
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*', // 允許所有來源的前端呼叫
    },
    body: JSON.stringify({
      supabaseUrl: supabaseUrl,
      supabaseAnonKey: supabaseAnonKey,
    }),
  };
};