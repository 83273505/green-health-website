// ==============================================================================
// 檔案路徑: supabase/functions/_shared/clients/SmilePayAPIClient.ts
// 版本: v50.1 - 金鑰去中心化收官版
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file SmilePay API Client (速買配 API 客戶端)
 * @description 封裝與速買配 API 溝通的細節。
 * @version v50.1
 *
 * @update v50.1 - [KEY DECENTRALIZATION]
 * 1. [核心架構] 移除了所有讀取和附加 `SMILEPAY_GRVC` 與 `SMILEPAY_VERIFY_KEY`
 *          的相關邏輯。
 * 2. [職責轉移] API 金鑰的管理與附加責任，現已完全轉移至 Cloudflare Worker
 *          代理層，Supabase 端不再接觸敏感金鑰，提升了系統安全性。
 * 3. [保留] 完整保留了 v50.0 的企業級日誌框架。
 */

import LoggingService from '../services/loggingService.ts';

// --- 介面定義 ---
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
  private readonly baseUrl: string = 'https://api-proxy.greenhealthtw.com.tw';
  private readonly TIMEOUT = 15000;
  private logger?: LoggingService;
  private correlationId?: string;

  constructor(logger?: LoggingService, correlationId?: string) {
    this.logger = logger;
    this.correlationId = correlationId;
    this._log('INFO', `SmilePayAPIClient 已初始化 (代理模式)`, { baseUrl: this.baseUrl });
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
    const urlParams = this._buildUrlParams(params); // [v50.1] 直接使用傳入的參數，不再附加金鑰
    const requestUrl = `${this.baseUrl}/api/SPEinvoice_Storage.asp`;
    
    try {
      this._log('INFO', '向內部代理發送建立發票請求', { url: requestUrl, method: 'POST', orderId: params.orderid });
      const response = await this._fetchWithTimeout(requestUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: urlParams
      });

      const xmlText = await response.text();
      this._log('INFO', '收到內部代理的回應', { xml: xmlText.substring(0, 500) + (xmlText.length > 500 ? '...' : '') });
      return this._parseXMLResponse(xmlText);
    } catch (error) {
      const message = error.name === 'AbortError' ? '向內部代理發送請求時逾時。' : '向內部代理發送請求時失敗。';
      this._log('ERROR', message, { url: requestUrl, orderId: params.orderid }, error);
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
          this._log('WARN', `速買配 API (經代理) 回報業務錯誤`, { status, desc });
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