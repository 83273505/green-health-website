// ==============================================================================
// 檔案路徑: supabase/functions/_shared/clients/TCatAPIClient.ts
// 版本: v1.3 - 整合託運單下載功能
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================
/**
 * @file T-cat API Client (黑貓宅急便 API 客戶端)
 * @description 透過內部代理與統一速達 API 溝通。此檔案完全參照 SmilePayAPIClient v50.0 的企業級日誌與代理架構模式。
 * @version v1.3
 *
 * @update v1.3 - [FEATURE: SHIPMENT DOWNLOAD]
 * [新增介面] 加入 TcatDownloadRequest 介面，用於定義託運單下載請求的結構。
 * [新增方法] 新增 downloadShipmentPDF 方法，用於處理二進位 PDF 檔案的下載請求。
 * [架構一致] 新方法遵循現有模式，但特別處理了二進位資料流的回應。
 *
 * @update v1.2 - [FEATURE: SHIPMENT STATUS]
 * [新增介面] 加入 TcatStatusResponse 介面，用於定義貨態查詢 API 的回應結構。
 * [新增方法] 新增 getShipmentStatus 方法，用於向內部代理發送貨態查詢請求。
 */
import LoggingService from '../services/loggingService.ts';

// --- 介面定義：建立託運單 ---
export interface TcatOrder {
  OBTNumber: ''; // PrintType 為 '01' 時，此欄位必須為空白
  OrderId: string; // 我方訂單編號
  Thermosphere: '0001' | '0002' | '0003'; // 溫層: 0001:常溫, 0002:冷藏, 0003:冷凍
  Spec: '0001' | '0002' | '0003' | '0004'; // 規格(尺寸): 60cm, 90cm, 120cm, 150cm
  ReceiptLocation: '01' | '02'; // 01: 到宅, 02: 到所
  RecipientName: string;
  RecipientTel: string;
  RecipientMobile: string;
  RecipientAddress: string;
  SenderName: string;
  SenderTel: string;
  SenderMobile: string;
  SenderZipCode: string; // 寄件人郵遞區號(六碼)
  SenderAddress: string;
  ShipmentDate: string; // yyyyMMdd
  DeliveryDate: string; // yyyyMMdd
  DeliveryTime: '01' | '02' | '04'; // 01: 13時前, 02: 14-18時, 04: 不指定
  IsCollection: 'Y' | 'N'; // 是否代收貨款
  CollectionAmount: number;
  ProductName: string; // 商品名稱
  Memo?: string; // 備註
}
export interface TcatShipmentResponse {
  SrvTranId: string;
  IsOK: 'Y' | 'N';
  Message: string;
  Data?: {
    PrintDateTime: string; // yyyyMMddHHmmss
    Orders: {
      OBTNumber: string; // 託運單號
      OrderId: string; // 我方訂單編號
      FileNo: string; // 託運單下載檔案編號
    }[];
    FileNo?: string; // 多筆訂單時，FileNo 會在 Data 層級
  };
}

// --- 介面定義：查詢貨態 ---
export interface TcatStatus {
  StatusId: string;
  StatusName: string;
  CreateDateTime: string; // yyyyMMddHHmmss
  StationName: string;
}
export interface TcatShipmentStatus {
  OBTNumber: string;
  OrderId: string;
  StatusId: string;
  StatusName: string;
  StatusList: TcatStatus[];
}
export interface TcatStatusResponse {
  SrvTranId: string;
  IsOK: 'Y' | 'N';
  Message: string;
  Data?: {
    OBTs: TcatShipmentStatus[];
  };
}

// --- [v1.3 新增] 介面定義：下載託運單 ---
export interface TcatDownloadRequest {
  FileNo: string;
  Orders?: { OBTNumber: string }[];
}

export class TcatAPIError extends Error {
  constructor(
    message: string,
    public originalError?: any
  ) {
    super(message);
    this.name = 'TcatAPIError';
  }
}

