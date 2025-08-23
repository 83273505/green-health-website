// ==============================================================================
// 檔案路徑: supabase/functions/_shared/adapters/SmilePayInvoiceAdapter.ts
// 版本: v46.2 - 發票品項完整性修正 (關鍵錯誤修復版)
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file SmilePay Invoice Adapter (速買配 API 適配器)
 * @description 此類別扮演「翻譯官」的角色，負責將我們系統內部的資料模型，
 *              轉換為速買配 API 所需的特定請求格式。
 *              所有與速買配 API 格式相關的邏輯都封裝在此處。
 * @version v46.2
 * 
 * @update v46.2 - [INVOICE LINE ITEM COMPLETENESS FIX]
 * 1. [核心修正] 重構 `_convertToSmilePayFormat` 函式，現在會檢查訂單中的
 *          `coupon_discount` 和 `shipping_fee` 欄位。
 * 2. [功能實現] 如果折扣或運費存在且大於 0，會將其作為獨立的品項
 *          （例如 "優惠折扣", "運費"）附加到發票明細中。折扣金額會以
 *          負數形式呈現。
 * 3. [原理] 此修改確保了發票上所有品項金額的總和，將精確等於訂單的
 *          `total_amount`，修正了先前版本中發票總額不符的嚴重錯誤，
 *          確保了交易憑證的法律與會計準確性。
 */

import { SmilePayAPIClient, SmilePayInvoiceParams, SmilePayResponse } from '../clients/SmilePayAPIClient.ts';
import { NumberToTextHelper } from '../utils/NumberToTextHelper.ts';

export class SmilePayInvoiceAdapter {
  private apiClient: SmilePayAPIClient;

  constructor() {
    this.apiClient = new SmilePayAPIClient();
  }

  async issueInvoice(invoiceData: any): Promise<any> {
    try {
      const smilePayParams = this._convertToSmilePayFormat(invoiceData);
      const response = await this.apiClient.issueInvoice(smilePayParams);
      if (!response.success) {
        throw new Error(`[SmilePay] ${response.error?.message || '未知的 API 錯誤'}`);
      }
      return {
        success: true,
        invoiceNumber: response.data?.invoiceNumber,
        randomNumber: response.data?.randomNumber,
        apiResponse: response
      };
    } catch (error) {
      console.error('[SmilePayInvoiceAdapter] issueInvoice 執行失敗:', error);
      throw error;
    }
  }
  
  async voidInvoice(invoiceNumber: string, invoiceDate: string, reason: string): Promise<any> {
    try {
      const response = await this.apiClient.voidInvoice(invoiceNumber, invoiceDate, reason);
      if (!response.success) {
        throw new Error(`[SmilePay] 作廢失敗: ${response.error?.message || '未知的 API 錯誤'}`);
      }
      return { success: true, apiResponse: response };
    } catch (error) {
      console.error('[SmilePayInvoiceAdapter] voidInvoice 執行失敗:', error);
      throw error;
    }
  }

  private _convertToSmilePayFormat(invoiceData: any): SmilePayInvoiceParams {
    const order = invoiceData.orders;
    const items = order.order_items || [];

    // [v46.2 核心修正] 先將所有品項資訊存入暫存陣列
    const descriptions: string[] = items.map((item: any) => item.product_variants?.name || '商品');
    const quantities: string[] = items.map((item: any) => String(item.quantity));
    const unitPrices: string[] = items.map((item: any) => String(item.price_at_order));
    const units: string[] = items.map(() => '件'); // 預設單位為「件」
    const amounts: string[] = items.map((item: any) => 
      String(parseFloat(item.price_at_order) * parseInt(item.quantity, 10))
    );

    // [v46.2 新增] 檢查並加入「優惠折扣」作為一個獨立品項
    const couponDiscount = Number(order.coupon_discount);
    if (couponDiscount > 0) {
        descriptions.push('優惠折扣');
        quantities.push('1');
        unitPrices.push(String(-couponDiscount)); // 單價為負數
        units.push('式');
        amounts.push(String(-couponDiscount)); // 小計為負數
    }

    // [v46.2 新增] 檢查並加入「運費」作為一個獨立品項
    const shippingFee = Number(order.shipping_fee);
    if (shippingFee > 0) {
        descriptions.push('運費');
        quantities.push('1');
        unitPrices.push(String(shippingFee));
        units.push('式');
        amounts.push(String(shippingFee));
    }

    const now = new Date();
    const invoiceDate = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
    const invoiceTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    let specificParams: Partial<SmilePayInvoiceParams> = {};
    switch (invoiceData.type) {
      case 'business':
        specificParams = {
          Buyer_id: invoiceData.vat_number,
          CompanyName: invoiceData.company_name,
          DonateMark: '0',
          UnitTAX: 'Y',
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
          'member': 'EJ0113', 'mobile': '3J0002', 'certificate': 'CQ0001'
        };
        specificParams = {
          Name: invoiceData.recipient_name,
          DonateMark: '0',
          CarrierType: carrierMapping[invoiceData.carrier_type] || 'EJ0113',
          CarrierID: invoiceData.carrier_number,
          CarrierID2: invoiceData.carrier_number,
        };
        break;
    }
    
    const params: SmilePayInvoiceParams = {
      InvoiceDate: invoiceDate,
      InvoiceTime: invoiceTime,
      Intype: '07',
      TaxType: '1',
      // [v46.2 核心修正] 使用拼接後包含折扣與運費的完整品項字串
      Description: descriptions.join('|'),
      Quantity: quantities.join('|'),
      UnitPrice: unitPrices.join('|'),
      Unit: units.join('|'),
      Amount: amounts.join('|'),
      AllAmount: Number(order.total_amount),
      ...specificParams,
      Email: invoiceData.recipient_email,
      data_id: `INV-${invoiceData.id}`,
      orderid: order.order_number,
    };

    return params;
  }
}