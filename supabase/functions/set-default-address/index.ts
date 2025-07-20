// 檔案路徑: supabase/functions/set-default-address/index.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  // 處理 CORS 預檢請求
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 從請求中獲取新的預設地址 ID
    const { addressId } = await req.json();
    if (!addressId) {
      throw new Error("Address ID is required.");
    }

    // 建立一個擁有管理員權限的 Supabase client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 從用戶的認證 token 中安全地獲取 user 物件
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(
      req.headers.get('Authorization')!.replace('Bearer ', '')
    );

    if (userError) throw userError;
    if (!user) throw new Error('User not found.');

    // 呼叫我們在資料庫中建立的 PostgreSQL 函式
    const { error: rpcError } = await supabaseAdmin.rpc('set_default_address_atomic', {
      p_user_id: user.id,
      p_address_id: addressId
    });

    if (rpcError) throw rpcError;

    // 返回成功響應
    return new Response(JSON.stringify({ message: 'Default address updated successfully' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    // 返回統一格式的錯誤響應
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});