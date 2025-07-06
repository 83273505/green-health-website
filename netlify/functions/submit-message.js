// 檔案路徑: /netlify/functions/submit-message.js

// 引入 Supabase 和 Resend 的 JavaScript 客戶端工具
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

// 輔助函式: 建立一個標準化的 JSON 回應，並處理 CORS 標頭
const createResponse = (statusCode, body) => {
    return {
        statusCode,
        headers: {
            'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
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
        return {
            statusCode: 204,
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
        const data = JSON.parse(event.body);
        const { customer_name, customer_email, phone, subject, message } = data;

        // 伺服器端的資料驗證
        if (!customer_name || !customer_email || !phone || !subject || !message) {
            return createResponse(400, { success: false, error: '所有欄位皆為必填。' });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer_email)) {
            return createResponse(400, { success: false, error: 'Email 格式不正確。' });
        }

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        const resend = new Resend(process.env.RESEND_API_KEY);

        // --- 核心邏輯開始 ---

        // 1. 將資料插入到 Supabase
        const { error: dbError } = await supabase
            .from('customer_messages')
            .insert([{
                "customer_name_顧客姓名": customer_name,
                "customer_email_顧客email": customer_email,
                "phone_聯絡電話": phone,
                "subject_問題主題": subject,
                "message_訊息內容": message
            }]);

        if (dbError) {
            console.error('[MESSAGE][DB_ERROR]', dbError.message);
            return createResponse(500, { success: false, error: '無法儲存您的訊息，請稍後再試。' });
        }

        // 2. 發送 Email 通知
        try {
            await resend.emails.send({
                from: 'Green Health 客服中心 <service@greenhealthtw.com.tw>',
                to: process.env.CONTACT_EMAIL_RECEIVER,
                subject: `新客服訊息: [${subject}] 來自 ${customer_name}`,
                // 保留 reply_to，對某些郵件客戶端仍有效
                reply_to: customer_email, 
                
                // ==================== 核心修改處 ====================
                // 在信件內容的最頂部，加入一個醒目的、可點擊的客戶 Email 提示
                html: `
                    <div style="font-family: Arial, sans-serif; line-height: 1.7; color: #333;">
                        <div style="background-color: #fff9e6; border: 1px solid #ffcc00; padding: 15px 20px; border-radius: 8px; margin-bottom: 25px;">
                            <strong style="font-size: 16px; color: #594a00;">請直接回覆至此客戶 Email:</strong><br>
                            <a href="mailto:${customer_email}" style="font-size: 18px; color: #0066cc; text-decoration: none;">${customer_email}</a>
                        </div>
                        <h2 style="color: #00562c; border-bottom: 2px solid #e0e0e0; padding-bottom: 10px;">您有一封來自 Green Health 網站的客服訊息！</h2>
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr style="border-bottom: 1px solid #eee;"><td style="padding: 8px 0; font-weight: bold; width: 100px;">顧客姓名:</td><td style="padding: 8px 0;">${customer_name}</td></tr>
                            <tr style="border-bottom: 1px solid #eee;"><td style="padding: 8px 0; font-weight: bold;">聯絡電話:</td><td style="padding: 8px 0;">${phone}</td></tr>
                            <tr style="border-bottom: 1px solid #eee;"><td style="padding: 8px 0; font-weight: bold;">問題主題:</td><td style="padding: 8px 0;">${subject}</td></tr>
                        </table>
                        <h3 style="color: #00562c; margin-top: 25px;">訊息內容:</h3>
                        <p style="padding: 20px; background-color: #f7f7f7; border-radius: 8px; white-space: pre-wrap;">${message}</p>
                    </div>
                `
                // ====================================================
            });
        } catch (emailError) {
            console.error('[EMAIL][SEND_ERROR]', emailError);
        }

        // 3. 回傳成功的訊息給前端
        return createResponse(200, { success: true, message: '訊息已成功送出！' });

    } catch (err) {
        console.error('[FUNCTION][FATAL]', err);
        return createResponse(500, { success: false, error: '伺服器發生錯誤。' });
    }
};