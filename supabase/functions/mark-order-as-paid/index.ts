// 檔案路徑: supabase/functions/mark-order-as-paid/index.ts
// ----------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ----------------------------------------------------

// 【核心修正】從 deps.ts 引入依賴
import { createClient } from '../_shared/deps.ts'
import { corsHeaders } from '../_shared/cors.ts'

console.log(`函式 "mark-order-as-paid" 已啟動`)

Deno.serve(async (req) => {
  // 處理 CORS 預檢請求
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 從請求 Body 中獲取所有需要的參數
    const { orderId, paymentMethod, paymentReference } = await req.json()

    // 參數驗證
    if (!orderId || !paymentMethod) {
      return new Response(JSON.stringify({ error: '缺少 orderId 或 paymentMethod 參數' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    
    // 建立具有最高權限的 Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 在執行更新前，先確認訂單是否存在且狀態正確
    const { data: orderToCheck, error: checkError } = await supabaseClient
      .from('orders')
      .select('status')
      .eq('id', orderId)
      .single()

    if (checkError || !orderToCheck) {
        return new Response(JSON.stringify({ error: '找不到指定的訂單' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }})
    }
    
    if (orderToCheck.status !== 'pending_payment') {
        return new Response(JSON.stringify({ error: '此訂單狀態不是待付款，無法確認收款' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }})
    }

    // 執行更新操作
    const { data: updatedOrder, error: updateError } = await supabaseClient
      .from('orders')
      .update({
        status: 'paid',
        payment_status: 'paid',
        payment_method: paymentMethod, // 更新付款方式
        payment_reference: paymentReference || null, // 更新付款參考，如果為空則存為 null
      })
      .eq('id', orderId)
      .select()
      .single()

    if (updateError) {
      console.error('更新訂單為已付款時發生錯誤:', updateError)
      throw updateError
    }

    return new Response(JSON.stringify({ success: true, updatedOrder }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('[mark-order-as-paid] 未預期的錯誤:', error.message)
    return new Response(JSON.stringify({ error: '伺服器內部錯誤' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})