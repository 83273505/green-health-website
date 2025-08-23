// ==============================================================================
// 檔案路徑: supabase/functions/_shared/clients/SmilePayAPIClient.ts
// 版本: v46.3 - 網路逾時加固 (穩定性提升版)
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file SmilePay API Client (速買配 API 客戶端)
 * @description 封裝與速買配 API 溝通的細節。
 * @version v46.3
 * 
 * @update v46.3 - [NETWORK TIMEOUT HARDENING]
 * 1. [核心加固] 新增了一個私有方法 `_fetchWithTimeout`，該方法使用 `AbortController`
 *          為所有對外的 `fetch` 請求增加了一個 15 秒的逾時機制。
 * 2. [功能整合] `issueInvoice` 和 `voidInvoice` 方法現在都透過 `_fetchWithTimeout`
 *          來發送請求，確保任何外部 API 呼叫都不會因網路延遲而無限期等待。
 * 3. [原理] 此修改能有效防止因第三方 API 無回應而導致 Edge Function 執行超時
 *          的問題，顯著提升了系統在不穩定網路環境下的健壯性。
 * 4. [型別修正] 將 `UnitTAX` 參數加入 `SmilePayInvoiceParams` 介面，維持型別一致性。
 */

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
  UnitTAX?: 'Y' | 'N'; // [v46.3] 新增型別定義
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
  private baseUrl: string;
  private readonly TIMEOUT = 15000; // 15 秒

  constructor() {
    this.grvc = Deno.env.get('SMILEPAY_GRVC') || '';
    this.verifyKey = Deno.env.get('SMILEPAY_VERIFY_KEY') || '';
    
    if (!this.grvc || !this.verifyKey) {
      console.error("[SmilePayAPIClient] 致命錯誤: 缺少 SMILEPAY_GRVC 或 SMILEPAY_VERIFY_KEY 環境變數(Secrets)。");
      throw new Error("SmilePay API 憑證未設定。");
    }

    const isProduction = Deno.env.get('ENVIRONMENT') === 'production';
    this.baseUrl = isProduction 
      ? 'https://ssl.smse.com.tw/api'
      : 'https://ssl.smse.com.tw/api_test';
    console.log(`[SmilePayAPIClient] 已初始化，目標環境: ${isProduction ? 'Production' : 'Test'}`);
  }

  async issueInvoice(params: SmilePayInvoiceParams): Promise<SmilePayResponse> {
    const urlParams = this._buildUrlParams({
      Grvc: this.grvc,
      Verify_key: this.verifyKey,
      ...params
    });
    const url = `${this.baseUrl}/SPEinvoice_Storage.asp`;
    try {
      const response = await this._fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: urlParams
      });
      const xmlText = await response.text();
      return this._parseXMLResponse(xmlText);
    } catch (error) {
      console.error('[SmilePayAPIClient] issueInvoice 請求失敗:', error);
      const message = error.name === 'AbortError' ? '向速買配 API 發送請求時逾時。' : '向速買配 API 發送請求時失敗。';
      throw new SmilePayAPIError(message, error);
    }
  }

  async voidInvoice(invoiceNumber: string, invoiceDate: string, reason: string): Promise<SmilePayResponse> {
    const urlParams = this._buildUrlParams({
      Grvc: this.grvc,
      Verify_key: this.verifyKey,
      InvoiceNumber: invoiceNumber,
      InvoiceDate: invoiceDate,
      types: 'Cancel',
      CancelReason: reason
    });
    const url = `${this.baseUrl}/SPEinvoice_Storage_Modify.asp`;
    try {
      const response = await this._fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: urlParams
      });
      const xmlText = await response.text();
      return this._parseXMLResponse(xmlText);
    } catch (error) {
      console.error('[SmilePayAPIClient] voidInvoice 請求失敗:', error);
      const message = error.name === 'AbortError' ? '向速買配作廢發票 API 發送請求時逾時。' : '向速買配作廢發票 API 發送請求時失敗。';
      throw new SmilePayAPIError(message, error);
    }
  }

  // [v46.3 新增] 帶有逾時機制的 fetch 封裝
  private async _fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT);
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
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

  private _parseXMLResponse(xmlText: string): SmilePayResponse {
    try {
      const getXMLValue = (tag: string): string => {
        const match = xmlText.match(new RegExp(`<${tag}>(.*?)</${tag}>`, 'i'));
        return match ? match[1].trim() : '';
      };
      const status = parseInt(getXMLValue('Status'), 10);
      const success = status === 0;
      const desc = getXMLValue('Desc');
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
      console.error('[SmilePayAPIClient] 解析 XML 回應失敗:', xmlText, error);
      throw new SmilePayAPIError('解析速買配 API 的 XML 回應時失敗。', error);
    }
  }

  private _getErrorMessage(code: number): string {
    const errorMessages: Record<number, string> = {
      0: '成功',
      '-1001': '商家帳號缺少參數',
      '-10011': '查無商家帳號',
      '-10021': '統一編號(Buyer_id)格式錯誤',
      '-10033': 'B2C開立需在48hr內',
      '-10034': 'B2B開立需在168hr內',
      '-10047': '查無此愛心碼',
      '-10052': '載具號碼(CarrierID)錯誤',
      '-10066': '商品總金額(AllAmount)驗算錯誤',
      '-10071': '無可用字軌',
      '-10072': '自訂發票編號 (data_id)重複',
    };
    return errorMessages[code] || `未知的錯誤代碼: ${code}`;
  }
}