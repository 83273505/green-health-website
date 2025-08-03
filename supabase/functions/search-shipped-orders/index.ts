// 檔案路徑: supabase/functions/search-shipped-orders/index.ts
// ----------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ----------------------------------------------------

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

console.log(`函式 "search-shipped-orders" 已啟動`)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const params = await req.json()
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 建立基礎查詢，目標是已出貨的訂單
    let query = supabaseClient
      .from('orders')
      // 【修改部分】明確指定關聯查詢的細節
      .select(`
        id,
        order_number,
        order_date,
        shipped_at,
        shipping_tracking_code,
        carrier,
        shipping_address_snapshot,
        profiles:user_id(email, phone) 
      `)
      .eq('status', 'shipped')

    // 動態根據傳入的參數增加查詢條件
    if (params.orderNumber) {
      query = query.eq('order_number', params.orderNumber)
    }
    if (params.recipientName) {
      query = query.like('shipping_address_snapshot->>recipient_name', `%${params.recipientName}%`)
    }
    // 【修改部分】由於我們已經明確關聯了 profiles，可以直接對其欄位進行過濾
    if (params.email) {
      query = query.eq('profiles.email', params.email)
    }
    if (params.phone) {
      query = query.eq('profiles.phone', params.phone)
    }
    if (params.startDate) {
      query = query.gte('order_date', params.startDate)
    }
    if (params.endDate) {
      const endOfDay = new Date(params.endDate)
      endOfDay.setHours(23, 59, 59, 999)
      query = query.lte('order_date', endOfDay.toISOString())
    }

    // 執行查詢，按出貨時間倒序排列
    const { data: orders, error } = await query.order('shipped_at', { ascending: false }).limit(100)

    if (error) {
      console.error('查詢已出貨訂單時發生錯誤:', error)
      throw error
    }

    // 回傳前，將巢狀的 profiles 物件展平，方便前端使用
    const formattedOrders = orders.map(order => {
        const { profiles, ...restOfOrder } = order;
        return {
            ...restOfOrder,
            email: profiles?.email || null,
            phone: profiles?.phone || null
        };
    });

    return new Response(JSON.stringify(formattedOrders), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: '伺服器內部錯誤' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})