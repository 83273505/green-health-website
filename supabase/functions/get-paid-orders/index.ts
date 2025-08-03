// 檔案路徑: supabase/functions/get-paid-orders/index.ts
// ----------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ----------------------------------------------------

// 引入必要的函式庫
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

console.log(`函式 "get-paid-orders" 已啟動`)

// 主服務函式
Deno.serve(async (req) => {
  // 處理 CORS 預檢請求 (Preflight request)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 建立一個具有最高權限的 Supabase client
    // 環境變數由 Supabase 自動提供
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 查詢 status 為 'pending_payment' 的訂單
    // 並連接相關資料表以獲取前端顯示所需的資訊
    const { data: orders, error } = await supabaseClient
      .from('orders')
      .select(`
        id,
        order_number,
        order_date,
        status,
        payment_status,
        payment_reference,
        shipping_address_snapshot,
        shipping_rates (
          method_name
        )
      `)
      .eq('status', 'pending_payment') // 關鍵修改：查詢待付款訂單以供備貨
      .order('order_date', { ascending: true }) // 按下單時間排序，先來的先處理

    // 處理查詢錯誤
    if (error) {
      console.error('查詢訂單時發生錯誤:', error)
      throw error
    }

    // 【修改部分】直接將從 Supabase 獲取的原始訂單陣列回傳。
    // 這樣可以確保所有巢狀的 JSON 物件 (如 shipping_address_snapshot)
    // 都被完整地傳遞到前端，而不是只傳遞部分欄位。
    return new Response(JSON.stringify(orders), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    // 處理所有其他未預期的錯誤
    console.error('未預期的錯誤:', error.message)
    return new Response(JSON.stringify({ error: '伺服器內部錯誤' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})