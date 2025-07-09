// 檔案路徑: /netlify/functions/submit-message.js

import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

// 建立統一回應格式
const createResponse = (statusCode, body) => ({
  statusCode,
  headers: {
    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(body),
});

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

    // 基本驗證
    if (!customer_name || !customer_email || !phone || !subject || !message) {
      return createResponse(400, { success: false, error: '所有欄位皆為必填。' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer_email)) {
      return createResponse(400, { success: false, error: 'Email 格式不正確。' });
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const resend = new Resend(process.env.RESEND_API_KEY);

    // 寫入資料庫
    const { error: dbError } = await supabase
      .from('customer_messages')
      .insert([{
        "customer_name_顧客姓名": customer_name,
        "customer_email_顧客email": customer_email,
        "phone_聯絡電話": phone,
        "subject_問題主題": subject,
        "message_訊息內容": message,
      }]);

    if (dbError) {
      console.error('[MESSAGE][DB_ERROR]', dbError.message);
      return createResponse(500, { success: false, error: '無法儲存您的訊息，請稍後再試。' });
    }

    // 【最終修改版】寄送通知信至客服信箱
    await resend.emails.send({
      // from: 必須是您在 Resend 驗證過的網域，我們保持不變
      from: 'Green Health 客服中心 <service@greenhealthtw.com.tw>', 
      
      // to: 通知信的收件人，依然是您的免費 Gmail
      to: 'a896214@gmail.com', 
      
      subject: `新客服訊息: [${subject}] 來自 ${customer_name}`,
      
      // 【修改點】reply_to: 當您按「回覆」時，收件人會是 james_chang@...
      reply_to: 'james_chang@celltechtw.com', 
      
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.7; color: #333;">
          <h2 style="color: #00562c;">新客服訊息通知</h2>
          
          <div style="padding: 10px; background-color: #fffbe6; border-left: 4px solid #ffc107; margin-bottom: 20px;">
            <strong>重要：</strong>此為系統通知信。如果要回覆給客戶，請手動複製客戶信箱： <strong>${customer_email}</strong>
          </div>

          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px; font-weight: bold;">顧客姓名:</td><td>${customer_name}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">聯絡電話:</td><td>${phone}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">客戶 Email:</td><td><a href="mailto:${customer_email}">${customer_email}</a></td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">問題主題:</td><td>${subject}</td></tr>
          </table>
          <h3 style="color: #00562c;">訊息內容</h3>
          <div style="background-color: #f7f7f7; padding: 10px; border-radius: 6px; white-space: pre-wrap;">
            ${message}
          </div>
        </div>
      `,
    });

    return createResponse(200, { success: true, message: '訊息已成功送出！' });

  } catch (err) {
    console.error('[FUNCTION][FATAL]', err);
    return createResponse(500, { success: false, error: '伺服器發生錯誤。' });
  }
};