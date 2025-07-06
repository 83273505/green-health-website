// /netlify/functions/submit-message.js
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend'; // 引入 Resend 工具

// 初始化 Resend 客戶端 (從環境變數讀取金鑰)
const resend = new Resend(process.env.RESEND_API_KEY);

// 輔助函式: 建立統一的回應格式
const createResponse = (statusCode, body) => ({ /* ... 省略，同之前版本 ... */ });

export const handler = async (event) => {
    // ... 省略 CORS 和請求驗證，同之前版本 ...

    try {
        const data = JSON.parse(event.body);
        const { customer_name, customer_email, phone, subject, message } = data;

        // ... 省略後端資料驗證，同之前版本 ...

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

        // 1. 先將資料存入 Supabase (不變)
        const { error: dbError } = await supabase.from('customer_messages').insert([{ /* ... */ }]);

        if (dbError) {
            console.error('[MESSAGE][DB_ERROR]', dbError.message);
            return createResponse(500, { success: false, error: '無法儲存您的訊息。' });
        }

        // 2. 【新增步驟】如果存入成功，就發送 Email 通知
        try {
            await resend.emails.send({
                from: 'Green Health 客服通知 <onboarding@resend.dev>', // Resend 免費方案的寄件人地址
                to: process.env.CONTACT_EMAIL_RECEIVER, // 您設定要接收通知的信箱
                subject: `新客服訊息: [${subject}] 來自 ${customer_name}`,
                html: `
                    <p>您有一封新的客服訊息！</p>
                    <ul>
                        <li><strong>姓名:</strong> ${customer_name}</li>
                        <li><strong>Email:</strong> ${customer_email}</li>
                        <li><strong>電話:</strong> ${phone}</li>
                        <li><strong>主題:</strong> ${subject}</li>
                    </ul>
                    <hr>
                    <p><strong>訊息內容:</strong></p>
                    <p>${message.replace(/\n/g, '<br>')}</p>
                `
            });
        } catch (emailError) {
            // 如果 Email 發送失敗，只在後台記錄錯誤，不影響給前端的成功回覆
            // 因為資料已經成功存入資料庫了
            console.error('[EMAIL][SEND_ERROR]', emailError);
        }

        // 3. 回傳成功訊息給前端 (不變)
        return createResponse(200, { success: true, message: '訊息已成功送出！' });

    } catch (err) {
        // ... 省略，同之前版本 ...
    }
};