export class TcatAPIClient {
  private readonly baseUrl: string = 'https://api-proxy.greenhealthtw.com.tw';
  private readonly TIMEOUT = 20000;
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
      switch (level) {
        case 'INFO': this.logger.info(message, correlationId, context); break;
        case 'WARN': this.logger.warn(message, correlationId, context); break;
        case 'ERROR': this.logger.error(message, correlationId, error || new Error(message), context); break;
        case 'CRITICAL': this.logger.critical(message, correlationId, error || new Error(message), context); break;
      }
    } else {
      console.log(JSON.stringify({ level, message, context, timestamp: new Date().toISOString() }));
    }
  }

  async createShipment(orderData: TcatOrder): Promise<TcatShipmentResponse> {
    const params = {
      PrintType: '01',
      PrintOBTType: '01',
      Orders: JSON.stringify([orderData]),
    };
    const urlParams = this._buildUrlParams(params);
    const requestUrl = `${this.baseUrl}/tcat/PrintOBT`;

    try {
      this._log('INFO', '向內部代理發送建立託運單請求', { url: requestUrl, orderId: orderData.OrderId });
      const response = await this._fetchWithTimeout(requestUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: urlParams,
      });
      const responseData: TcatShipmentResponse = await response.json();
      if (responseData.IsOK === 'N') {
        this._log('WARN', '黑貓 API (經代理) 回報業務錯誤', { response: responseData, orderId: orderData.OrderId });
      } else {
        this._log('INFO', '收到黑貓 API (經代理) 成功回應', { response: responseData, orderId: orderData.OrderId });
      }
      return responseData;
    } catch (error) {
      const message = error.name === 'AbortError' ? '向內部代理發送請求時逾時。' : '向內部代理發送請求時失敗。';
      this._log('ERROR', message, { url: requestUrl, orderId: orderData.OrderId }, error);
      throw new TcatAPIError(message, error);
    }
  }

  async getShipmentStatus(trackingNumbers: string[]): Promise<TcatStatusResponse> {
    const params = { OBTNumbers: trackingNumbers.join(',') };
    const urlParams = this._buildUrlParams(params);
    const requestUrl = `${this.baseUrl}/tcat/OBTStatus`;

    try {
      this._log('INFO', '向內部代理發送貨態查詢請求', { url: requestUrl, trackingCount: trackingNumbers.length });
      const response = await this._fetchWithTimeout(requestUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: urlParams,
      });
      const responseData: TcatStatusResponse = await response.json();
      if (responseData.IsOK === 'N') {
        this._log('WARN', '黑貓貨態 API (經代理) 回報業務錯誤', { response: responseData });
      } else {
        this._log('INFO', '收到黑貓貨態 API (經代理) 成功回應', { obtCount: responseData.Data?.OBTs?.length || 0 });
      }
      return responseData;
    } catch (error) {
      const message = error.name === 'AbortError' ? '向內部代理發送貨態查詢請求時逾時。' : '向內部代理發送貨態查詢請求時失敗。';
      this._log('ERROR', message, { url: requestUrl }, error);
      throw new TcatAPIError(message, error);
    }
  }

  /**
   * [v1.3 新增] 下載託運單 PDF
   * @param downloadRequest - 包含 FileNo 和可選的 OBTNumber 的請求物件
   * @returns {Promise<Blob>} PDF 檔案的二進位資料
   */
  async downloadShipmentPDF(downloadRequest: TcatDownloadRequest): Promise<Blob> {
    const params: Record<string, any> = { FileNo: downloadRequest.FileNo };
    if (downloadRequest.Orders) {
      params.Orders = JSON.stringify(downloadRequest.Orders);
    }
    const urlParams = this._buildUrlParams(params);
    const requestUrl = `${this.baseUrl}/tcat/DownloadOBT`;

    try {
      this._log('INFO', '向內部代理發送下載託運單請求', { url: requestUrl, fileNo: downloadRequest.FileNo });
      const response = await this._fetchWithTimeout(requestUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: urlParams,
      });

      // 檢查回應是否為 JSON 錯誤訊息
      if (response.headers.get('content-type')?.includes('application/json')) {
        const errorData = await response.json();
        this._log('WARN', '黑貓下載 API (經代理) 回報業務錯誤', { response: errorData, fileNo: downloadRequest.FileNo });
        throw new TcatAPIError(errorData.Message || '下載託運單時發生未知錯誤');
      }

      this._log('INFO', '收到黑貓下載 API (經代理) 成功回應 (二進位資料流)', { fileNo: downloadRequest.FileNo });
      return await response.blob();
    } catch (error) {
      const message = error.name === 'AbortError' ? '向內部代理發送下載請求時逾時。' : '向內部代理發送下載請求時失敗。';
      this._log('ERROR', message, { url: requestUrl, fileNo: downloadRequest.FileNo }, error);
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

  private _buildUrlParams(params: Record<string, any>): string {
    const urlParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        urlParams.append(key, String(value));
      }
    });
    return urlParams.toString();
  }
}