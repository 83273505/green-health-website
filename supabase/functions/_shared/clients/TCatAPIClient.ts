// ==============================================================================
// 檔案路徑: supabase/functions/_shared/clients/TCatAPIClient.ts
// 版本: v1.0 - 企業級日誌框架整合
// ------------------------------------------------------------------------------
// 【此為全新檔案，可直接使用】
// ==============================================================================

/**
 * @file T-cat API Client (黑貓宅急便 API 客戶端)
 * @description 透過內部代理與統一速達 API 溝通。此檔案完全參照 SmilePayAPIClient v50.1 的
 *              企業級日誌與代理架構模式。
 * @version v1.0
 */

import LoggingService from '../services/loggingService.ts';

// --- 介面定義：建立託運單 ---
export interface TcatOrder {
  OBTNumber: ''; // PrintType 為 '01' 時，此欄位必須為空白
  OrderId: string; // 我方訂單編號
  Thermosphere: '0001' | '0002' | '0003'; // 溫層
  Spec: '0001' | '0002' | '0003' | '0004'; // 規格(尺寸)
  ReceiptLocation: '01' | '02'; // 到宅/到所
  RecipientName: string;
  RecipientTel: string;
  RecipientMobile: string;
  RecipientAddress: string;
  SenderName: string;
  SenderTel: string;
  SenderMobile: string;
  SenderZipCode: string;
  SenderAddress: string;
  ShipmentDate: string; // yyyyMMdd
  DeliveryDate: string; // yyyyMMdd
  DeliveryTime: '01' | '02' | '04';
  IsCollection: 'Y' | 'N';
  CollectionAmount: number;
  ProductName: string;
  Memo?: string;
}

export interface TcatShipmentResponse {
  SrvTranId: string;
  IsOK: 'Y' | 'N';
  Message: string;
  Data?: {
    PrintDateTime: string;
    Orders: {
      OBTNumber: string;
      OrderId: string;
      FileNo: string;
    }[];
    FileNo?: string;
  };
}

export class TcatAPIError extends Error {
  constructor(message: string, public originalError?: any) {
    super(message);
    this.name = 'TcatAPIError';
  }
}

export class TcatAPIClient {
  private readonly baseUrl: string = 'https://tcat-proxy.greenhealthtw.com.tw';
  private readonly TIMEOUT = 20000; // 黑貓 API 可能較慢，設定較長逾時
  private logger?: LoggingService;
  private correlationId?: string;

  constructor(logger?: LoggingService, correlationId?: string) {
    this.logger = logger;
    this.correlationId = correlationId;
    this._log('INFO', 'TcatAPIClient 已初始化 (代理模式)', { baseUrl: this.baseUrl });
  }

  private _log(level: 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL', message: string, context: object, error?: Error) {
    const correlationId = this.correlationId || 'no-correlation-id';
    if (this.logger) {
      const logMethod = this.logger[level.toLowerCase()] as Function;
      logMethod.call(this.logger, message, correlationId, error || new Error(message), context);
    } else {
      console.log(JSON.stringify({ level, message, context, timestamp: new Date().toISOString() }));
    }
  }

  /**
   * 建立一筆或多筆託運單
   * @param orders - 一個或多個符合 TcatOrder 格式的訂單物件陣列
   * @returns {Promise<TcatShipmentResponse>} 解析後的 API 回應
   */
  async createShipment(orders: TcatOrder[]): Promise<TcatShipmentResponse> {
    const params = {
      PrintType: '01',
      PrintOBTType: '01', // A4二模宅配
      Orders: JSON.stringify(orders),
    };
    
    const requestUrl = `${this.baseUrl}/tcat/PrintOBT`;

    try {
      this._log('INFO', '向內部代理發送建立託運單請求', { url: requestUrl, orderCount: orders.length });

      const response = await this._fetchWithTimeout(requestUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params), // 黑貓 API 使用 JSON 格式
      });
      
      const responseData: TcatShipmentResponse = await response.json();

      if (responseData.IsOK === 'N') {
        this._log('WARN', '黑貓 API (經代理) 回報業務錯誤', { response: responseData });
      } else {
        this._log('INFO', '收到黑貓 API (經代理) 成功回應', { response: responseData });
      }
      
      return responseData;
    } catch (error) {
      const message = error.name === 'AbortError' ? '向內部代理發送請求時逾時。' : '向內部代理發送請求時失敗。';
      this._log('ERROR', message, { url: requestUrl }, error);
      throw new TcatAPIError(message, error);
    }
  }

  private async _fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`代理服務 HTTP 錯誤! 狀態碼: ${response.status}, 訊息: ${errorText}`);
      }
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}