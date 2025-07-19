// 檔案路徑: GreenHealth-Auth-Module/js/session.js
import { supabase } from './supabaseClient.js';
// 【升級】從 constants.js 引入常數
import { ROUTES } from './constants.js';

export async function requireLogin() {
    const { data, error } = await supabase.auth.getSession();

    if (error || !data.session) {
        // 【升級】使用常數
        window.location.href = ROUTES.LOGIN;
        return null;
    }
    
    return data.session.user;
}

export async function getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
}