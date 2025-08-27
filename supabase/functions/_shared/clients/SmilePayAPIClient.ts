// ==============================================================================
// 檔案路徑: supabase/functions/_shared/clients/SmilePayAPIClient.ts
// 版本: v48.4 - 語法修正勝利收官版
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file SmilePay API Client (速買配 API 客戶端)
 * @description 封裝與速買配 API 溝通的細節。
 * @version v48.4
 * 
 * @update v48.4 - [FINAL SYNTAX FIX]
 * 1. [核心修正] 審查並移除了 `issueInvoice` 函式中潛在的、重複的變數宣告，
 *          徹底解決了 `Identifier 'url' has already been declared` 語法錯誤。
 * 2. [錯誤解決] 此修改確保了所有依賴此檔案的後端函式 (如 create-order-from-cart)
 *          都能成功啟動 (`Boot`)，不再發生 `BootFailure`。
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

  constructor() {
    this.grvc = Deno.env.get('SMILEPAY_GRVC') || '';
    this.verifyKey = Deno.env.get('SMILEPAY_VERIFY_KEY') || '';
    
    if (!this.grvc || !this.verifyKey) {
      console.error("[SmilePayAPIClient] 致命錯誤: 缺少 SMILEPAY_GRVC 或 SMILEPAY_VERIFY_KEY 環境變數(Secrets)。");
      throw new Error("SmilePay API 憑證未設定。");
    }
    
    console.log(`[SmilePayAPIClient] 已初始化，目標代理 URL: ${this.baseUrl}`);
  }

  async issueInvoice(params: SmilePayInvoiceParams): Promise<SmilePayResponse> {
    const urlParams = this._buildUrlParams({
      Grvc: this.grvc,
      Verify_key: this.verifyKey,
      ...params
    });
    
    // [v48.4] 確保 url 變數只被宣告一次
    const requestUrl = `${this.baseUrl}/api/SPEinvoice_Storage.asp`;
    
    try {
      const response = await this._fetchWithTimeout(requestUrl, {
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

  private async _fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT);
    
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
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
      if (!success) {
          console.error(`[SmilePay] API 回報錯誤: Status=${status}, Desc=${desc}`);
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
      console.error('[SmilePayAPIClient] 解析 XML 回應失敗:', xmlText, error);
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