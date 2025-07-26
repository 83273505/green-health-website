/**
 * @file Profile Setup Module (首次資料設定模組)
 * @description 處理新使用者首次登入後，強制填寫基本資料的頁面邏輯。
 */

// ✅ 【增加】從核心模組引入所有需要的共享資源
import { supabase } from '../../core/supabaseClient.js';
import { requireLogin, getCurrentUser } from '../../core/session.js';
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
 * 使用 core/session.js 中的函式來簡化邏輯。
 */
async function checkAuthAndPrefill() {
    currentUser = await requireLogin();
    if (!currentUser) return; // 如果未登入，requireLogin 會自動跳轉，此處為保險

    // 從 profiles 表中獲取已存在的姓名
    const { data: profile } = await supabase
        .from(TABLE_NAMES.PROFILES)
        .select('name')
        .eq('id', currentUser.id)
        .single();
    
    // 預填姓名：優先使用資料庫中的值，其次是從 Google/Facebook 來的元數據
    if (profile?.name) {
        nameInput.value = profile.name;
    } else if (currentUser.user_metadata?.full_name) {
        nameInput.value = currentUser.user_metadata.full_name;
    }
}

/**
 * 處理個人資料表單的提交事件。
 * @param {Event} event - 表單提交事件
 */
async function handleProfileUpdate(event) {
    event.preventDefault();
    if (!currentUser) return;

    // ✅ 【修改】使用 utils.js 中的 setFormSubmitting 來管理按鈕狀態
    setFormSubmitting(profileForm, true, '儲存並繼續');
    
    const updates = {
        id: currentUser.id, // 確保 id 也被傳遞，以觸發 upsert
        name: nameInput.value,
        phone: phoneInput.value || null,
        birthday: birthdayInput.value || null,
        updated_at: new Date().toISOString(),
        is_profile_complete: true // 標記為已完成
    };

    // 使用 upsert 以處理 profile 記錄可能不存在的邊界情況
    const { error } = await supabase
        .from(TABLE_NAMES.PROFILES)
        .upsert(updates)
        .eq('id', currentUser.id);

    if (error) {
        // ✅ 【修改】使用 utils.js 中的 showNotification 來顯示標準化訊息
        showNotification('儲存失敗：' + error.message, 'error');
        setFormSubmitting(profileForm, false, '儲存並繼續');
    } else {
        showNotification('儲存成功！正在將您導向會員主頁...', 'success');
        setTimeout(() => {
            // ✅ 【修改】使用 constants.js 中的 ROUTES 來跳轉，避免硬編碼
            window.location.href = ROUTES.DASHBOARD;
        }, 1500);
    }
}


/**
 * 由 app.js 呼叫的主初始化函式。
 * @param {string} pageId - 當前頁面的 body ID (此處未使用，但保持一致性)
 */
export function init() {
    if (!profileForm) {
        console.error("在 'profile-setup' 頁面找不到 #profile-form 元素。");
        return;
    }

    checkAuthAndPrefill();
    profileForm.addEventListener('submit', handleProfileUpdate);
}