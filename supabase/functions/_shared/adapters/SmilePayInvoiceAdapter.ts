// ==============================================================================
// 檔案路徑: supabase/functions/_shared/adapters/SmilePayInvoiceAdapter.ts
// 版本: v48.3 - 會員載具最終修正版
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file SmilePay Invoice Adapter (速買配 API 適配器)
 * @description 此類別扮演「翻譯官」的角色，負責將我們系統內部的資料模型，
 *              轉換為速買配 API 所需的特定請求格式。
 * @version v48.3
 * 
 * @update v48.3 - [MEMBER CARRIER PARAMETER FIX]
 * 1. [核心修正] 在處理「雲端發票」的邏輯中，明確地加入了 `Email` 和 `Phone`
 *          參數，以符合速買配建立會員載具時的要求。
 * 2. [錯誤解決] 此修改旨在徹底解決 `-10054` (缺少建立載具參數) 錯誤，
 *          打通 API 直連的最後一哩路。
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
          // [v48.3] 核心修正: 根據 -10054 錯誤，補上會員載具所需的 Email/Phone 參數
          Email: invoiceData.recipient_email,
          Phone: order.customer_phone || '', // 使用訂單電話作為備援
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
      // Email 參數現在由 specificParams 處理，但保留此處以應對 B2B/捐贈等情況
      Email: invoiceData.recipient_email,
      data_id: `INV-${invoiceData.id}`,
      orderid: order.order_number,
    };

    return params;
  }
}