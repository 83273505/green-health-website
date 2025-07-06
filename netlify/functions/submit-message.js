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

        // 伺服器端資料驗證
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
        // ==================== 核心修改處 ====================
        // 將 from 地址改成您自己的、已驗證的網域！
        try {
            await resend.emails.send({
                from: 'Green Health 客服中心 <service@greenhealthtw.com.tw>', // 使用您自己的網域，更專業！
                to: process.env.CONTACT_EMAIL_RECEIVER,
                subject: `新客服訊息: [${subject}] 來自 ${customer_name}`,
                reply_to: customer_email, // 【新增】讓您可以直接在信件上按「回覆」，就會自動回覆給客戶
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
            console.error('[EMAIL][SEND_ERROR]', emailError);
        }
        // ====================================================

        // 3. 回傳成功的訊息給前端
        return createResponse(200, { success: true, message: '訊息已成功送出！' });

    } catch (err) {
        console.error('[FUNCTION][FATAL]', err);
        return createResponse(500, { success: false, error: '伺服器發生錯誤。' });
    }
};