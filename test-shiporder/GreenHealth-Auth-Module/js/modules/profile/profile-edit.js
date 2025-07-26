// 檔案路徑: js/modules/profile/profile-edit.js

/**
 * @file Profile Edit Module (個人資料編輯模組)
 * @description 處理使用者個人資料與行銷偏好的編輯功能。
 */

import { supabase } from '../../core/supabaseClient.js';
import { requireLogin } from '../../core/session.js';
import { showNotification, setFormSubmitting } from '../../core/utils.js';
import { TABLE_NAMES } from '../../core/constants.js';

// --- 狀態管理 ---
let currentUser = null;
let currentProfile = null;

// --- DOM 元素獲取 ---
const loadingView = document.getElementById('loading-view');
const profileView = document.getElementById('profile-view');
const profileForm = document.getElementById('profile-form');
const emailInput = document.getElementById('email');
const nameInput = document.getElementById('name');
const phoneInput = document.getElementById('phone');
const birthdayInput = document.getElementById('birthday');
const consentCheckboxes = document.querySelectorAll('input[data-consent-type]');

// --- 核心函式 ---

/**
 * 獲取並填充用戶資料到表單中。
 * 此函式現在假設使用者已通過驗證。
 */
async function loadProfile() {
    if (!currentUser) return;

    const { data, error } = await supabase
        .from(TABLE_NAMES.PROFILES)
        .select('*')
        .eq('id', currentUser.id)
        .single();

    if (error && error.code !== 'PGRST116') {
        if (loadingView) loadingView.textContent = '讀取用戶資料失敗。';
        console.error('載入個人資料時發生錯誤:', error);
        return;
    }

    currentProfile = data || {};
    populateForm();
    
    if (loadingView) loadingView.classList.add('hidden');
    if (profileView) profileView.classList.remove('hidden');
}

/**
 * 將資料填充到 UI
 */
function populateForm() {
    if (emailInput) emailInput.value = currentUser.email;
    if (nameInput) nameInput.value = currentProfile.name || '';
    if (phoneInput) phoneInput.value = currentProfile.phone || '';
    if (birthdayInput) birthdayInput.value = currentProfile.birthday || '';

    const prefs = currentProfile.marketing_preferences || {};
    consentCheckboxes.forEach(checkbox => {
        const type = checkbox.dataset.consentType;
        checkbox.checked = prefs[type] === true;
    });
}

/**
 * 處理個人資料表單提交
 * @param {Event} event
 */
async function handleProfileUpdate(event) {
    event.preventDefault();
    setFormSubmitting(profileForm, true, '儲存變更');

    const updatedProfile = {
        name: nameInput.value,
        phone: phoneInput.value,
        birthday: birthdayInput.value,
    };

    const { error } = await supabase
        .from(TABLE_NAMES.PROFILES)
        .update(updatedProfile)
        .eq('id', currentUser.id);

    if (error) {
        showNotification('更新資料失敗，請稍後再試。', 'error');
        console.error('更新個人資料時發生錯誤:', error);
    } else {
        showNotification('您的個人資料已成功更新！', 'success');
        currentProfile = { ...currentProfile, ...updatedProfile };
    }
    
    setFormSubmitting(profileForm, false, '儲存變更');
}

/**
 * 處理行銷偏好變更
 * @param {Event} event
 */
async function handleConsentChange(event) {
    const checkbox = event.target;
    const consent_type = checkbox.dataset.consentType;
    const new_status = checkbox.checked;

    checkbox.disabled = true;

    try {
        const { data, error } = await supabase.functions.invoke('handle-consent-update', {
            body: { consent_type, new_status }
        });

        if (error) throw error;
        if (data.error) throw new Error(data.error);

        showNotification('偏好設定已更新。', 'success');

    } catch (error) {
        console.error('更新行銷偏好時發生錯誤:', error);
        showNotification('更新偏好設定失敗。', 'error');
        // 如果後端更新失敗，將 checkbox 的狀態還原
        checkbox.checked = !new_status;
    } finally {
        checkbox.disabled = false;
    }
}

/**
 * 由 app.js 呼叫的主初始化函式。
 */
export async function init() {
    // 1. 在模組初始化的第一步就進行登入驗證
    currentUser = await requireLogin();
    if (!currentUser) return;

    // 2. 只有在確認使用者已登入後，才繼續執行頁面的核心邏輯
    loadProfile();
    
    if (profileForm) {
      profileForm.addEventListener('submit', handleProfileUpdate);
    }
    consentCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', handleConsentChange);
    });
}