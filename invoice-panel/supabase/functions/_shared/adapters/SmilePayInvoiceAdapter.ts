// ==============================================================================
// 檔案路徑: supabase/functions/_shared/adapters/SmilePayInvoiceAdapter.ts
// ------------------------------------------------------------------------------
// 【速買配 API 適配器】
// ------------------------------------------------------------------------------
// 此類別扮演「翻譯官」的角色，負責將我們系統內部的資料模型，
// 轉換為速買配 API 所需的特定請求格式。
// 所有與速買配 API 格式相關的「髒活累活」都封裝在此處。
// ==============================================================================

import { SmilePayAPIClient, SmilePayInvoiceParams, SmilePayResponse } from '../clients/SmilePayAPIClient.ts';
import { NumberToTextHelper } from '../utils/NumberToTextHelper.ts';

export class SmilePayInvoiceAdapter {
  private apiClient: SmilePayAPIClient;

  // Adapter 在初始化時，會自動建立一個 API Client 的實例
  constructor() {
    this.apiClient = new SmilePayAPIClient();
  }

  /**
   * 開立發票的主要方法
   * @param invoiceData - 從我們自己 `invoices` 表中查詢到的完整資料，包含了關聯的訂單和訂單項目
   * @returns {Promise<object>} - 一個包含成功與否、發票號碼等資訊的標準化物件
   */
  async issueInvoice(invoiceData: any): Promise<any> {
    try {
      // 步驟 1: 將內部資料格式轉換為速買配 API 需要的格式
      const smilePayParams = this._convertToSmilePayFormat(invoiceData);
      
      // 步驟 2: 呼叫底層的 API Client 發送請求
      const response = await this.apiClient.issueInvoice(smilePayParams);
      
      // 步驟 3: 檢查 API 回應，如果失敗則拋出錯誤
      if (!response.success) {
        throw new Error(`[SmilePay] ${response.error?.message || '未知的 API 錯誤'}`);
      }

      // 步驟 4: 將成功的 API 回應，轉換為我們上層服務需要的標準化格式
      return {
        success: true,
        invoiceNumber: response.data?.invoiceNumber,
        randomNumber: response.data?.randomNumber,
        apiResponse: response // 保留完整的原始 API 回應，以便存入資料庫
      };
    } catch (error) {
      console.error('[SmilePayInvoiceAdapter] issueInvoice 執行失敗:', error);
      // 將錯誤向上層拋出，讓 InvoiceService 進行處理
      throw error;
    }
  }
  
  /**
   * 作廢發票的主要方法
   * @param invoiceNumber - 要作廢的發票號碼
   * @param invoiceDate - 原始發票的開立日期 (YYYY/MM/DD)
   * @param reason - 作廢原因
   * @returns {Promise<object>} - 包含成功與否和原始 API 回應的物件
   */
  async voidInvoice(invoiceNumber: string, invoiceDate: string, reason: string): Promise<any> {
    try {
      const response = await this.apiClient.voidInvoice(invoiceNumber, invoiceDate, reason);

      if (!response.success) {
        throw new Error(`[SmilePay] 作廢失敗: ${response.error?.message || '未知的 API 錯誤'}`);
      }
      
      return {
        success: true,
        apiResponse: response
      };
    } catch (error) {
      console.error('[SmilePayInvoiceAdapter] voidInvoice 執行失敗:', error);
      throw error;
    }
  }

  /**
   * [私有] 核心轉換邏輯：將我們內部的資料模型，轉換為速買配 API 的參數格式
   * @param invoiceData - 包含 invoice, order, order_items 的完整物件
   * @returns {SmilePayInvoiceParams} - 準備好發送給速買配 API 的參數物件
   */
  private _convertToSmilePayFormat(invoiceData: any): SmilePayInvoiceParams {
    const order = invoiceData.orders;
    const items = order.order_items || [];

    // 處理商品明細 - 使用 '|' 符號進行拼接
    const descriptions = items.map((item: any) => item.product_variants?.name || '商品').join('|');
    const quantities = items.map((item: any) => String(item.quantity)).join('|');
    const unitPrices = items.map((item: any) => String(item.price_at_order)).join('|');
    const units = items.map(() => '件').join('|'); // 預設單位為「件」
    const amounts = items.map((item: any) => 
      String(parseFloat(item.price_at_order) * parseInt(item.quantity, 10))
    ).join('|');

    // 格式化日期與時間
    const now = new Date();
    const invoiceDate = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
    const invoiceTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    // 根據發票類型，準備不同的參數
    let specificParams: Partial<SmilePayInvoiceParams> = {};
    switch (invoiceData.type) {
      case 'business':
        specificParams = {
          Buyer_id: invoiceData.vat_number,
          CompanyName: invoiceData.company_name,
          DonateMark: '0',
        };
        break;
      case 'donation':
        specificParams = {
          Name: invoiceData.recipient_name,
          DonateMark: '1',
          LoveKey: invoiceData.donation_code,
        };
        break;
      case 'cloud':
      default:
        const carrierMapping: Record<string, string> = {
          'member': 'EJ0113',    // 速買配載具 (用 Email)
          'mobile': '3J0002',    // 手機條碼
          'certificate': 'CQ0001' // 自然人憑證
        };
        specificParams = {
          Name: invoiceData.recipient_name,
          DonateMark: '0',
          CarrierType: carrierMapping[invoiceData.carrier_type] || 'EJ0113', // 預設為會員載具
          CarrierID: invoiceData.carrier_number,
          CarrierID2: invoiceData.carrier_number, // 根據文件，暗碼可與明碼相同
        };
        break;
    }
    
    // 組合所有參數
    const params: SmilePayInvoiceParams = {
      // 基礎資訊
      InvoiceDate: invoiceDate,
      InvoiceTime: invoiceTime,
      Intype: '07', // 一般稅額計算
      TaxType: '1', // 應稅

      // 商品明細
      Description: descriptions,
      Quantity: quantities,
      UnitPrice: unitPrices,
      Unit: units,
      Amount: amounts,
      AllAmount: Number(order.total_amount),

      // 買受人與載具/捐贈資訊
      ...specificParams,

      // 其他通用資訊
      Email: invoiceData.recipient_email,
      
      // 自訂追蹤欄位
      data_id: `INV-${invoiceData.id}`, // 使用我們自己的 invoice id 作為唯一識別
      orderid: order.order_number,
    };

    return params;
  }
}