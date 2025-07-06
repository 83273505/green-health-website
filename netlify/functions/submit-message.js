// 檔案路徑: /netlify/functions/submit-message.js

// 引入 Supabase 的 JavaScript 客戶端工具
import { createClient } from '@supabase/supabase-js';
// 引入 Resend 的 JavaScript 客戶端工具 (用於寄送 Email)
import { Resend } from 'resend';

// 輔助函式: 建立一個標準化的 JSON 回應，並處理 CORS 標頭
const createResponse = (statusCode, body) => {
    return {
        statusCode,
        headers: {
            // 允許來自您正式網站或任何來源(*)的請求，* 在開發時很方便
            'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    };
};

// Netlify Function 的主處理函式
export const handler = async (event) => {
    // 處理瀏覽器在發送 POST 請求前的 OPTIONS "預檢"請求
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 204, // No Content
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            },
        };
    }

    // 只接受 POST 方法的請求
    if (event.httpMethod !== 'POST') {
        return createResponse(405, { success: false, error: 'Method Not Allowed' });
    }

    try {
        // 從請求中解析出前端傳來的 JSON 資料
        const data = JSON.parse(event.body);
        const { customer_name, customer_email, phone, subject, message } = data;

        // 伺服器端的最終資料驗證
        if (!customer_name || !customer_email || !phone || !subject || !message) {
            return createResponse(400, { success: false, error: '所有欄位皆為必填。' });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer_email)) {
            return createResponse(400, { success: false, error: 'Email 格式不正確。' });
        }

        // 初始化 Supabase 和 Resend 客戶端，安全地從環境變數讀取金鑰
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        const resend = new Resend(process.env.RESEND_API_KEY);

        // --- 核心邏輯開始 ---

        // 1. 將資料插入到 Supabase 表格中
        // 這裡的 key 必須和您 Supabase 表格中最終的欄位名稱完全匹配
        const { error: dbError } = await supabase
            .from('customer_messages')
            .insert([{
                "customer_name_顧客姓名": customer_name,
                "customer_email_顧客email": customer_email,
                "phone_聯絡電話": phone,
                "subject_問題主題": subject,
                "message_訊息內容": message
                // "status_處理狀態" 由資料庫自動設為預設值 'unread'
            }]);

        // 如果資料庫寫入出錯，記錄錯誤並回傳
        if (dbError) {
            console.error('[MESSAGE][DB_ERROR]', dbError.message);
            return createResponse(500, { success: false, error: '無法儲存您的訊息，請稍後再試。' });
        }

        // 2. 如果資料庫寫入成功，就發送 Email 通知
        try {
            await resend.emails.send({
                from: 'Green Health 客服通知 <onboarding@resend.dev>', // Resend 免費方案的預設寄件人
                to: process.env.CONTACT_EMAIL_RECEIVER, // 您在 Netlify 設定的收件信箱
                subject: `新客服訊息: [${subject}] 來自 ${customer_name}`,
                html: `
                    <div style="font-family: sans-serif; line-height: 1.6;">
                        <h2>您有一封來自 Green Health 網站的客服訊息！</h2>
                        <hr>
                        <p><strong>顧客姓名:</strong> ${customer_name}</p>
                        <p><strong>顧客Email:</strong> ${customer_email}</p>
                        <p><strong>聯絡電話:</strong> ${phone}</p>
                        <p><strong>問題主題:</strong> ${subject}</p>
                        <hr>
                        <h3>訊息內容:</h3>
                        <p style="padding: 15px; background-color: #f4f4f4; border-radius: 5px;">
                            ${message.replace(/\n/g, '<br>')}
                        </p>
                    </div>
                `
            });
        } catch (emailError) {
            // Email 發送失敗只在後台記錄，不影響給前端的成功回覆
            console.error('[EMAIL][SEND_ERROR]', emailError);
        }

        // 3. 所有工作完成，回傳成功的訊息給前端
        return createResponse(200, { success: true, message: '訊息已成功送出！' });

    } catch (err) {
        // 如果函式本身執行出錯 (例如 JSON 解析失敗)，記錄錯誤並回傳
        console.error('[FUNCTION][FATAL]', err);
        return createResponse(500, { success: false, error: '伺服器發生錯誤。' });
    }
};