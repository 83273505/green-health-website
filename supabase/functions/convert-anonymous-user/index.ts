// ==============================================================================
// 檔案路徑: supabase/functions/convert-anonymous-user/index.ts
// 版本: v44.1 - 語法緊急修正
// ------------------------------------------------------------------------------
// 【此為全新檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Convert Anonymous User Function (匿名使用者轉正函式)
 * @description 實現「無感註冊」的核心後端邏輯。此函式負責為一個已存在的
 *              匿名使用者，安全地“補上”Email 和密碼，使其轉化為正式會員。
 * @version v44.1
 * 
 * @update v44.1 - [SYNTAX FIX]
 * 1. [修正] 修正了 v44.0 版本中因錯誤使用 Markdown 註解 (`*`) 導致的
 *          TypeScript 語法解析錯誤，該錯誤會導致部署失敗。
 * 2. [不變] 檔案的所有核心業務邏輯與安全策略均維持不變。
 * 
 * @architectural_notes
 * 1. [安全優先] 此函式預設需要 JWT 驗證。前端必須在持有匿名 session 的
 *          情況下才能呼叫，確保只有使用者本人才能操作自己的帳號。
 * 2. [“升級”而非“新建”] 核心操作是使用高權限的 supabase.auth.admin.updateUserById
 *          方法，為現有使用者更新資料，而不是建立新使用者。這可以避免觸發不必要
 *          的 Email 驗證流程，確保了體驗的無縫與流暢。
 * 3. [冪等性] 函式會檢查使用者是否已經是正式會員 (非匿名)，若是則直接返回
 *          成功，避免重複操作引發錯誤。
 */

import { createClient } from '../_shared/deps.ts'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  // 處理 CORS 預檢請求
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // --- 1. 初始化 Admin Client 並驗證請求者身份 ---
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      // [安全] 將前端傳來的 Authorization 標頭透傳給 client，
      // 這樣接下來的 getUser() 才能正確識別呼叫者身份。
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser();
    
    if (userError) throw userError;
    if (!user) throw new Error('使用者未授權或 Token 無效。');

    // --- 2. 解析請求參數並進行基礎驗證 ---
    const { newPassword, email } = await req.json();
    if (!newPassword || newPassword.length < 6) {
      throw new Error('密碼為必填項，且長度至少需要6位數。');
    }
    if (!email) {
      throw new Error('缺少必要的 Email 參數。');
    }

    // --- 3. 核心邏輯：驗證使用者狀態並執行“升級”操作 ---
    
    // 如果使用者已經不是匿名的，說明可能已透過其他方式註冊，直接返回成功即可
    if (!user.is_anonymous) {
        console.log(`[convert-anonymous-user] 使用者 ${user.id} 已是正式會員，無需轉換。`);
        return new Response(JSON.stringify({ success: true, message: '使用者已是正式會員。' }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    // 使用高權限的 Admin API 來更新使用者資料
    const { data: updatedUser, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      {
        email: email,
        password: newPassword,
        // 我們可以選擇性地更新 email_confirm 為 true，因為使用者是透過點擊
        // 訂單確認信這個“可信來源”來完成註冊的。
        email_confirm: true, 
      }
    );

    if (updateError) {
      // 處理 Email 已被佔用的常見錯誤
      if (updateError.message.includes('unique constraint')) {
        throw new Error('此 Email 已被註冊，請嘗試使用其他 Email 登入。');
      }
      throw updateError;
    }

    console.log(`[convert-anonymous-user] 匿名使用者 ${user.id} 已成功轉換為正式會員: ${updatedUser.user?.email}`);

    // --- 4. 返回成功響應 ---
    return new Response(
      JSON.stringify({
        success: true,
        message: '帳號已成功升級為正式會員！',
        user: {
            id: updatedUser.user?.id,
            email: updatedUser.user?.email,
        }
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('[convert-anonymous-user] 函式發生錯誤:', error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400, // 通常客戶端錯誤（如密碼太短、Email已存在）回傳 400
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});