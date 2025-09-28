// 檔案路徑: supabase/functions/_shared/api-gateway.ts
// ==============================================================================
/**
 * 檔案名稱：api-gateway.ts
 * 檔案職責：【v1.1 路徑修正版】提供一個標準化的、安全的 Edge Function 處理器。
 * 版本：1.1
 * AI 註記：
 * - 【v1.1 核心修正】將所有 import 路徑從錯誤的 `@/shared/...` 修正為正確的 `@/_shared/...`
 */

import { corsHeaders } from '@/`_`shared/cors.ts';
import LoggingService, { withErrorLogging } from '@/`_`shared/services/loggingService.ts';

export function createSecureHandler(
    mainHandler: (req: Request, logger: LoggingService, correlationId: string) => Promise<Response>,
    functionName: string,
    functionVersion: string
) {
    const logger = new LoggingService(functionName, functionVersion);
    const wrappedHandler = withErrorLogging(mainHandler, logger);

    return async (req: Request) => {
        if (req.method === 'OPTIONS') {
            return new Response('ok', { headers: corsHeaders });
        }
        
        return await wrappedHandler(req);
    };
}