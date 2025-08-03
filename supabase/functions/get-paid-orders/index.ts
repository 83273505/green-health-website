// 檔案路徑: supabase/functions/get-paid-orders/index.ts
// ----------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ----------------------------------------------------

// 【核心修正】從 import_map.json 引入依賴
import { createClient } from 'supabase-js'
import { corsHeaders } from '../_shared/cors.ts'

console.log(`函式 "get-paid-orders" (v2) 已啟動`)

Deno.serve(async (req) => {
  // 處理 CORS 預檢請求
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 從請求 Body 中獲取 status 參數
    const { status } = await req.json()

    // 驗證 status 參數是否有效
    if (!status || !['pending_payment', 'paid'].includes(status)) {
      return new Response(JSON.stringify({ error: '缺少或無效的 status 參數' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    
    // 建立一個具有最高權限的 Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 建立基礎查詢
    let query = supabaseClient
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
      .eq('status', status) // 使用傳入的 status 進行查詢

    // 如果是 'paid' 狀態，只撈出還沒填寫物流單號的訂單
    if (status === 'paid') {
      query = query.is('shipping_tracking_code', null)
    }

    // 執行查詢
    const { data: orders, error } = await query.order('order_date', { ascending: true })

    if (error) {
      console.error(`查詢 status=${status} 的訂單時發生錯誤:`, error)
      throw error
    }
    
    // 將查詢結果直接回傳
    return new Response(JSON.stringify(orders), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('[get-paid-orders] 未預期的錯誤:', error.message)
    return new Response(JSON.stringify({ error: '伺服器內部錯誤' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})