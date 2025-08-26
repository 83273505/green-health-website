// ==============================================================================
// 檔案路徑: account-module/js/modules/profile/profile-setup.js
// 版本: v32.0 - 消費者端模組拆分
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Profile Setup Module (首次資料設定模組)
 * @description 處理新使用者首次登入後，強制填寫基本資料的頁面邏輯。
 */

// 【核心修正】將 import 路徑指向新的 account-module 內部
import { supabase } from '../../core/supabaseClient.js';
import { requireLogin } from '../../core/session.js';
import { showNotification, setFormSubmitting } from '../../core/utils.js';
import { ROUTES, TABLE_NAMES } from '../../core/constants.js';

// --- DOM 元素獲取 ---
const profileForm = document.getElementById('profile-form');
const nameInput = document.getElementById('name-input');
const phoneInput = document.getElementById('phone-input');
const birthdayInput = document.getElementById('birthday-input');

let currentUser = null;

// --- 核心函式 ---

/**
 * 檢查使用者認證狀態並預先填寫表單。
 */
async function checkAuthAndPrefill() {
    currentUser = await requireLogin();
    if (!currentUser) return;

    try {
        const client = await supabase;
        const { data: profile } = await client
            .from(TABLE_NAMES.PROFILES)
            .select('name')
            .eq('id', currentUser.id)
            .single();
        
        if (profile?.name) {
            nameInput.value = profile.name;
        } else if (currentUser.user_metadata?.full_name) {
            nameInput.value = currentUser.user_metadata.full_name;
        }
    } catch (error) {
        console.warn('預填個人資料時發生錯誤 (可能是 profile 尚未建立):', error.message);
    }
}

/**
 * 處理個人資料表單的提交事件。
 * @param {Event} event - 表單提交事件
 */
async function handleProfileUpdate(event) {
    event.preventDefault();
    if (!currentUser) return;

    setFormSubmitting(profileForm, true, '儲存並繼續');
    
    const updates = {
        id: currentUser.id,
        name: nameInput.value,
        phone: phoneInput.value || null,
        birthday: birthdayInput.value || null,
        updated_at: new Date().toISOString(),
        is_profile_complete: true
    };

    try {
        const client = await supabase;
        const { error } = await client
            .from(TABLE_NAMES.PROFILES)
            .upsert(updates)
            .eq('id', currentUser.id);

        if (error) throw error;
        
        showNotification('儲存成功！正在將您導向會員主頁...', 'success');
        setTimeout(() => {
            window.location.href = ROUTES.DASHBOARD;
        }, 1500);

    } catch (error) {
        showNotification('儲存失敗：' + error.message, 'error');
    } finally {
        setFormSubmitting(profileForm, false, '儲存並繼續');
    }
}

/**
 * 由 app.js 呼叫的主初始化函式。
 */
export function init() {
    if (!profileForm) {
        console.error("在 'profile-setup' 頁面找不到 #profile-form 元素。");
        return;
    }

    checkAuthAndPrefill();
    profileForm.addEventListener('submit', handleProfileUpdate);
}