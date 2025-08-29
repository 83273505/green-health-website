// ==============================================================================
// 檔案路徑: supabase/functions/_shared/services/loggingService.ts
// 版本： 2.2 - 穩定性修正 (CORS 依賴注入)
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Logging Service (平台統一日誌服務)
 * @version v2.2
 *
 * @update v2.2 - [STABILITY FIX - CORS DEPENDENCY]
 * 1. [核心修正] 在檔案頂部新增了 `import { corsHeaders } from '../cors.ts';`。
 * 2. [原理] 解決了當 `withErrorLogging` 中介軟體捕捉到異常並嘗試回傳
 *          標準 500 錯誤時，因找不到 `corsHeaders` 變數而引發的
 *          `ReferenceError`。此修正確保了全域錯誤處理機制的健壯性。
 *
 * @update v2.1 - [DEPENDENCY LOCALIZATION]
 * 1. [核心修正] 將 UUID 的生成依賴從遠端改為引用本地模組，提升了
 *          所有後端函式在部署和冷啟動時的穩定性與可靠性。
 */

import { v4 as uuidv4 } from '../utils/uuid.ts';
// [v2.2 核心修正] 補上 withErrorLogging 中間件所需要的 CORS 標頭依賴
import { corsHeaders } from '../cors.ts';

// 定義日誌嚴重性級別 (數字越小，越不重要)
export enum LogSeverity {
  DEBUG = 10,
  INFO = 20,
  WARN = 30,
  ERROR = 40,
  AUDIT = 45, // 專用於稽核日誌的特殊級別
  CRITICAL = 50,
}

// 從環境變數讀取日誌級別，若未設定則預設為 INFO
const CURRENT_LOG_LEVEL: LogSeverity =
  LogSeverity[Deno.env.get('LOG_LEVEL')?.toUpperCase() as keyof typeof LogSeverity] || LogSeverity.INFO;

// 定義日誌記錄的標準結構 v1.0
interface LogEntry {
  schemaVersion: '1.0'; // 日誌結構化版本
  timestamp: string; // ISO 8601 格式時間戳
  correlationId: string; // 追蹤單一請求的唯一識別碼
  functionName: string; // 執行日誌記錄的函式名稱
  functionVersion: string; // 函式版本
  severity: LogSeverity; // 日誌級別
  severityText: string; // 日誌級別文字
  message: string; // 日誌主要訊息
  context?: Record<string, any>; // 包含額外情境資訊的物件
  environment: string; // 部署環境 (dev, staging, prod)
  region: string; // Supabase 專案區域
}

class LoggingService {
  private functionName: string;
  private functionVersion: string;
  private environment: string;
  private region: string;
  private alertWebhookUrl: string | undefined;

  constructor(functionName: string, functionVersion: string) {
    this.functionName = functionName;
    this.functionVersion = functionVersion;
    this.environment = Deno.env.get('SUPABASE_ENV') || 'development';
    this.region = Deno.env.get('SUPABASE_REGION') || 'unknown';
    this.alertWebhookUrl = Deno.env.get('LOG_SINK_WEBHOOK');
  }

  // 集中式輸出通道 (Sink)
  private async _sink(logEntry: LogEntry): Promise<void> {
    // 策略一：標準控制台輸出 (預設)
    console.log(JSON.stringify(logEntry));

    // 策略二：嚴重錯誤警示
    if (logEntry.severity === LogSeverity.CRITICAL && this.alertWebhookUrl) {
      try {
        await fetch(this.alertWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `🚨 CRITICAL Alert in ${this.functionName} (v${this.functionVersion}) 🚨`,
            attachments: [{
              color: '#danger',
              title: logEntry.message,
              text: `\`\`\`${JSON.stringify(logEntry.context, null, 2)}\`\`\``,
              footer: `CorrelationID: ${logEntry.correlationId}`
            }]
          }),
        });
      } catch (e) {
        console.error('Failed to send webhook alert:', e.message);
      }
    }
  }

  // 核心日誌記錄方法
  private log(
    severity: LogSeverity,
    message: string,
    correlationId: string,
    context?: Record<string, any>
  ): void {
    if (severity < CURRENT_LOG_LEVEL) {
      return;
    }

    const logEntry: LogEntry = {
      schemaVersion: '1.0',
      timestamp: new Date().toISOString(),
      correlationId,
      functionName: this.functionName,
      functionVersion: this.functionVersion,
      severity,
      severityText: LogSeverity[severity],
      message,
      context: context || {},
      environment: this.environment,
      region: this.region,
    };

    this._sink(logEntry);
  }

  public debug(message: string, correlationId: string, context?: Record<string, any>): void {
    this.log(LogSeverity.DEBUG, message, correlationId, context);
  }
  public info(message: string, correlationId: string, context?: Record<string, any>): void {
    this.log(LogSeverity.INFO, message, correlationId, context);
  }
  public warn(message: string, correlationId: string, context?: Record<string, any>): void {
    this.log(LogSeverity.WARN, message, correlationId, context);
  }
  public error(message: string, correlationId: string, error: Error, context?: Record<string, any>): void {
    this.log(LogSeverity.ERROR, message, correlationId, {
      ...context,
      error: { name: error.name, message: error.message, stack: error.stack?.split('\n') },
    });
  }
  public critical(message: string, correlationId: string, error: Error, context?: Record<string, any>): void {
    this.log(LogSeverity.CRITICAL, message, correlationId, {
      ...context,
      error: { name: error.name, message: error.message, stack: error.stack?.split('\n') },
    });
  }
  public audit(message: string, correlationId: string, context: Record<string, any>): void {
    this.log(LogSeverity.AUDIT, message, correlationId, context);
  }

  public generateCorrelationId(): string {
    return uuidv4();
  }
}

export const withErrorLogging = (
  handler: (req: Request, logger: LoggingService, correlationId: string) => Promise<Response>,
  logger: LoggingService
) => {
  return async (req: Request): Promise<Response> => {
    const correlationId = logger.generateCorrelationId();
    logger.info('Request received', correlationId, {
      method: req.method,
      url: req.url,
      headers: Object.fromEntries(req.headers),
    });

    try {
      return await handler(req, logger, correlationId);
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      logger.critical(`Unhandled exception in ${logger['functionName']}`, correlationId, error, {
        requestUrl: req.url,
      });

      return new Response(
        JSON.stringify({
          error: 'An internal server error occurred.',
          correlationId: correlationId,
        }),
        {
          status: 500,
          // [v2.2] 確保此處能正確引用 corsHeaders
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
  };
};

export default LoggingService;