// 假設您使用 Node.js + nodemailer 實現直接用 Gmail 寄信
// 若您仍用 Resend API，也可類似改 from

import nodemailer from 'nodemailer';

export const handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ success: false, error: 'Method Not Allowed' }),
        };
    }

    try {
        const data = JSON.parse(event.body);
        const { customer_name, customer_email, phone, subject, message } = data;

        if (!customer_name || !customer_email || !phone || !subject || !message) {
            return {
                statusCode: 400,
                body: JSON.stringify({ success: false, error: '所有欄位皆為必填。' }),
            };
        }

        // 設定 Gmail 寄件
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.GMAIL_ACCOUNT, // a896214@gmail.com
                pass: process.env.GMAIL_APP_PASSWORD, // 建議使用 App Password
            },
        });

        // 發給內部自己
        await transporter.sendMail({
            from: 'Green Health 客服中心 <a896214@gmail.com>',
            to: process.env.CONTACT_EMAIL_RECEIVER,
            subject: `新客服訊息: [${subject}] 來自 ${customer_name}`,
            html: `
                <div>
                    <p>請回覆至客戶 Email: <a href="mailto:${customer_email}">${customer_email}</a></p>
                    <p>顧客姓名: ${customer_name}</p>
                    <p>聯絡電話: ${phone}</p>
                    <p>問題主題: ${subject}</p>
                    <p>訊息內容:</p>
                    <pre>${message}</pre>
                    <p style="color: #888; font-size: 12px;">此信由 Green Health 客服中心發送</p>
                </div>
            `,
        });

        // 回覆給客戶
        await transporter.sendMail({
            from: 'Green Health 客服中心 <a896214@gmail.com>',
            to: customer_email,
            subject: `Green Health 客服中心 已收到您的訊息：${subject}`,
            html: `
                <div>
                    <p>親愛的 ${customer_name} 您好：</p>
                    <p>我們已收到您的訊息，客服團隊將盡快與您聯繫。</p>
                    <h3>您提交的訊息摘要：</h3>
                    <ul>
                        <li>問題主題：${subject}</li>
                        <li>聯絡電話：${phone}</li>
                    </ul>
                    <p>訊息內容：</p>
                    <pre>${message}</pre>
                    <p style="color: #888; font-size: 12px;">此信由 Green Health 客服中心發送</p>
                </div>
            `,
        });

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, message: '訊息已成功送出！' }),
        };
    } catch (err) {
        console.error('[GMAIL][SEND_ERROR]', err);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, error: '伺服器發生錯誤。' }),
        };
    }
};