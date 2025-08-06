// ==============================================================================
// 檔案路徑: supabase/functions/_shared/clients/SmilePayAPIClient.ts
// ------------------------------------------------------------------------------
// 【速買配 API 客戶端】
// ------------------------------------------------------------------------------
// 此類別封裝了與速買配 (SmilePay) 電子發票 API 溝通的所有底層細節，
// 包括認證、URL 構建、POST 表單請求以及 XML 回應解析。
// ==============================================================================

// --- 型別定義 (與 API 文件對應) ---

/**
 * 發送給速買配「開立發票」API 的參數物件結構。
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
  data_id?: string;
  orderid?: string;
}

/**
 * 從速買配 API 收到的、經過解析的 XML 回應物件結構。
 */
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

/**
 * 自訂錯誤類別，用於封裝 API 請求過程中發生的錯誤。
 */
export class SmilePayAPIError extends Error {
  constructor(message: string, public originalError?: any) {
    super(message);
    this.name = 'SmilePayAPIError';
  }
}

// --- 主要的 API 客戶端類別 ---

export class SmilePayAPIClient {
  private grvc: string;
  private verifyKey: string;
  private baseUrl: string;

  constructor() {
    this.grvc = Deno.env.get('SMILEPAY_GRVC') || '';
    this.verifyKey = Deno.env.get('SMILEPAY_VERIFY_KEY') || '';
    
    if (!this.grvc || !this.verifyKey) {
      console.error("[SmilePayAPIClient] 致命錯誤: 缺少 SMILEPAY_GRVC 或 SMILEPAY_VERIFY_KEY 環境變數(Secrets)。");
      throw new Error("SmilePay API 憑證未設定。");
    }

    // 根據環境變數，自動切換使用正式或測試的 API URL
    const isProduction = Deno.env.get('ENVIRONMENT') === 'production';
    this.baseUrl = isProduction 
      ? 'https://ssl.smse.com.tw/api'
      : 'https://ssl.smse.com.tw/api_test';
    console.log(`[SmilePayAPIClient] 已初始化，目標環境: ${isProduction ? 'Production' : 'Test'}`);
  }

  /**
   * 呼叫「開立發票」API
   * @param params - 符合 SmilePayInvoiceParams 格式的發票資料
   * @returns {Promise<SmilePayResponse>} - 解析後的 API 回應
   */
  async issueInvoice(params: SmilePayInvoiceParams): Promise<SmilePayResponse> {
    const urlParams = this._buildUrlParams({
      Grvc: this.grvc,
      Verify_key: this.verifyKey,
      ...params
    });

    const url = `${this.baseUrl}/SPEinvoice_Storage.asp`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: urlParams
      });

      const xmlText = await response.text();
      return this._parseXMLResponse(xmlText);
    } catch (error) {
      console.error('[SmilePayAPIClient] issueInvoice 請求失敗:', error);
      throw new SmilePayAPIError('向速買配 API 發送請求時失敗。', error);
    }
  }

  /**
   * 呼叫「作廢發票」API
   * @param invoiceNumber - 要作廢的發票號碼
   * @param invoiceDate - 原始發票開立日期 (YYYY/MM/DD)
   * @param reason - 作廢原因
   * @returns {Promise<SmilePayResponse>} - 解析後的 API 回應
   */
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
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: urlParams
      });

      const xmlText = await response.text();
      return this._parseXMLResponse(xmlText); // 作廢的回應格式與開立相似，可共用解析器
    } catch (error) {
      console.error('[SmilePayAPIClient] voidInvoice 請求失敗:', error);
      throw new SmilePayAPIError('向速買配作廢發票 API 發送請求時失敗。', error);
    }
  }

  /**
   * [私有] 將物件轉換為 URL-encoded 字串
   * @param params - 包含所有請求參數的物件
   * @returns {string} - URL-encoded 格式的字串
   */
  private _buildUrlParams(params: Record<string, any>): string {
    const urlParams = new URLSearchParams();
    
    Object.entries(params).forEach(([key, value]) => {
      // 過濾掉 null, undefined 或空字串的參數
      if (value !== null && value !== undefined && value !== '') {
        urlParams.append(key, String(value));
      }
    });

    return urlParams.toString();
  }

  /**
   * [私有] 使用正則表達式解析速買配回傳的簡單 XML
   * @param xmlText - 從 API 收到的 XML 回應字串
   * @returns {SmilePayResponse} - 格式化後的 JavaScript 物件
   */
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
        success,
        status,
        desc,
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

  /**
   * [私有] 根據狀態碼回傳人類可讀的錯誤訊息
   * @param code - 速買配 API 回傳的狀態碼
   * @returns {string} - 對應的錯誤訊息
   */
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