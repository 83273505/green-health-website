// 檔案路徑: supabase/functions/handle-consent-update/index.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  // 處理 CORS 預檢請求
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 從請求 body 中獲取必要的參數
    const { consent_type, new_status } = await req.json()
    if (!consent_type || typeof new_status !== 'boolean') {
      throw new Error('請提供 consent_type (string) 和 new_status (boolean)。')
    }

    // 建立一個擁有管理員權限的 Supabase client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 從用戶的認證 token 中安全地獲取 user 物件
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(
      req.headers.get('Authorization')!.replace('Bearer ', '')
    )
    if (userError) throw userError
    if (!user) throw new Error('用戶認證失敗。')

    // 從 profiles 表中讀取用戶目前的行銷偏好設定
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('marketing_preferences')
      .eq('id', user.id)
      .single()

    if (profileError) throw profileError

    // 獲取舊的狀態值
    const marketingPreferences = profile.marketing_preferences || {}
    const previous_status = marketingPreferences[consent_type] ?? null;

    // 更新 profiles 表中的 marketing_preferences JSONB 物件
    const newPreferences = { ...marketingPreferences, [consent_type]: new_status }
    
    const { error: updateProfileError } = await supabaseAdmin
      .from('profiles')
      .update({ 
        marketing_preferences: newPreferences,
        preferences_last_updated_at: new Date().toISOString() // 同時更新時間戳
      })
      .eq('id', user.id)
    
    if (updateProfileError) throw updateProfileError
    
    // 將這次變更寫入 consent_logs 表
    const { error: logError } = await supabaseAdmin
      .from('consent_logs')
      .insert({
        user_id: user.id,
        consent_type: consent_type,
        previous_status: previous_status,
        new_status: new_status,
        ip_address: req.headers.get('x-forwarded-for') ?? 'unknown' // 獲取用戶真實 IP
      })

    if (logError) throw logError

    // 返回成功響應
    return new Response(JSON.stringify({ message: '偏好設定已成功更新' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    // 返回統一格式的錯誤響應
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})