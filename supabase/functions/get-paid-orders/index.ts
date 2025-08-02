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

    // 將查詢結果轉換為前端易於使用的格式
    const formattedOrders = orders.map(order => ({
      id: order.id,
      order_number: order.order_number,
      order_date: order.order_date,
      status: order.status,
      payment_status: order.payment_status,
      payment_reference: order.payment_reference,
      // 從快照中安全地獲取收件人姓名
      recipient_name: order.shipping_address_snapshot?.recipient_name || 'N/A',
      // 從關聯查詢中安全地獲取運送方式名稱
      shipping_method_name: order.shipping_rates?.method_name || '未指定',
    }))

    // 回傳成功的 JSON 響應
    return new Response(JSON.stringify(formattedOrders), {
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