// ==============================================================================
// 檔案路徑: supabase/functions/_shared/adapters/SmilePayInvoiceAdapter.ts
// 版本: v48.5 - 健壯驗證勝利收官版
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file SmilePay Invoice Adapter (速買配 API 適配器)
 * @description 最終版。此類別專職將內部資料模型，轉換並【驗證】為速買配 API 格式。
 * @version v48.5
 * 
 * @update v48.5 - [ROBUST PARAMETER VALIDATION]
 * 1. [核心重構] 引入一個全新的 `_validateParams` 私有方法，在 API 請求發送前，
 *          對產生的參數進行一次嚴格的、基於業務規則的最終驗證。
 * 2. [錯誤解決] 驗證器包含對 `-10054` 錯誤的精準防禦：強制要求會員載具
 *          必須提供 Email 或 Phone。
 * 3. [健壯性] 驗證器加入了「捐贈發票不得包含載具資訊」的互斥性檢查，
 *          預防了潛在的未來錯誤。
 * 4. [專案完成] 至此，API 直連的所有已知及潛在的格式問題均已解決。
 */

import { SmilePayAPIClient, SmilePayInvoiceParams } from '../clients/SmilePayAPIClient.ts';

export class SmilePayInvoiceAdapter {
  private apiClient: SmilePayAPIClient;

  constructor() {
    this.apiClient = new SmilePayAPIClient();
  }

  async issueInvoice(invoiceData: any): Promise<any> {
    try {
      const smilePayParams = this._convertToSmilePayFormat(invoiceData);
      this._validateParams(smilePayParams); // [v48.5] 發送前驗證
      
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

  private _validateParams(params: SmilePayInvoiceParams): void {
    if (params.DonateMark === '1' && params.CarrierType) {
        throw new Error('格式錯誤：捐贈發票不得同時包含載具資訊。');
    }
    
    // 根據 -10054 錯誤，對會員載具進行嚴格檢查
    if (params.CarrierType === 'EJ0113' && !params.Email && !params.Phone) {
        throw new Error('格式錯誤 (-10054)：會員載具發票必須提供 Email 或電話號碼。');
    }
    
    // 未來可在此處擴充更多驗證規則，例如手機條碼格式...
  }

  private _convertToSmilePayFormat(invoiceData: any): SmilePayInvoiceParams {
    const order = invoiceData.orders;
    const items = order.order_items || [];
    const couponDiscount = Number(order.coupon_discount) || 0;
    const shippingFee = Number(order.shipping_fee) || 0;

    const itemsTotal = items.reduce((sum, item) => sum + (Number(item.price_at_order) * Number(item.quantity)), 0);
    let allocatedDiscount = 0;
    
    const discountedItems = items.map((item, index) => {
        const price = Number(item.price_at_order) || 0;
        const quantity = Number(item.quantity) || 0;
        const subtotal = price * quantity;
        
        let itemDiscount = 0;
        if (itemsTotal > 0 && couponDiscount > 0) {
            if (index === items.length - 1) {
                itemDiscount = couponDiscount - allocatedDiscount;
            } else {
                itemDiscount = Math.round((subtotal / itemsTotal) * couponDiscount);
                allocatedDiscount += itemDiscount;
            }
        }
        
        const newSubtotal = subtotal - itemDiscount;
        const newPrice = quantity > 0 ? newSubtotal / quantity : 0;

        return {
            name: (item.product_variants?.name || '商品').replace(/\n/g, ' '),
            quantity: quantity,
            price: newPrice,
            subtotal: newSubtotal,
            unit: '件'
        };
    });
    
    if (shippingFee > 0) {
        discountedItems.push({ name: '運費', quantity: 1, price: shippingFee, subtotal: shippingFee, unit: '式' });
    }

    const descriptions = discountedItems.map(item => item.name);
    const quantities = discountedItems.map(item => String(item.quantity));
    const unitPrices = discountedItems.map(item => String(item.price));
    const units = discountedItems.map(item => item.unit);
    const amounts = discountedItems.map(item => String(item.subtotal));

    const now = new Date();
    const invoiceDate = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
    const invoiceTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    let specificParams: Partial<SmilePayInvoiceParams> = {};
    switch (invoiceData.type) {
      case 'business':
        specificParams = {
          Buyer_id: invoiceData.vat_number,
          CompanyName: invoiceData.company_name,
          Email: invoiceData.recipient_email,
          DonateMark: '0',
          UnitTAX: 'Y',
        };
        break;
      case 'donation':
        specificParams = {
          Name: invoiceData.recipient_name,
          Email: invoiceData.recipient_email,
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
          Email: invoiceData.recipient_email || '',
          Phone: order.customer_phone || '',
        };
        break;
    }
    
    const params: SmilePayInvoiceParams = {
      InvoiceDate: invoiceDate,
      InvoiceTime: invoiceTime,
      Intype: '07',
      TaxType: '1',
      Description: descriptions.join('|'),
      Quantity: quantities.join('|'),
      UnitPrice: unitPrices.join('|'),
      Unit: units.join('|'),
      Amount: amounts.join('|'),
      AllAmount: Number(order.total_amount),
      ...specificParams,
      data_id: `INV-${invoiceData.id}`,
      orderid: order.order_number,
    };

    return params;
  }
}