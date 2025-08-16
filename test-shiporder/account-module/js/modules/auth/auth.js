// ==============================================================================
// 檔案路徑: account-module/js/modules/auth/auth.js
// 版本: v33.0 - 統一流程與體驗終局
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Authentication Module (身份驗證模組)
 * @description 處理所有使用者身份驗證相關的邏輯，由 app.js 調度。
 */

import { supabase } from '../../core/supabaseClient.js';
import { showNotification, setFormSubmitting } from '../../core/utils.js';
import { ROUTES } from '../../core/constants.js';
import { CartService } from '../../services/CartService.js';

// --- 私有函式 ---

function initLoginPage() {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const googleLoginButton = document.getElementById('google-login-button');
    const facebookLoginButton = document.getElementById('facebook-login-button');
    const termsConsentCheckbox = document.getElementById('terms-consent-checkbox');
    const tabs = document.querySelectorAll('.tab-link');
    const contents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(item => item.classList.remove('active'));
            contents.forEach(item => item.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(tab.dataset.tab).classList.add('active');
            showNotification('', 'info', 'auth-message');
        });
    });

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const client = await supabase;
            
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;
            
            if (!email || !password) {
                showNotification('請輸入完整的Email和密碼。', 'error', 'auth-message');
                return;
            }

            let mergeSuccessful = false;
            
            try {
                setFormSubmitting(loginForm, true, '登入中...');

                const { data, error } = await client.auth.signInWithPassword({ email, password });

                if (error) throw new Error(error.message);
                if (!data.user) throw new Error('登入成功但無法取得使用者資訊');

                const currentUserId = data.user.id;
                const anonymousUserId = localStorage.getItem('anonymous_user_id');

                if (anonymousUserId && anonymousUserId !== currentUserId) {
                    console.log(`🔗 [Email Login] 發現匿名購物車需要合併: ${anonymousUserId} -> ${currentUserId}`);
                    showNotification('正在為您合併訪客購物車資料...', 'info', 'auth-message');
                    
                    mergeSuccessful = await transferAnonymousUserData(anonymousUserId, currentUserId);
                    if (mergeSuccessful) {
                        sessionStorage.setItem('showMergeSuccessNotification', 'true');
                    }
                }

                localStorage.removeItem('anonymous_user_id');
                
                await CartService.forceReinit(client);

                const successMessage = mergeSuccessful ? 
                    '登入成功！已為您合併訪客購物車，正在導向...' : 
                    '登入成功！正在將您導向...';
                showNotification(successMessage, 'success', 'auth-message');
                
                setTimeout(() => {
                    const urlParams = new URLSearchParams(window.location.search);
                    const redirectTo = urlParams.get('redirect_to');
                    window.location.href = redirectTo || ROUTES.DASHBOARD;
                }, 1500);

            } catch (error) {
                console.error('❌ [Email Login] 登入過程發生錯誤:', error);
                showNotification('登入失敗：' + error.message, 'error', 'auth-message');
            } finally {
                setFormSubmitting(loginForm, false, '登入');
            }
        });
    }

    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const client = await supabase;
            if (!termsConsentCheckbox.checked) {
                return showNotification('請先勾選同意我們的服務條款與隱私權政策。', 'error', 'auth-message');
            }
            const email = document.getElementById('signup-email').value;
            const password = document.getElementById('signup-password').value;
            const passwordConfirm = document.getElementById('signup-password-confirm').value;
            if (password.length < 6) return showNotification('密碼長度至少需要6位數。', 'error', 'auth-message');
            if (password !== passwordConfirm) return showNotification('兩次輸入的密碼不一致。', 'error', 'auth-message');
            const { error } = await client.auth.signUp({ email, password });
            if (error) {
                showNotification('註冊失敗：' + error.message, 'error', 'auth-message');
            } else {
                showNotification('註冊成功！驗證信已寄出，請至您的信箱點選連結以啟用帳號。', 'success', 'auth-message');
            }
        });
    }

    async function socialSignIn(provider) {
        if (!termsConsentCheckbox.checked) {
            return showNotification('請先勾選同意我們的服務條款與隱私權政策。', 'error', 'auth-message');
        }
        const client = await supabase;
        const redirectToUrl = new URL(ROUTES.AUTH_CALLBACK, window.location.origin);
        const anonymousUserId = localStorage.getItem('anonymous_user_id');
        if (anonymousUserId) {
            redirectToUrl.searchParams.set('anonymous_uid', anonymousUserId);
        }
        
        const urlParams = new URLSearchParams(window.location.search);
        const redirectTo = urlParams.get('redirect_to');
        if (redirectTo) {
            redirectToUrl.searchParams.set('redirect_to', redirectTo);
        }

        client.auth.signInWithOAuth({
            provider: provider,
            options: { 
                redirectTo: redirectToUrl.href
            }
        });
    }

    if (googleLoginButton) googleLoginButton.addEventListener('click', () => socialSignIn('google'));
    if (facebookLoginButton) facebookLoginButton.addEventListener('click', () => socialSignIn('facebook'));
}

function initAuthCallbackPage() {
    supabase.then(client => {
        client.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN' || (event === 'INITIAL_SESSION' && session)) {
                const currentUserId = session.user.id;
                const urlParams = new URLSearchParams(window.location.search);
                const anonymousUserId = urlParams.get('anonymous_uid');
                const redirectTo = urlParams.get('redirect_to');
                let mergeHappened = false;

                if (anonymousUserId && anonymousUserId !== currentUserId) {
                    try {
                        const mergeSuccess = await transferAnonymousUserData(anonymousUserId, currentUserId);
                        if (mergeSuccess) {
                            mergeHappened = true;
                        }
                    } catch(error) {
                        console.error('⚠️ [AuthCallback] 購物車合併過程中發生錯誤:', error);
                    }
                }

                localStorage.removeItem('anonymous_user_id');
                await CartService.forceReinit(client);
                if (mergeHappened) {
                    sessionStorage.setItem('showMergeSuccessNotification', 'true');
                }
                
                window.location.replace(redirectTo || ROUTES.DASHBOARD);
            } else if (event === 'INITIAL_SESSION' && !session) {
                 setTimeout(() => {
                    window.location.replace(ROUTES.LOGIN);
                 }, 1000);
            }
        });
    });
}

