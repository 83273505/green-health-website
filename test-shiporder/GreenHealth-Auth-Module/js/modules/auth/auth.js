// 檔案路徑: js/modules/auth/auth.js

/**
 * @file Authentication Module (身份驗證模組)
 * @description 處理所有使用者身份驗證相關的邏輯，由 app.js 調度。
 */

// ==========================================================
// 【最终修正区域】
// ==========================================================

// 引用路径已更新为正确的 "../../core/..." 格式
import { supabase } from '../../core/supabaseClient.js';
import { showNotification } from '../../core/utils.js';
import { ROUTES } from '../../core/constants.js';

// ==========================================================

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
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) showNotification('登入失敗：' + error.message, 'error', 'auth-message');
        });
    }

    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!termsConsentCheckbox.checked) {
                return showNotification('請先勾選同意我們的服務條款與隱私權政策。', 'error', 'auth-message');
            }
            const email = document.getElementById('signup-email').value;
            const password = document.getElementById('signup-password').value;
            const passwordConfirm = document.getElementById('signup-password-confirm').value;
            if (password.length < 6) return showNotification('密碼長度至少需要6位數。', 'error', 'auth-message');
            if (password !== passwordConfirm) return showNotification('兩次輸入的密碼不一致。', 'error', 'auth-message');
            const { error } = await supabase.auth.signUp({ email, password });
            if (error) {
                showNotification('註冊失敗：' + error.message, 'error', 'auth-message');
            } else {
                showNotification('註冊成功！驗證信已寄出，請至您的信箱點選連結以啟用帳號。', 'success', 'auth-message');
            }
        });
    }

    function socialSignIn(provider) {
        if (!termsConsentCheckbox.checked) {
            return showNotification('請先勾選同意我們的服務條款與隱私權政策。', 'error', 'auth-message');
        }
        supabase.auth.signInWithOAuth({
            provider: provider,
            options: { 
                redirectTo: new URL(ROUTES.AUTH_CALLBACK, window.location.origin).href 
            }
        });
    }

    if (googleLoginButton) googleLoginButton.addEventListener('click', () => socialSignIn('google'));
    if (facebookLoginButton) facebookLoginButton.addEventListener('click', () => socialSignIn('facebook'));

    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN') {
             window.location.href = ROUTES.DASHBOARD;
        }
    });
}

function initAuthCallbackPage() {
    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' || (event === 'INITIAL_SESSION' && session)) {
             window.location.replace(ROUTES.DASHBOARD);
        } else if (event === 'INITIAL_SESSION' && !session) {
             setTimeout(() => {
                window.location.replace(ROUTES.LOGIN);
             }, 1000);
        }
    });
}

function initForgotPasswordPage() {
    const resetPasswordForm = document.getElementById('reset-password-form');
    if(resetPasswordForm) {
        resetPasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email-input').value;
            showNotification('處理中...', 'info', 'auth-message');
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: new URL(ROUTES.UPDATE_PASSWORD, window.location.origin).href,
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
    supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === "PASSWORD_RECOVERY") {
            const updatePasswordForm = document.getElementById('update-password-form');
            if(updatePasswordForm) {
                updatePasswordForm.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const newPassword = document.getElementById('password-input').value;
                    const newPasswordConfirm = document.getElementById('password-confirm-input').value;
                    if (newPassword.length < 6) return showNotification('密碼長度至少需要6位數。', 'error', 'auth-message');
                    if (newPassword !== newPasswordConfirm) return showNotification('兩次輸入的密碼不一致。', 'error', 'auth-message');
                    const { error } = await supabase.auth.updateUser({ password: newPassword });
                    if (error) {
                        showNotification('密碼更新失敗：' + error.message, 'error', 'auth-message');
                    } else {
                        showNotification('密碼更新成功！3秒後將自動將您導向登入頁。', 'success', 'auth-message');
                        setTimeout(() => {
                            window.location.href = ROUTES.LOGIN;
                        }, 3000);
                    }
                });
            }
        }
    });
}

/**
 * 由 app.js 呼叫的主初始化函式
 * @param {string} pageId - 當前頁面的 body ID
 */
export function init(pageId) {
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