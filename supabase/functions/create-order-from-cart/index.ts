// 檔案路徑: supabase/functions/create-order-from-cart/index.ts (Placeholder Version)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  try {
    // 真正的逻辑将在这里实现
    // 目前，我们只回传一个模拟的成功讯息
    const mockOrderNumber = `GH-${Date.now()}`;
    return new Response(JSON.stringify({ orderNumber: mockOrderNumber }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})