function initForgotPasswordPage() {
    const resetPasswordForm = document.getElementById('reset-password-form');
    if(resetPasswordForm) {
        resetPasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const client = await supabase;
            const email = document.getElementById('email-input').value;
            showNotification('處理中...', 'info', 'auth-message');
            const redirectToUrl = new URL(ROUTES.UPDATE_PASSWORD, window.location.origin).href;
            const { error } = await client.auth.resetPasswordForEmail(email, {
                redirectTo: redirectToUrl,
            });
            if (error) {
                showNotification('發送失敗：' + error.message, 'error', 'auth-message');
            } else {
                showNotification('密碼重設連結已成功發送！請至您的信箱查看。', 'success', 'auth-message');
            }
        });
    }
}

function initUpdatePasswordPage() {
    const updatePasswordForm = document.getElementById('update-password-form');
    if (!updatePasswordForm) { return; }
    updatePasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const client = await supabase;
        const newPassword = document.getElementById('password-input').value;
        const newPasswordConfirm = document.getElementById('password-confirm-input').value;
        if (newPassword.length < 6) {
            return showNotification('密碼長度至少需要6位數。', 'error', 'auth-message');
        }
        if (newPassword !== newPasswordConfirm) {
            return showNotification('兩次輸入的密碼不一致。', 'error', 'auth-message');
        }
        const { error } = await client.auth.updateUser({ password: newPassword });
        if (error) {
            showNotification('密碼更新失敗：' + error.message, 'error', 'auth-message');
        } else {
            showNotification('密碼更新成功！3秒後將自動將您導向登入頁。', 'success', 'auth-message');
            setTimeout(() => {
                window.location.href = ROUTES.LOGIN;
            }, 3000);
        }
    });
    supabase.then(client => {
        client.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' && session) {
                window.location.replace(ROUTES.DASHBOARD);
            }
        });
    });
}

async function transferAnonymousUserData(anonymousUserId, currentUserId) {
    console.log(`🔄 [Transfer] 開始轉移匿名使用者 (${anonymousUserId}) 的資料...`);
    try {
        const client = await supabase;
        const { data: anonymousCart, error: fetchError } = await client
            .from('carts')
            .select(`id, cart_items(*)`)
            .eq('user_id', anonymousUserId)
            .eq('status', 'active')
            .maybeSingle();

        if (fetchError) throw new Error(`查詢匿名購物車失敗: ${fetchError.message}`);

        if (!anonymousCart || !anonymousCart.cart_items || !anonymousCart.cart_items.length === 0) {
            console.log('✅ [Transfer] 匿名使用者沒有購物車資料，無需轉移。');
            await cleanupAnonymousUserData(anonymousUserId, null);
            return false;
        }

        let { data: currentCart } = await client
            .from('carts')
            .select(`id, cart_items(product_variant_id, quantity)`)
            .eq('user_id', currentUserId)
            .eq('status', 'active')
            .maybeSingle();

        if (!currentCart) {
            const { data: newCart, error: createError } = await client
                .from('carts').insert({ user_id: currentUserId, status: 'active' }).select('id').single();
            if (createError) throw createError;
            currentCart = { id: newCart.id, cart_items: [] };
        }
        
        const targetCartId = currentCart.id;
        const sourceItems = anonymousCart.cart_items;
        const existingItemsMap = new Map((currentCart.cart_items || []).map(item => [item.product_variant_id, item.quantity]));
        const itemsToInsert = [];
        const itemsToUpdate = [];

        for (const item of sourceItems) {
            if (existingItemsMap.has(item.product_variant_id)) {
                itemsToUpdate.push({
                    product_variant_id: item.product_variant_id,
                    new_quantity: existingItemsMap.get(item.product_variant_id) + item.quantity
                });
            } else {
                itemsToInsert.push({
                    cart_id: targetCartId,
                    product_variant_id: item.product_variant_id,
                    quantity: item.quantity,
                    price_snapshot: item.price_snapshot ?? 0 
                });
            }
        }
        
        if (itemsToInsert.length > 0) {
            await client.from('cart_items').insert(itemsToInsert).throwOnError();
        }
        
        for (const item of itemsToUpdate) {
             await client.from('cart_items')
                .update({ quantity: item.new_quantity })
                .eq('cart_id', targetCartId)
                .eq('product_variant_id', item.product_variant_id)
                .throwOnError();
        }

        await cleanupAnonymousUserData(anonymousUserId, anonymousCart.id);
        return true;
    } catch (error) {
        console.error('⚠️ [Transfer] 資料轉移過程中發生錯誤:', error);
        return false;
    }
}

async function cleanupAnonymousUserData(anonymousUserId, anonymousCartId) {
    try {
        const client = await supabase;
        if (anonymousCartId) {
            await client.from('cart_items').delete().eq('cart_id', anonymousCartId);
            await client.from('carts').delete().eq('id', anonymousCartId);
        }
    } catch (error) {
        console.warn('[Cleanup] 清理匿名使用者資料時發生未知錯誤:', error.message);
    }
}

export function init(pageId) {
    switch(pageId) {
        case 'auth-login':
        case 'auth-callback':
        case 'auth-forgot-password':
        case 'auth-update-password':
            initLoginPage();
            break;
    }
}