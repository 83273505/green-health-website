// 檔案路徑: supabase/functions/_shared/api-gateway.ts
// ==============================================================================
/**
 * 檔案名稱：api-gateway.ts
 * 檔案職責：【v1.0 架構性根治方案】提供一個標準化的、安全的 Edge Function 處理器。
 * 版本：1.0
 * AI 註記：
 * - 【架構核心】這就是「理論 100% 解」的核心。它建立了一個名為 `createSecureHandler`
 *   的工廠函式。
 * - 【職責】此閘道統一負責處理所有 Functions 都需要的重複性基礎工作：
 *   1. ✅ CORS Preflight (OPTIONS) 請求的自動回應。
 *   2. ✅ LoggingService 的自動初始化。
 *   3. ✅ withErrorLogging 全域錯誤捕捉的自動應用。
 * - 【價值】未來任何新的 Function 只需要撰寫其核心業務邏輯，然後用此閘道包裹即可，
 *   無需再擔心任何 CORS、日誌或錯誤處理的配置問題。
 */

import { corsHeaders } from '@/shared/cors.ts';
import LoggingService, { withErrorLogging } from '@/shared/services/loggingService.ts';

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
        // 【關鍵修正】強制處理 CORS Preflight (預檢) 請求
        if (req.method === 'OPTIONS') {
            return new Response('ok', { headers: corsHeaders });
        }
        
        return await wrappedHandler(req);
    };
}