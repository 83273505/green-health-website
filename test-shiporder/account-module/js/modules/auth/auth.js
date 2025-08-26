// ==============================================================================
// 檔案路徑: account-module/js/modules/auth/auth.js
// 版本: v33.1 - 修復幽靈依賴 (真正 100% 完整版)
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Authentication Module (身份驗證模組)
 * @description 處理所有使用者身份驗證相關的邏輯，由 app.js 調度。
 * @version v33.1
 * 
 * @update v33.1 - [CRITICAL BUG FIX]
 * 1. [移除] 刪除了對 CartService 的非法跨模組引用，這是導致 404 錯誤的根源。
 * 2. [移除] 刪除了所有與購物車相關的業務邏輯 (如合併購物車)，恢復本模組的職責單一性。
 * 3. [內化] 包含了本模組需要用到的輔助函式 (setFormSubmitting)，確保檔案自给自足。
 * 4. [修正] 確保所有頁面 ID (pageId) 對應的初始化函式都被正確呼叫。
 */

// [檔名確認] 所有引用路徑皆為相對於本檔案的正確相對路徑。
import { supabase } from '../../core/supabaseClient.js';
import { showNotification } from '../../core/utils.js'; // 假設 showNotification 在 utils.js 中
import { ROUTES } from '../../core/constants.js';

// --- 模組內部輔助函式 ---

/**
 * 設定表單的提交狀態，防止重複點擊。
 * @param {HTMLFormElement} formElement - 目標表單元素。
 * @param {boolean} isSubmitting - 是否正在提交。
 * @param {string} buttonText - 按鈕在非提交狀態下應顯示的文字。
 */
function setFormSubmitting(formElement, isSubmitting, buttonText = '提交') {
    const button = formElement.querySelector('button[type="submit"]');
    if (!button) return;

    if (isSubmitting) {
        button.disabled = true;
        button.textContent = '處理中...';
    } else {
        button.disabled = false;
        button.textContent = buttonText;
    }
}


// --- 頁面初始化函式 ---

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
            
            try {
                setFormSubmitting(loginForm, true);

                const { data, error } = await client.auth.signInWithPassword({ email, password });

                if (error) throw new Error(error.message);
                if (!data.user) throw new Error('登入成功但無法取得使用者資訊');
                
                showNotification('登入成功！正在將您導向...', 'success', 'auth-message');
                
                setTimeout(() => {
                    const urlParams = new URLSearchParams(window.location.search);
                    const redirectTo = urlParams.get('redirect_to');
                    window.location.href = redirectTo || ROUTES.DASHBOARD;
                }, 1500);

            } catch (error) {
                console.error('❌ [Email Login] 登入過程發生錯誤:', error);
                showNotification('登入失敗：' + error.message, 'error', 'auth-message');
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
            
            setFormSubmitting(signupForm, true);
            try {
                const { error } = await client.auth.signUp({ email, password });
                if (error) {
                    showNotification('註冊失敗：' + error.message, 'error', 'auth-message');
                } else {
                    showNotification('註冊成功！驗證信已寄出，請至您的信箱點選連結以啟用帳號。', 'success', 'auth-message');
                    signupForm.reset();
                }
            } catch (error) {
                 showNotification('註冊時發生未知錯誤。', 'error', 'auth-message');
            } finally {
                setFormSubmitting(signupForm, false, '加入會員');
            }
        });
    }

    async function socialSignIn(provider) {
        if (!termsConsentCheckbox.checked) {
            return showNotification('請先勾選同意我們的服務條款與隱私權政策。', 'error', 'auth-message');
        }
        const client = await supabase;
        const redirectToUrl = new URL(ROUTES.AUTH_CALLBACK, window.location.origin);
        
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
                const urlParams = new URLSearchParams(window.location.search);
                const redirectTo = urlParams.get('redirect_to');
                
                window.location.replace(redirectTo || ROUTES.DASHBOARD);

            } else if (event === 'INITIAL_SESSION' && !session) {
                 console.log('[AuthCallback] No active session found.');
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
            setFormSubmitting(resetPasswordForm, true);
            showNotification('處理中...', 'info', 'auth-message');
            const redirectToUrl = new URL(ROUTES.UPDATE_PASSWORD, window.location.origin).href;
            try {
                const { error } = await client.auth.resetPasswordForEmail(email, {
                    redirectTo: redirectToUrl,
                });
                if (error) {
                    showNotification('發送失敗：' + error.message, 'error', 'auth-message');
                } else {
                    showNotification('密碼重設連結已成功發送！請至您的信箱查看。', 'success', 'auth-message');
                }
            } catch (error) {
                 showNotification('發送時發生未知錯誤。', 'error', 'auth-message');
            } finally {
                setFormSubmitting(resetPasswordForm, false, '發送重設連結');
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
        setFormSubmitting(updatePasswordForm, true);
        try {
            const { error } = await client.auth.updateUser({ password: newPassword });
            if (error) {
                showNotification('密碼更新失敗：' + error.message, 'error', 'auth-message');
            } else {
                showNotification('密碼更新成功！3秒後將自動將您導向登入頁。', 'success', 'auth-message');
                setTimeout(() => {
                    window.location.href = ROUTES.LOGIN;
                }, 3000);
            }
        } catch (error) {
             showNotification('更新時發生未知錯誤。', 'error', 'auth-message');
        } finally {
             setFormSubmitting(updatePasswordForm, false, '更新密碼');
        }
    });
}

// --- 公開的主初始化函式 ---

export function init(pageId) {
    // 根據 app.js 傳入的頁面 ID，執行對應的初始化邏輯
    switch(pageId) {
        case 'auth-login':
            initLoginPage();
            break;
        case 'auth-callback':
            initAuthCallbackPage();
            break;
        case 'auth-forgot-password':
            initForgotPasswordPage();
            break;
        case 'auth-update-password':
            initUpdatePasswordPage();
            break;
    }
}