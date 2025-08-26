// ==============================================================================
// 檔案路徑: supabase/functions/_shared/adapters/SmilePayInvoiceAdapter.ts
// 版本: v48.4 - 參數結構勝利收官版
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file SmilePay Invoice Adapter (速買配 API 適配器)
 * @description 此類別扮演「翻譯官」的角色，負責將我們系統內部的資料模型，
 *              轉換為速買配 API 所需的特定請求格式。
 * @version v48.4
 * 
 * @update v48.4 - [FINAL PARAMETER STRUCTURE FIX]
 * 1. [核心修正] 重構了最終參數物件 `params` 的組合方式，移除了重複的、
 *          會導致參數覆蓋的 `Email` 屬性。
 * 2. [邏輯歸併] 將 `Email` 和 `Phone` 的賦值邏輯，完全歸併到 `switch`
 *          區塊內，確保了參數結構的絕對正確性。
 * 3. [錯誤解決] 此修改旨在徹底解決 `-10054` (缺少建立載具參數) 錯誤。
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
          Email: invoiceData.recipient_email,
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