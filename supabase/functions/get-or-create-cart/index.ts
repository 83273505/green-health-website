// ==============================================================================
// 檔案路徑: supabase/functions/get-or-create-cart/index.ts
// 版本: v47.0 (診斷版本 - 詳細錯誤追蹤)
// 說明: 添加詳細的錯誤診斷和日誌，找出 500 錯誤的具體原因
// ==============================================================================

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';

const FUNCTION_NAME = 'get-or-create-cart';
const FUNCTION_VERSION = 'v47.0';

// 簡化版日誌函式，避免外部依賴問題
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
            throw new Error(`環境變數缺失: SUPABASE_URL=${!!supabaseUrl}, SUPABASE_ANON_KEY=${!!supabaseAnonKey}`);
        }

        log('INFO', '環境變數檢查通過');

        // 檢查授權標頭
        const authHeader = req.headers.get('Authorization');
        log('INFO', '請求標頭檢查', { 
            hasAuth: !!authHeader,
            authPrefix: authHeader?.substring(0, 10)
        });

        // 初始化 Supabase 客戶端
        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
            global: {
                headers: authHeader ? { Authorization: authHeader } : {}
            }
        });

        log('INFO', 'Supabase 客戶端初始化完成');

        // 步驟 1: 獲取使用者
        log('INFO', '開始獲取使用者資訊');
        const { data: { user }, error: userError } = await supabase.auth.getUser();

        if (userError) {
            log('ERROR', '獲取使用者時發生錯誤', userError);
            throw new Error(`獲取使用者失敗: ${userError.message}`);
        }

        if (!user) {
            log('ERROR', '使用者資訊為空');
            throw new Error('使用者 session 無效');
        }

        log('INFO', '成功獲取使用者資訊', { 
            userId: user.id.substring(0, 8) + '...', 
            isAnonymous: user.is_anonymous,
            email: user.email || 'anonymous'
        });

        // 步驟 2: 查詢現有購物車
        log('INFO', '開始查詢現有購物車');
        const { data: existingCart, error: cartError } = await supabase
            .from('carts')
            .select('id, access_token')
            .eq('user_id', user.id)
            .eq('status', 'active')
            .maybeSingle();

        if (cartError) {
            log('ERROR', '查詢現有購物車失敗', cartError);
            throw new Error(`查詢購物車失敗: ${cartError.message} (${cartError.code})`);
        }

        if (existingCart) {
            log('INFO', '找到現有購物車', { cartId: existingCart.id });
            return new Response(JSON.stringify({
                cartId: existingCart.id,
                cart_access_token: existingCart.access_token,
                token: authHeader?.replace('Bearer ', ''),
                debug: { executionTime: Date.now() - startTime, found: 'existing' }
            }), { 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            });
        }

        // 步驟 3: 建立新購物車
        log('INFO', '開始建立新購物車', { userId: user.id.substring(0, 8) + '...' });
        
        const insertData = {
            user_id: user.id,
            status: 'active'
        };
        
        log('INFO', '準備插入資料', { hasUserId: !!insertData.user_id });
        
        const { data: newCart, error: createError } = await supabase
            .from('carts')
            .insert(insertData)
            .select('id, access_token')
            .single();

        if (createError) {
            log('ERROR', '建立購物車失敗', {
                error: createError,
                code: createError.code,
                message: createError.message,
                details: createError.details,
                hint: createError.hint
            });
            
            // 特別處理外鍵約束錯誤
            if (createError.code === '23503') {
                log('WARN', '檢測到外鍵約束錯誤，嘗試驗證使用者是否存在於 auth.users 表中');
                
                // 使用 service role 檢查使用者是否確實存在
                const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
                if (serviceRoleKey) {
                    const adminClient = createClient(supabaseUrl, serviceRoleKey);
                    const { data: adminUser, error: adminError } = await adminClient.auth.admin.getUserById(user.id);
                    
                    log('INFO', '管理員檢查使用者結果', {
                        exists: !!adminUser?.user,
                        error: adminError?.message,
                        userIdMatch: adminUser?.user?.id === user.id
                    });
                }
            }
            
            throw new Error(`建立購物車失敗: ${createError.message} (${createError.code})`);
        }

        if (!newCart) {
            log('ERROR', '建立購物車成功但未返回資料');
            throw new Error('建立購物車成功但未返回資料');
        }

        log('INFO', '成功建立新購物車', { 
            cartId: newCart.id,
            executionTime: Date.now() - startTime
        });
        
        return new Response(JSON.stringify({
            cartId: newCart.id,
            cart_access_token: newCart.access_token,
            token: authHeader?.replace('Bearer ', ''),
            debug: { executionTime: Date.now() - startTime, found: 'created' }
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