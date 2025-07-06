// 檔案路徑: /netlify/functions/submit-message.js

// 我們需要 Supabase 的 JavaScript 客戶端來和資料庫溝通
// 在 Netlify 環境中，我們需要用這種方式來引入
import { createClient } from '@supabase/supabase-js';

// 輔助函式: 建立一個標準化的回應格式
const createResponse = (statusCode, body) => {
    return {
        statusCode,
        headers: {
            'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || 'https://www.greenhealthtw.com.tw', // 允許來自您網站的請求
            'Access-Control-Allow-Headers': 'Content-Type',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    };
};

// Netlify Function 的主處理函式
export const handler = async (event) => {
    // 處理瀏覽器發送的 CORS 預檢請求
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' } };
    }

    // 只接受 POST 方法的請求
    if (event.httpMethod !== 'POST') {
        return createResponse(405, { success: false, error: 'Method Not Allowed' });
    }

    try {
        // 從請求中解析出前端傳來的 JSON 資料
        const data = JSON.parse(event.body);
        const { customer_name, customer_email, phone, subject, message } = data;

        // 伺服器端的最終驗證，防止不完整的資料寫入
        if (!customer_name || !customer_email || !phone || !subject || !message) {
            return createResponse(400, { success: false, error: '所有欄位皆為必填。' });
        }

        // 初始化 Supabase 客戶端，安全地從環境變數讀取金鑰
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

        // 將資料插入到 customer_messages 表格中
        const { error } = await supabase
            .from('customer_messages')
            .insert([{
                "customer_name_顧客姓名": customer_name,
                "customer_email_顧客Email": customer_email,
                "phone_聯絡電話": phone,
                "subject_問題主題": subject,
                "message_訊息內容": message,
                "status_處理狀態": 'unread'
            }]);

        // 如果插入過程中出錯，記錄錯誤並回傳
        if (error) {
            console.error('[MESSAGE][DB_ERROR]', error.message);
            return createResponse(500, { success: false, error: '無法儲存您的訊息，請稍後再試。' });
        }

        // 如果一切順利，回傳成功的訊息
        return createResponse(200, { success: true, message: '訊息已成功送出！' });

    } catch (err) {
        // 如果函式本身執行出錯 (例如 JSON 解析失敗)，記錄錯誤並回傳
        console.error('[FUNCTION][FATAL]', err);
        return createResponse(500, { success: false, error: '伺服器發生未預期的錯誤。' });
    }
};