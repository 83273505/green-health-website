// ==============================================================================
// 檔案路徑: supabase/functions/get-or-create-cart/index.ts
// 版本: v46.0 (修正匿名使用者處理邏輯)
// 說明: 根據 Supabase 官方文檔修正匿名使用者處理邏輯
// ==============================================================================

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import LoggingService from '../_shared/services/loggingService.ts';

const FUNCTION_NAME = 'get-or-create-cart';
const FUNCTION_VERSION = 'v46.0';

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const logger = new LoggingService(FUNCTION_NAME, FUNCTION_VERSION);
    const correlationId = logger.generateCorrelationId();

    try {
        // 使用 anon key 初始化客戶端，讓它能正確處理匿名使用者
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_ANON_KEY')!, // 改用 anon key
            {
                global: {
                    headers: {
                        Authorization: req.headers.get('Authorization') ?? ''
                    }
                }
            }
        );

        // 步驟 1: 從請求獲取使用者 session
        const { data: { user }, error: userError } = await supabase.auth.getUser();

        if (userError || !user) {
            logger.error('無法獲取使用者資訊', correlationId, { error: userError });
            throw new Error('使用者 session 無效或不存在');
        }

        logger.info('成功獲取使用者資訊', correlationId, { 
            userId: user.id, 
            isAnonymous: user.is_anonymous 
        });

        // 步驟 2: 檢查是否已有活躍購物車
        const { data: existingCart, error: cartError } = await supabase
            .from('carts')
            .select('id, access_token')
            .eq('user_id', user.id)
            .eq('status', 'active')
            .maybeSingle();

        if (cartError) {
            logger.error('查詢現有購物車時發生錯誤', correlationId, cartError);
            throw cartError;
        }

        if (existingCart) {
            logger.info('找到現有活躍購物車', correlationId, { 
                cartId: existingCart.id, 
                userId: user.id 
            });
            
            return new Response(JSON.stringify({
                cartId: existingCart.id,
                cart_access_token: existingCart.access_token,
                token: req.headers.get('Authorization')?.replace('Bearer ', '')
            }), { 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            });
        }

        // 步驟 3: 建立新購物車
        // 注意：匿名使用者的 user.id 在 auth.users 表中是真實存在的
        logger.info('為使用者建立新購物車', correlationId, { 
            userId: user.id, 
            isAnonymous: user.is_anonymous 
        });
        
        const { data: newCart, error: createError } = await supabase
            .from('carts')
            .insert({
                user_id: user.id, // 匿名使用者的 ID 也是有效的 FK
                status: 'active'
            })
            .select('id, access_token')
            .single();

        if (createError) {
            logger.error('建立新購物車時發生錯誤', correlationId, createError);
            
            // 如果是外鍵約束錯誤，嘗試重新整理使用者 session
            if (createError.code === '23503') {
                logger.warn('檢測到外鍵約束錯誤，可能是 session 同步問題', correlationId);
                
                // 等待一小段時間讓資料庫同步
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // 再次嘗試建立購物車
                const { data: retryCart, error: retryError } = await supabase
                    .from('carts')
                    .insert({
                        user_id: user.id,
                        status: 'active'
                    })
                    .select('id, access_token')
                    .single();
                
                if (retryError) {
                    throw retryError;
                }
                
                logger.info('重試成功建立購物車', correlationId, { cartId: retryCart.id });
                return new Response(JSON.stringify({
                    cartId: retryCart.id,
                    cart_access_token: retryCart.access_token,
                    token: req.headers.get('Authorization')?.replace('Bearer ', '')
                }), { 
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
                });
            }
            
            throw createError;
        }

        logger.audit('成功建立新購物車', correlationId, { 
            cartId: newCart.id, 
            userId: user.id 
        });
        
        return new Response(JSON.stringify({
            cartId: newCart.id,
            cart_access_token: newCart.access_token,
            token: req.headers.get('Authorization')?.replace('Bearer ', '')
        }), { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });

    } catch (error) {
        logger.critical('get-or-create-cart 發生致命錯誤', correlationId, error);
        return new Response(JSON.stringify({ 
            error: '無法初始化購物車，請稍後再試。',
            details: error.message,
            correlationId
        }), { 
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});