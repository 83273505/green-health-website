// 檔案路徑: supabase/functions/get-paid-orders/index.ts
// ----------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ----------------------------------------------------

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

console.log(`函式 "get-paid-orders" (v2) 已啟動`)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 【修改部分】從請求 Body 中獲取 status 參數
    const { status } = await req.json()

    // 驗證 status 參數是否有效
    if (!status || !['pending_payment', 'paid'].includes(status)) {
      return new Response(JSON.stringify({ error: '缺少或無效的 status 參數' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    
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

    // 【新增部分】如果是 'paid' 狀態，只撈出還沒填寫物流單號的訂單
    if (status === 'paid') {
      query = query.is('shipping_tracking_code', null)
    }

    // 執行查詢
    const { data: orders, error } = await query.order('order_date', { ascending: true })

    if (error) {
      console.error(`查詢 status=${status} 的訂單時發生錯誤:`, error)
      throw error
    }
    
    return new Response(JSON.stringify(orders), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('未預期的錯誤:', error.message)
    return new Response(JSON.stringify({ error: '伺服器內部錯誤' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})