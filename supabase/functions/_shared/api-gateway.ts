// 檔案路徑: supabase/functions/_shared/api-gateway.ts
// ==============================================================================
/**
 * 檔案名稱：api-gateway.ts
 * 檔案職責：【v1.1 指揮官確認版】提供一個標準化的、安全的 Edge Function 處理器。
 * 版本：1.1
 * AI 註記：
 * - 【v1.1 核心修正】根據 CDRO 指揮官的最終審查，已將所有 import 路徑中的
 *   `@/shared/` 修正為 `@/_shared/`，確保與專案實際資料夾結構完全一致。
 */

import { corsHeaders } from '@/_shared/cors.ts';
import LoggingService, { withErrorLogging } from '@/_shared/services/loggingService.ts';

/**
 * 安全的 Edge Function 處理器工廠函式。
 * @param mainHandler - 真正的業務邏輯處理函式。
 * @param functionName - 該 Edge Function 的名稱。
 * @param functionVersion - 該 Edge Function 的版本。
 * @returns {Function} - 一個可以直接傳遞給 Deno.serve 的標準請求處理器。
 */
export function createSecureHandler(
    mainHandler: (req: Request, logger: LoggingService, correlationId: string) => Promise<Response>,
    functionName: string,
    functionVersion: string
) {
    const logger = new LoggingService(functionName, functionVersion);
    const wrappedHandler = withErrorLogging(mainHandler, logger);

    return async (req: Request) => {
        // 強制處理 CORS Preflight (預檢) 請求
        if (req.method === 'OPTIONS') {
            return new Response('ok', { headers: corsHeaders });
        }
        
        return await wrappedHandler(req);
    };
}