// 档案路径: supabase/functions/_shared/cors.ts

// 定义所有 Edge Function 共用的 CORS 标头
// 'Access-Control-Allow-Origin': '*' 允许来自任何网域的请求
// 'Access-Control-Allow-Headers': 定义允许客户端在请求中包含哪些标头
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};