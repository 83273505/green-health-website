// 檔案路徑: supabase/functions/search-shipped-orders/index.ts
// ----------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ----------------------------------------------------

// 【核心修正】從 deps.ts 引入依賴
import { createClient } from '../_shared/deps.ts'
import { corsHeaders } from '../_shared/cors.ts'

console.log(`函式 "search-shipped-orders" (v3-final) 已啟動`)

Deno.serve(async (req) => {
  // 處理 CORS 預檢請求
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const params = await req.json()
    
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
        shipped_at,
        shipping_tracking_code,
        carrier,
        subtotal_amount,
        shipping_fee,
        coupon_discount,
        total_amount,
        shipping_address_snapshot,
        payment_method,
        payment_status,
        payment_reference,
        profiles (
          email,
          phone
        ),
        order_items (
          quantity,
          price_at_order,
          product_variants (
            name,
            sku,
            products (
              name
            )
          )
        )
      `)
      .eq('status', 'shipped')

    // 根據前端傳來的參數，動態增加篩選條件
    if (params.orderNumber) {
      query = query.eq('order_number', params.orderNumber)
    }
    if (params.recipientName) {
      // 使用 ->> 操作符來查詢 JSONB 欄位中的文字
      query = query.like('shipping_address_snapshot->>recipient_name', `%${params.recipientName}%`)
    }
    if (params.email) {
      query = query.eq('profiles.email', params.email)
    }
    if (params.phone) {
      query = query.eq('profiles.phone', params.phone)
    }
    if (params.startDate) {
      const startOfDay = new Date(params.startDate)
      startOfDay.setHours(0, 0, 0, 0)
      query = query.gte('shipped_at', startOfDay.toISOString())
    }
    if (params.endDate) {
      const endOfDay = new Date(params.endDate)
      endOfDay.setHours(23, 59, 59, 999)
      query = query.lte('shipped_at', endOfDay.toISOString())
    }

    // 執行查詢，按出貨時間倒序排列，最多返回 100 筆
    const { data: orders, error } = await query.order('shipped_at', { ascending: false }).limit(100)

    if (error) {
      console.error('查詢已出貨訂單時發生錯誤:', error)
      throw error
    }
    
    // 將巢狀的 profiles 物件展平，方便前端直接使用 order.email
    const formattedOrders = orders.map(order => {
        // 檢查 profiles 是否存在且不為 null
        const profilesData = Array.isArray(order.profiles) ? order.profiles[0] : order.profiles;
        const { profiles, ...restOfOrder } = order;
        return {
            ...restOfOrder,
            profiles: profilesData, // 確保 profiles 欄位仍然存在（如果前端其他地方需要）
            email: profilesData?.email || null,
            phone: profilesData?.phone || null
        };
    });

    return new Response(JSON.stringify(formattedOrders), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('[search-shipped-orders] 函式錯誤:', error.message);
    return new Response(JSON.stringify({ error: '伺服器內部錯誤' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})