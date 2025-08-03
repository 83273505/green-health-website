// 檔案路徑: supabase/functions/search-shipped-orders/index.ts
// ----------------------------------------------------
// 【此為最終完整檔案，可直接覆蓋】
// ----------------------------------------------------

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

console.log(`函式 "search-shipped-orders" (v-final) 已啟動`)

Deno.serve(async (req) => {
  // 處理 CORS 預檢請求
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 解析前端傳來的查詢參數
    const params = await req.json()
    
    // 建立具有最高權限的 Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 建立基礎查詢，目標是已出貨的訂單
    let query = supabaseClient
      .from('orders')
      // 【核心修改】使用最簡潔的關聯查詢語法
      // 因為已建立外鍵，Supabase 現在能自動推斷 orders -> profiles 的關係
      .select(`
        id,
        order_number,
        order_date,
        shipped_at,
        shipping_tracking_code,
        carrier,
        shipping_address_snapshot,
        profiles (
          email,
          phone
        )
      `)
      .eq('status', 'shipped')

    // 動態根據傳入的參數增加查詢條件
    if (params.orderNumber) {
      query = query.eq('order_number', params.orderNumber)
    }
    if (params.recipientName) {
      // ->> 運算子用於查詢 JSONB 欄位中的文字值
      query = query.like('shipping_address_snapshot->>recipient_name', `%${params.recipientName}%`)
    }
    // 【核心修改】直接對關聯表的欄位進行過濾
    // Supabase 要求對關聯表過濾時，使用 'foreign_table.column' 的格式
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

    // 執行查詢，按出貨時間倒序排列，最多回傳 100 筆
    const { data: orders, error } = await query.order('shipped_at', { ascending: false }).limit(100)

    if (error) {
      console.error('查詢已出貨訂單時發生錯誤:', error)
      throw error
    }
    
    // 【修改部分】將巢狀的 profiles 物件展平，方便前端直接使用 order.email
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