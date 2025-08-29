// supabase/functions/_shared/services/loggingService.ts
// 版本： 2.0
// 說明： 平台統一的結構化日誌服務。此版本整合了環境感知、動態日誌級別、
//       稽核日誌分層、Schema 版本控制、警示 Webhook 以及可擴充的輸出通道設計。

import { v4 as uuidv4 } from 'https://deno.land/std@0.177.0/uuid/mod.ts';

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
    // 輸出為 JSON 字串，便於後續的日誌收集與分析平台進行解析
    console.log(JSON.stringify(logEntry));

    // 策略二：嚴重錯誤警示
    if (logEntry.severity === LogSeverity.CRITICAL && this.alertWebhookUrl) {
      try {
        await fetch(this.alertWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // 根據不同的 webhook (Slack, Teams) 客製化 body 格式
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
    // 未來可在此處擴充其他輸出目標，例如發送到 Datadog, Sentry 等
  }

  // 核心日誌記錄方法
  private log(
    severity: LogSeverity,
    message: string,
    correlationId: string,
    context?: Record<string, any>
  ): void {
    // 根據動態日誌級別決定是否記錄
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

  // --- 公開的日誌記錄方法 ---
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
    // 稽核日誌強制記錄，不受 LOG_LEVEL 影響
    this.log(LogSeverity.AUDIT, message, correlationId, context);
  }

  // 產生一個新的 correlationId，通常在請求的最開始呼叫
  public generateCorrelationId(): string {
    return uuidv4();
  }
}

/**
 * 建立一個全域錯誤攔截器中介軟體 (Middleware)
 * @param handler - 原始的 Edge Function 請求處理器
 * @param logger - LoggingService 的實例
 * @returns 一個新的、被包裹的請求處理器
 */
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
          correlationId: correlationId, // 回傳 ID 給前端，便於追蹤
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  };
};


export default LoggingService;