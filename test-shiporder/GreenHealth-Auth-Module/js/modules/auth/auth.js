// 檔案路徑: js/modules/auth/auth.js (Scorched Earth Cleanup - Final Version)

import { supabase } from '../../core/supabaseClient.js';
import { showNotification } from '../../core/utils.js';
import { ROUTES } from '../../core/constants.js';

// --- 私有輔助函式 ---

/**
 * [新增] 執行「焦土式」清理。
 * 遍歷 localStorage，清除所有與購物車和 Supabase 會話相關的舊狀態。
 * 這是防止匿名狀態污染登入後狀態的最強保險。
 */
function performScorchedEarthCleanup() {
    console.log("執行焦土式清理：清除舊的 cartId 和 Supabase session...");
    try {
        Object.keys(localStorage).forEach(key => {
            // 檢查金鑰是否為我們的 cartId 或 Supabase 的內部 session token
            if (key === 'cartId' || key.startsWith('sb-')) {
                localStorage.removeItem(key);
                console.log(`已移除 localStorage 金鑰: ${key}`);
            }
        });
    } catch (e) {
        console.error("清除 localStorage 時發生錯誤:", e);
    }
}

/**
 * 初始化登入/註冊頁面的所有互動邏輯
 */
function initLoginPage() {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const googleLoginButton = document.getElementById('google-login-button');
    const facebookLoginButton = document.getElementById('facebook-login-button');
    const termsConsentCheckbox = document.getElementById('terms-consent-checkbox');
    const tabs = document.querySelectorAll('.tab-link');
    const contents = document.querySelectorAll('.tab-content');

    // Tab 切換邏輯
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(item => item.classList.remove('active'));
            contents.forEach(item => item.classList.remove('active'));
            tab.classList.add('active');
            const content = document.getElementById(tab.dataset.tab);
            if (content) content.classList.add('active');
            showNotification('', 'info', 'auth-message');
        });
    });

    // Email/密碼登入表單
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) showNotification('登入失敗：' + error.message, 'error', 'auth-message');
        });
    }

    // Email/密碼註冊表單
    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!termsConsentCheckbox || !termsConsentCheckbox.checked) {
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

    // 第三方登入 (Google / Facebook)
    function socialSignIn(provider) {
        if (!termsConsentCheckbox || !termsConsentCheckbox.checked) {
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

    // ✅ 【釜底抽薪的最終修正】
    // 監聽登入成功事件，並在跳轉「之前」強制清理狀態
    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN') {
             // 1. 執行我們最嚴格的清理操作
             performScorchedEarthCleanup();
             
             // 2. 在一個絕對乾淨的狀態下，才進行頁面跳轉
             window.location.href = ROUTES.DASHBOARD;
        }
    });
}

/**
 * 初始化 OAuth 登入後的回調頁面邏輯
 */
function initAuthCallbackPage() {
    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' || (event === 'INITIAL_SESSION' && session)) {
             // ✅ 【同步修正】在 OAuth 回調成功後，也執行同樣嚴格的清理
             performScorchedEarthCleanup();
             
             window.location.replace(ROUTES.DASHBOARD);
        } else if (event === 'INITIAL_SESSION' && !session) {
             setTimeout(() => {
                window.location.replace(ROUTES.LOGIN);
             }, 1000);
        }
    });
}

/**
 * 初始化「忘記密碼」頁面的邏輯
 */
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

/**
 * 初始化「更新密碼」頁面的邏輯
 */
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
        case 'auth-terms':
            // 條款頁面是靜態的，不需要額外的 JS 邏輯
            break;
    }
}