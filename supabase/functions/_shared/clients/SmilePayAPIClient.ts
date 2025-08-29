// ==============================================================================
// 檔案路徑: supabase/functions/_shared/clients/SmilePayAPIClient.ts
// 版本: v50.0 - 企業級日誌框架整合
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file SmilePay API Client (速買配 API 客戶端)
 * @description 封裝與速買配 API 溝通的細節。
 * @version v50.0
 *
 * @update v50.0 - [ENTERPRISE LOGGING FRAMEWORK INTEGRATION]
 * 1. [核心架構] 引入 `LoggingService`，並透過建構函式可選地注入，實現了從
 *          上層服務到最底層 Client 的 `correlationId` 端到端日誌追蹤閉環。
 * 2. [詳細日誌] 在 API 請求發送、接收、逾時、XML 解析等所有關鍵節點增加了
 *          詳細的結構化日誌。
 * 3. [雙模式日誌] 新增 `_log` 方法以優雅地處理日誌，在 `logger` 可用時使用
 *          標準日誌，否則退回至 `console`，確保了向下相容性。
 *
 * @update v48.4 - [FINAL SYNTAX FIX]
 * 1. [核心修正] 審查並移除了 `issueInvoice` 函式中潛在的、重複的變數宣告。
 */

import LoggingService from '../services/loggingService.ts';

// ... 介面定義維持不變 ...
export interface SmilePayInvoiceParams {
  InvoiceDate: string;
  InvoiceTime: string;
  Intype: '07' | '08';
  TaxType: '1' | '2' | '3' | '4' | '9';
  DonateMark: '0' | '1';
  Description: string;
  Quantity: string;
  UnitPrice: string;
  Amount: string;
  AllAmount: number;
  Buyer_id?: string;
  CompanyName?: string;
  Name?: string;
  Phone?: string;
  Email?: string;
  Address?: string;
  CarrierType?: string;
  CarrierID?: string;
  CarrierID2?: string;
  LoveKey?: string;
  Unit?: string;
  UnitTAX?: 'Y' | 'N';
  data_id?: string;
  orderid?: string;
}

export interface SmilePayResponse {
  success: boolean;
  status: number;
  desc: string;
  data?: {
    grvc: string;
    orderno: string;
    data_id: string;
    invoiceNumber: string;
    randomNumber: string;
    invoiceDate: string;
    invoiceTime: string;
    invoiceType: string;
    carrierID: string;
  };
  error?: {
    code: string;
    message: string;
    desc: string;
  };
}

export class SmilePayAPIError extends Error {
  constructor(message: string, public originalError?: any) {
    super(message);
    this.name = 'SmilePayAPIError';
  }
}


export class SmilePayAPIClient {
  private grvc: string;
  private verifyKey: string;
  private readonly baseUrl: string = 'https://api-proxy.greenhealthtw.com.tw';
  private readonly TIMEOUT = 15000;
  private logger?: LoggingService;
  private correlationId?: string;

  constructor(logger?: LoggingService, correlationId?: string) {
    this.logger = logger;
    this.correlationId = correlationId;

    this.grvc = Deno.env.get('SMILEPAY_GRVC') || '';
    this.verifyKey = Deno.env.get('SMILEPAY_VERIFY_KEY') || '';
    
    if (!this.grvc || !this.verifyKey) {
      this._log('CRITICAL', "致命錯誤: 缺少 SMILEPAY_GRVC 或 SMILEPAY_VERIFY_KEY 環境變數。", {}, new Error("SmilePay API 憑證未設定。"));
      throw new Error("SmilePay API 憑證未設定。");
    }
    
    this._log('INFO', `SmilePayAPIClient 已初始化`, { baseUrl: this.baseUrl });
  }
  
  private _log(level: 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL', message: string, context: object, error?: Error) {
      const correlationId = this.correlationId || 'no-correlation-id';
      if (this.logger) {
          switch(level) {
              case 'INFO': this.logger.info(message, correlationId, context); break;
              case 'WARN': this.logger.warn(message, correlationId, context); break;
              case 'ERROR': this.logger.error(message, correlationId, error || new Error(message), context); break;
              case 'CRITICAL': this.logger.critical(message, correlationId, error || new Error(message), context); break;
          }
      } else {
          console.log(JSON.stringify({ level, message, context, timestamp: new Date().toISOString() }));
      }
  }

  async issueInvoice(params: SmilePayInvoiceParams): Promise<SmilePayResponse> {
    const urlParams = this._buildUrlParams({
      Grvc: this.grvc,
      Verify_key: this.verifyKey,
      ...params
    });
    
    const requestUrl = `${this.baseUrl}/api/SPEinvoice_Storage.asp`;
    
    try {
      this._log('INFO', '向速買配 API 發送請求', { url: requestUrl, method: 'POST' });
      const response = await this._fetchWithTimeout(requestUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: urlParams
      });

      const xmlText = await response.text();
      this._log('INFO', '收到速買配 API 回應', { xml: xmlText.substring(0, 500) + (xmlText.length > 500 ? '...' : '') }); // 避免日誌過長
      return this._parseXMLResponse(xmlText);
    } catch (error) {
      const message = error.name === 'AbortError' ? '向速買配 API 發送請求時逾時。' : '向速買配 API 發送請求時失敗。';
      this._log('ERROR', message, { url: requestUrl }, error);
      throw new SmilePayAPIError(message, error);
    }
  }

  private async _fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT);
    
    try {
      return await fetch(url, { ...options, signal: controller.signal });
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

  private _parseXMLResponse(xmlText: string): SmilePayResponse {
    try {
      const getXMLValue = (tag: string): string => {
        const match = xmlText.match(new RegExp(`<${tag}>(.*?)</${tag}>`, 'i'));
        return match ? match[1].trim() : '';
      };
      const status = parseInt(getXMLValue('Status'), 10);
      const success = status === 0;
      const desc = getXMLValue('Desc');
      if (!success) {
          this._log('WARN', `速買配 API 回報業務錯誤`, { status, desc });
      }
      return {
        success, status, desc,
        data: success ? {
          grvc: getXMLValue('Grvc'),
          orderno: getXMLValue('orderno'),
          data_id: getXMLValue('data_id'),
          invoiceNumber: getXMLValue('InvoiceNumber'),
          randomNumber: getXMLValue('RandomNumber'),
          invoiceDate: getXMLValue('InvoiceDate'),
          invoiceTime: getXMLValue('InvoiceTime'),
          invoiceType: getXMLValue('InvoiceType'),
          carrierID: getXMLValue('CarrierID'),
        } : undefined,
        error: !success ? {
          code: status.toString(),
          message: this._getErrorMessage(status),
          desc: desc
        } : undefined
      };
    } catch (error) {
      this._log('ERROR', '解析速買配 API 的 XML 回應時失敗', { xml: xmlText }, error);
      throw new SmilePayAPIError('解析速買配 API 的 XML 回應時失敗。', error);
    }
  }

  private _getErrorMessage(code: number): string {
    const errorMessages: Record<number, string> = {
      0: '成功',
      '-1001': '商家帳號缺少參數', '-10011': '查無商家帳號', '-10021': '統一編號(Buyer_id)格式錯誤',
      '-10033': 'B2C開立需在48hr內', '-10034': 'B2B開立需在168hr內', '-10047': '查無此愛心碼',
      '-10052': '載具號碼(CarrierID)錯誤', '-10066': '商品總金額(AllAmount)驗算錯誤',
      '-10071': '無可用字軌', '-10072': '自訂發票編號 (data_id)重複',
    };
    return errorMessages[code] || `未知的錯誤代碼: ${code}`;
  }
}