// 檔案路徑: supabase/functions/log-client-error/index.ts
// 版本: v1.0
// 說明: 一個極度輕量級的日誌接收端點，專門用於接收並記錄來自前端的嚴重錯誤。

import { corsHeaders } from '../_shared/cors.ts';
import LoggingService from '../_shared/services/loggingService.ts';

const FUNCTION_NAME = 'log-client-error';
const FUNCTION_VERSION = 'v1.0';

// 專門為此函式實例化一個 logger
const logger = new LoggingService(FUNCTION_NAME, FUNCTION_VERSION);

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { error, context } = await req.json();
        const correlationId = logger.generateCorrelationId(); // 為每個客戶端錯誤生成一個新的追蹤 ID

        // 使用 WARN 級別，因為這是客戶端報告的錯誤，與後端 CRITICAL 錯誤有所區分
        logger.warn(`[Client-Side Error] ${error.message}`, correlationId, {
            clientError: error,
            clientContext: context,
            // 記錄一些請求來源資訊，幫助追蹤
            origin: req.headers.get('origin'),
            userAgent: req.headers.get('user-agent'),
        });

        return new Response(JSON.stringify({ success: true, message: "Log received." }), {
            status: 202, // 202 Accepted: 表示請求已接受，但可能尚未處理
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (e) {
        // 如果日誌端點本身出錯，只在控制台記錄，避免無限循環
        console.error("FATAL: Logging endpoint failed.", e);
        return new Response(JSON.stringify({ success: false }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});