// ==============================================================================
// 檔案路徑: supabase/functions/get-or-create-cart/index.ts
// 版本: v49.0 (正確讀取匿名使用者 session)
// 說明: 正確處理前端建立的匿名使用者 session，不自行建立使用者
// ==============================================================================

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';

const FUNCTION_NAME = 'get-or-create-cart';
const FUNCTION_VERSION = 'v49.0';

function log(level: string, message: string, data?: any) {
    const timestamp = new Date().toISOString();
    console.log(JSON.stringify({
        timestamp,
        level,
        function: FUNCTION_NAME,
        version: FUNCTION_VERSION,
        message,
        data
    }));
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const startTime = Date.now();
    log('INFO', '函式開始執行');

    try {
        // 檢查環境變數
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
        
        if (!supabaseUrl || !supabaseAnonKey) {
            throw new Error(`環境變數缺失: URL=${!!supabaseUrl}, ANON_KEY=${!!supabaseAnonKey}`);
        }

        // 檢查 Authorization header
        const authHeader = req.headers.get('Authorization');
        log('INFO', '檢查請求標頭', { 
            hasAuthHeader: !!authHeader,
            authPrefix: authHeader ? authHeader.substring(0, 20) + '...' : 'none'
        });

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new Error('缺少有效的 Authorization header');
        }

        // 建立 Supabase 客戶端，使用前端傳來的 session token
        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
            global: {
                headers: { Authorization: authHeader }
            }
        });

        log('INFO', '嘗試驗證使用者 session');

        // 驗證使用者 session（這裡應該能讀取到前端建立的匿名使用者）
        const { data: { user }, error: userError } = await supabase.auth.getUser();

        if (userError) {
            log('ERROR', 'session 驗證失敗', { 
                error: userError.message,
                code: userError.status 
            });
            throw new Error(`Session 驗證失敗: ${userError.message}`);
        }

        if (!user) {
            log('ERROR', 'session 中沒有使用者資訊');
            throw new Error('Session 有效但沒有使用者資訊');
        }

        log('INFO', '成功驗證使用者 session', { 
            userId: user.id.substring(0, 8) + '...',
            isAnonymous: user.is_anonymous,
            email: user.email || 'anonymous'
        });

        // 查詢現有的活躍購物車
        log('INFO', '查詢現有購物車');
        const { data: existingCart, error: cartError } = await supabase
            .from('carts')
            .select('id, access_token')
            .eq('user_id', user.id)
            .eq('status', 'active')
            .maybeSingle();

        if (cartError) {
            log('ERROR', '查詢購物車時發生錯誤', cartError);
            throw new Error(`查詢購物車失敗: ${cartError.message} (${cartError.code})`);
        }

        if (existingCart) {
            log('INFO', '找到現有購物車', { 
                cartId: existingCart.id,
                userId: user.id.substring(0, 8) + '...'
            });
            
            return new Response(JSON.stringify({
                cartId: existingCart.id,
                cart_access_token: existingCart.access_token,
                debug: { 
                    executionTime: Date.now() - startTime, 
                    found: 'existing',
                    userType: user.is_anonymous ? 'anonymous' : 'registered'
                }
            }), { 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            });
        }

        // 為使用者建立新購物車
        log('INFO', '為使用者建立新購物車', { 
            userId: user.id.substring(0, 8) + '...',
            isAnonymous: user.is_anonymous 
        });
        
        const { data: newCart, error: createError } = await supabase
            .from('carts')
            .insert({
                user_id: user.id, // 使用從 session 中獲取的 user.id
                status: 'active'
            })
            .select('id, access_token')
            .single();

        if (createError) {
            log('ERROR', '建立購物車失敗', {
                error: createError.message,
                code: createError.code,
                details: createError.details,
                hint: createError.hint,
                userId: user.id.substring(0, 8) + '...'
            });

            // 如果是外鍵約束錯誤，提供更詳細的診斷資訊
            if (createError.code === '23503') {
                log('WARN', '外鍵約束錯誤 - 使用者可能不存在於 auth.users 表中', {
                    userId: user.id,
                    isAnonymous: user.is_anonymous,
                    userFromSession: !!user
                });
            }

            throw new Error(`建立購物車失敗: ${createError.message} (${createError.code})`);
        }

        if (!newCart) {
            throw new Error('建立購物車成功但未返回資料');
        }

        log('INFO', '成功建立新購物車', { 
            cartId: newCart.id,
            userId: user.id.substring(0, 8) + '...',
            executionTime: Date.now() - startTime
        });
        
        return new Response(JSON.stringify({
            cartId: newCart.id,
            cart_access_token: newCart.access_token,
            debug: { 
                executionTime: Date.now() - startTime, 
                found: 'created',
                userType: user.is_anonymous ? 'anonymous' : 'registered'
            }
        }), { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });

    } catch (error) {
        const errorDetails = {
            message: error.message,
            name: error.name,
            stack: error.stack,
            executionTime: Date.now() - startTime
        };
        
        log('CRITICAL', '函式執行失敗', errorDetails);
        
        return new Response(JSON.stringify({ 
            error: '無法初始化購物車',
            message: error.message,
            debug: errorDetails,
            timestamp: new Date().toISOString()
        }), { 
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});