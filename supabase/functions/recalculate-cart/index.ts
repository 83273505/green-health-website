// 檔案路徑: supabase/functions/recalculate-cart/index.ts (Robust Response - Final Version)

// 為了最大限度地除錯，我們暫時不從 _shared 導入，以確保 corsHeaders 絕對有效。
// import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  // 定義一個絕對完整的、明確的 CORS 標頭物件
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS", // 明確允許 POST 和 OPTIONS 方法
  };

  // 處理 CORS 預檢請求
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 構造一個寫死的、空的購物車快照，用於測試回應是否成功
    const emptySnapshot = {
        items: [],
        itemCount: 0,
        summary: { subtotal: 0, couponDiscount: 0, shippingFee: 0, total: 0 },
        appliedCoupon: null,
    };
    
    // 在伺服器端日誌中打印一條訊息，以便我們確認函式是否被執行到這裡
    console.log("即將回傳一個空的快照 (嚴謹回應格式版)...");

    // ✅ 【最終修正】使用一個絕對完整的、明確的 headers 物件來回傳 200 OK
    return new Response(
      JSON.stringify(emptySnapshot),
      {
        // 結合 CORS 標頭和最重要的「內容類型」標頭
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        },
        status: 200, // 明確回傳成功的狀態碼
      }
    )
    
  } catch (error) {
    // 捕捉任何意料之外的錯誤
    console.error('在 recalculate-cart 的嚴謹回應版中發生錯誤:', error.message)
    
    // ✅ 【同步修正】在錯誤回應中，也使用同樣嚴謹的 headers
    return new Response(
      JSON.stringify({ error: error.message }), 
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        },
        status: 500, // 使用 500 表示伺服器內部錯誤
      }
    )
  }
})