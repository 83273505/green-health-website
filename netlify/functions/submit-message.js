// 檔案路徑: /netlify/functions/submit-message.js

import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

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

export const handler = async (event) => {
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

    if (event.httpMethod !== 'POST') {
        return createResponse(405, { success: false, error: 'Method Not Allowed' });
    }

    try {
        const data = JSON.parse(event.body);
        const { customer_name, customer_email, phone, subject, message } = data;

        if (!customer_name || !customer_email || !phone || !subject || !message) {
            return createResponse(400, { success: false, error: '所有欄位皆為必填。' });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer_email)) {
            return createResponse(400, { success: false, error: 'Email 格式不正確。' });
        }

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        const resend = new Resend(process.env.RESEND_API_KEY);

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

        // 發送給內部客服
        await resend.emails.send({
            from: 'Green Health 客服中心 <service@greenhealthtw.com.tw>',
            to: process.env.CONTACT_EMAIL_RECEIVER,
            subject: `新客服訊息: [${subject}] 來自 ${customer_name}`,
            reply_to: customer_email,
            html: `
                <div>
                    <p>請直接回覆至客戶 Email: <a href="mailto:${customer_email}">${customer_email}</a></p>
                    <p>顧客姓名: ${customer_name}</p>
                    <p>聯絡電話: ${phone}</p>
                    <p>問題主題: ${subject}</p>
                    <p>訊息內容:</p>
                    <pre>${message}</pre>
                </div>
            `
        });

        // 發送確認信給客戶
        await resend.emails.send({
            from: 'Green Health 客服中心 <service@greenhealthtw.com.tw>',
            to: customer_email,
            subject: `我們已收到您的訊息：${subject}`,
            html: `
                <div>
                    <p>親愛的 ${customer_name} 您好：</p>
                    <p>我們已收到您的訊息，客服團隊將盡快與您聯絡。</p>
                    <p>您提交的訊息摘要：</p>
                    <ul>
                        <li>問題主題：${subject}</li>
                        <li>聯絡電話：${phone}</li>
                    </ul>
                    <p>訊息內容：</p>
                    <pre>${message}</pre>
                    <p>此為系統自動發送，請勿直接回覆本信件。如需聯絡請寄至 service@greenhealthtw.com.tw</p>
                </div>
            `
        });

        return createResponse(200, { success: true, message: '訊息已成功送出！' });
    } catch (err) {
        console.error('[FUNCTION][FATAL]', err);
        return createResponse(500, { success: false, error: '伺服器發生錯誤。' });
    }
};