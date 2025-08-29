// ==============================================================================
// 檔案路徑: supabase/functions/_shared/adapters/SmilePayInvoiceAdapter.ts
// 版本: v50.0 - 企業級日誌框架整合
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file SmilePay Invoice Adapter (速買配 API 適配器)
 * @description 最終版。此類別專職將內部資料模型，轉換並【驗證】為速買配 API 格式。
 * @version v50.0
 *
 * @update v50.0 - [ENTERPRISE LOGGING FRAMEWORK INTEGRATION]
 * 1. [核心架構] 引入 `LoggingService`，並透過建構函式注入，實現了從上層服務
 *          到 Adapter 的 `correlationId` 端到端日誌追蹤。
 * 2. [詳細日誌] 在 API 請求發送前後、參數驗證等關鍵節點增加了詳細的結構化日誌，
 *          極大提升了與第三方服務對接時的問題排查能力。
 * 3. [標準化] 所有 `console.error` 均已替換為 `logger.error()`。
 *
 * @update v49.1 - [PRIVACY ENHANCEMENT]
 * 1. [隱私保護] 根據最終決策，移除了所有向速買配 API 傳遞 `Phone` (電話號碼)
 *          的相關邏輯。
 */

import { SmilePayAPIClient, SmilePayInvoiceParams } from '../clients/SmilePayAPIClient.ts';
import LoggingService from '../services/loggingService.ts'; // 引入標準日誌服務

export class SmilePayInvoiceAdapter {
  private apiClient: SmilePayAPIClient;
  private logger: LoggingService;
  private correlationId: string;

  constructor(logger: LoggingService, correlationId: string) {
    this.apiClient = new SmilePayAPIClient();
    this.logger = logger;
    this.correlationId = correlationId;
  }

  async issueInvoice(invoiceData: any): Promise<any> {
    try {
      const smilePayParams = this._convertToSmilePayFormat(invoiceData);
      this._validateParams(smilePayParams);
      
      this.logger.info('[SmilePay] 準備發送開立發票請求', this.correlationId, {
        orderNumber: invoiceData.orders.order_number,
        // 脫敏處理，僅記錄部分關鍵參數
        params: {
            AllAmount: smilePayParams.AllAmount,
            DonateMark: smilePayParams.DonateMark,
            CarrierType: smilePayParams.CarrierType,
            Buyer_id: smilePayParams.Buyer_id ? '***' : undefined,
        }
      });

      const response = await this.apiClient.issueInvoice(smilePayParams);
      
      if (!response.success) {
        this.logger.error('[SmilePay] API 返回失敗', this.correlationId, new Error(response.error?.message), { apiResponse: response });
        throw new Error(`[SmilePay] ${response.error?.message || '未知的 API 錯誤'}`);
      }

      this.logger.info('[SmilePay] API 返回成功', this.correlationId, { 
          orderNumber: invoiceData.orders.order_number,
          invoiceNumber: response.data?.invoiceNumber
      });

      return {
        success: true,
        invoiceNumber: response.data?.invoiceNumber,
        randomNumber: response.data?.randomNumber,
        apiResponse: response,
      };
    } catch (error) {
      // 錯誤已在內部記錄，此處只需重新拋出
      this.logger.error('[SmilePayInvoiceAdapter] issueInvoice 執行時捕獲到錯誤', this.correlationId, error);
      throw error;
    }
  }

  private _validateParams(params: SmilePayInvoiceParams): void {
    if (params.DonateMark === '1' && params.CarrierType) {
        const error = new Error('格式錯誤：捐贈發票不得同時包含載具資訊。');
        this.logger.warn('[SmilePay] 參數驗證失敗', this.correlationId, { validationError: error.message, params });
        throw error;
    }
    
    if (params.CarrierType === 'EJ0113' && !params.Email) {
        const error = new Error('格式錯誤 (-10054)：會員載具發票必須提供 Email。');
        this.logger.warn('[SmilePay] 參數驗證失敗', this.correlationId, { validationError: error.message, params });
        throw error;
    }
  }

  private _convertToSmilePayFormat(invoiceData: any): SmilePayInvoiceParams {
    // ... 此函式內部邏輯完全不變 ...
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

    const robustEmail = invoiceData.recipient_email || order.customer_email || order.shipping_address_snapshot?.email || '';

    let specificParams: Partial<SmilePayInvoiceParams> = {};
    switch (invoiceData.type) {
      case 'business':
        specificParams = {
          Buyer_id: invoiceData.vat_number,
          CompanyName: invoiceData.company_name,
          Email: robustEmail,
          DonateMark: '0',
          UnitTAX: 'Y',
        };
        break;
      case 'donation':
        specificParams = {
          Name: invoiceData.recipient_name,
          Email: robustEmail,
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
          Email: robustEmail,
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
      data_id: order.order_number, 
      orderid: '',
    };

    return params;
  }
}