// 檔案路徑: supabase/functions/handle-consent-update/index.ts
// ----------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ----------------------------------------------------

// 【核心修正】從 deps.ts 引入依賴
import { createClient } from '../_shared/deps.ts'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  try {
    const { consent_type, new_status } = await req.json();
    if (!consent_type || typeof new_status !== 'boolean') {
      throw new Error('請提供 consent_type (string) 和 new_status (boolean)。');
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('缺少授權標頭(Authorization header)。');
    
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''));
    if (userError) throw userError;
    if (!user) throw new Error('使用者認證失敗。');

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('marketing_preferences')
      .eq('id', user.id)
      .single();
    if (profileError) throw profileError;

    const marketingPreferences = profile.marketing_preferences || {};
    const previous_status = marketingPreferences[consent_type] ?? null;

    const newPreferences = { ...marketingPreferences, [consent_type]: new_status };
    
    const { error: updateProfileError } = await supabaseAdmin
      .from('profiles')
      .update({ 
        marketing_preferences: newPreferences,
        preferences_last_updated_at: new Date().toISOString()
      })
      .eq('id', user.id);
    if (updateProfileError) throw updateProfileError;
    
    const { error: logError } = await supabaseAdmin
      .from('consent_logs')
      .insert({
        user_id: user.id,
        consent_type: consent_type,
        previous_status: previous_status,
        new_status: new_status,
        ip_address: req.headers.get('x-forwarded-for') ?? 'unknown'
      });
    if (logError) {
        console.error('寫入 consent_logs 失敗:', logError.message);
    }

    return new Response(JSON.stringify({ message: '偏好設定已成功更新。' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('[handle-consent-update] 函式內部錯誤:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})