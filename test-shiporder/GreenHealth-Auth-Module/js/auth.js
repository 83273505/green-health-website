// 檔案路徑: GreenHealth-Auth-Module/js/auth.js

/**
 * @file Authentication Module
 * @description Provides a library of functions for handling user authentication logic.
 * This module is initialized by app.js, which determines which function to run.
 */

import { supabase } from './supabaseClient.js';
import { showNotification } from './utils.js';
import { ROUTES } from './constants.js';

// --- 私有函式 (模組內部使用) ---

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
            showNotification('');
        });
    });

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) showNotification('登入失敗：' + error.message, 'error');
        });
    }

    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!termsConsentCheckbox.checked) {
                return showNotification('請先勾選同意我們的服務條款與隱私權政策。', 'error');
            }
            const email = document.getElementById('signup-email').value;
            const password = document.getElementById('signup-password').value;
            const passwordConfirm = document.getElementById('signup-password-confirm').value;

            if (password.length < 6) return showNotification('密碼長度至少需要6位數。', 'error');
            if (password !== passwordConfirm) return showNotification('兩次輸入的密碼不一致。', 'error');

            const { data, error } = await supabase.auth.signUp({ email, password });
            if (error) {
                showNotification('註冊失敗：' + error.message, 'error');
            } else {
                showNotification('註冊成功！驗證信已寄出，請至您的信箱點擊連結以啟用帳號。', 'success');
            }
        });
    }

    function socialSignIn(provider) {
        if (!termsConsentCheckbox.checked) {
            return showNotification('請先勾選同意我們的服務條款與隱私權政策。', 'error');
        }
        supabase.auth.signInWithOAuth({
            provider: provider,
            options: { redirectTo: window.location.origin + '/auth-callback.html' }
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
            showNotification('處理中...', 'info');
            
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + '/update-password.html',
            });

            if (error) {
                showNotification('發送失敗：' + error.message, 'error');
            } else {
                showNotification('密碼重設連結已成功發送！請至您的信箱查看。', 'success');
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

                    if (newPassword.length < 6) return showNotification('密碼長度至少需要6位數。', 'error');
                    if (newPassword !== newPasswordConfirm) return showNotification('兩次輸入的密碼不一致。', 'error');

                    const { data, error } = await supabase.auth.updateUser({ password: newPassword });

                    if (error) {
                        showNotification('密碼更新失敗：' + error.message, 'error');
                    } else {
                        showNotification('密碼更新成功！3秒後將自動將您導向登入頁。', 'success');
                        setTimeout(() => {
                            window.location.href = ROUTES.LOGIN;
                        }, 3000);
                    }
                });
            }
        }
    });
}


// --- 公開的初始化函式 (由 app.js 呼叫) ---

/**
 * Main initializer for the auth module.
 * @param {string} pageId - The ID of the current page's body tag.
 */
export function init(pageId) {
    switch(pageId) {
        case 'page-login':
            initLoginPage();
            break;
        case 'page-auth-callback':
            initAuthCallbackPage();
            break;
        case 'page-forgot-password':
            initForgotPasswordPage();
            break;
        case 'page-update-password':
            initUpdatePasswordPage();
            break;
    }
}