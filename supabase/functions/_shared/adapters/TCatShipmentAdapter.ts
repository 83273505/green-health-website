// ==============================================================================
// 檔案路徑: supabase/functions/_shared/adapters/TCatShipmentAdapter.ts
// 版本: v1.4 - 整合物流資料覆寫層
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file T-cat Shipment Adapter (黑貓託運單適配器)
 * @description 負責資料轉換與呼叫底層 API Client。
 * @version v1.4
 * 
 * @update v1.4 - [FEATURE: LOGISTICS_OVERRIDE]
 * 1. [核心升級] `_transformOrderToTcatFormat` 現在會動態合併原始快照與覆寫資料，
 *          以產生最終的託運單資訊。
 * 2. [功能新增] 新增了對 `IsFreight` (運費到付) 參數的處理。
 * 
 * @update v1.3 - [FEATURE: DYNAMIC_PARAMS]
 * 1. [核心升級] `_transformOrderToTcatFormat` 能夠接收並應用動態物流參數。
 */

import { TcatAPIClient, TcatOrder, TcatStatusResponse } from '../clients/TCatAPIClient.ts';
import LoggingService from '../services/loggingService.ts';

export class TcatShipmentAdapter {
  private apiClient: TcatAPIClient;
  private logger: LoggingService;
  private correlationId: string;

  constructor(logger: LoggingService, correlationId: string) {
    this.logger = logger;
    this.correlationId = correlationId;
    this.apiClient = new TcatAPIClient(this.logger, this.correlationId);
  }

  /**
   * 從內部訂單資料建立一筆黑貓託運單
   * @param orderData - 從我們資料庫查詢到的完整訂單物件
   * @param logisticsParams - 來自前端操作員確認的動態物流參數
   * @returns {Promise<object>} 包含託運單號等資訊的成功回應
   */
  async createShipmentFromOrder(orderData: any, logisticsParams: any): Promise<any> {
    this.logger.info('開始將內部訂單資料轉換為黑貓 API 格式', this.correlationId, { orderNumber: orderData.order_number, params: logisticsParams });

    try {
      const tcatOrderPayload = this._transformOrderToTcatFormat(orderData, logisticsParams);
      const response = await this.apiClient.createShipment(tcatOrderPayload);

      if (response.IsOK !== 'Y' || !response.Data?.Orders?.[0]?.OBTNumber) {
        throw new Error(`黑貓 API 回報錯誤: ${response.Message}`);
      }

      const trackingNumber = response.Data.Orders[0].OBTNumber;
      this.logger.info('API 請求成功，取得託運單號', this.correlationId, { trackingNumber });

      return {
        success: true,
        trackingNumber: trackingNumber,
        apiResponse: response
      };
    } catch (error) {
      this.logger.error('在 TcatShipmentAdapter 中處理託運單建立失敗', this.correlationId, error, { orderNumber: orderData.order_number });
      throw error;
    }
  }

  /**
   * 查詢指定託運單號的貨態
   * @param trackingNumbers - 一個或多個託運單號的陣列
   * @returns {Promise<TcatStatusResponse>} 來自黑貓 API 的原始貨態回應
   */
  async fetchShipmentStatus(trackingNumbers: string[]): Promise<TcatStatusResponse> {
    this.logger.info('Adapter 開始呼叫底層 Client 查詢貨態', this.correlationId, { trackingNumbers });
    try {
      const response = await this.apiClient.getShipmentStatus(trackingNumbers);
      return response;
    } catch (error) {
      this.logger.error('在 TcatShipmentAdapter 中處理貨態查詢失敗', this.correlationId, error, { trackingNumbers });
      throw error;
    }
  }
  
  /**
   * 呼叫 Client 下載託運單 PDF
   * @param fileNo - 檔案編號
   * @param trackingNumber - 託運單號 (僅單筆下載時需要)
   * @returns {Promise<Blob>} PDF 檔案的二進位資料
   */
  async downloadShipmentPDF(fileNo: string, trackingNumber: string): Promise<Blob> {
    this.logger.info('Adapter 開始呼叫底層 Client 下載 PDF', this.correlationId, { fileNo, trackingNumber });
    try {
      const response = await this.apiClient.downloadShipmentPDF({
        FileNo: fileNo,
        Orders: [{ OBTNumber: trackingNumber }],
      });
      return response;
    } catch (error) {
      this.logger.error('在 TcatShipmentAdapter 中處理 PDF 下載失敗', this.correlationId, error, { fileNo });
      throw error;
    }
  }

  /**
   * [v1.4 核心升級] 核心轉換邏輯
   * @param order - 我們系統的訂單物件 (包含原始快照與覆寫層)
   * @param params - 前端傳入的動態物流參數
   * @returns {TcatOrder} 準備好發送給黑貓 API 的參數物件
   */
  private _transformOrderToTcatFormat(order: any, params: any): TcatOrder {
    const originalAddress = order.shipping_address_snapshot || {};
    const overrideAddress = order.shipping_details_override || {};
    
    // 將原始資料與覆寫資料合併，覆寫層優先
    const finalAddress = { ...originalAddress, ...overrideAddress };

    if (!finalAddress.recipient_name) {
      throw new Error(`訂單 #${order.order_number} 缺少最終的收件人姓名資訊。`);
    }

    const productName = (order.order_items || [])
      .map(item => `${item.product_variants.products.name}(${item.product_variants.name}) x${item.quantity}`)
      .join(', ')
      .substring(0, 20);

    const now = new Date();
    const shipmentDate = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`;
    const deliveryDate = new Date();
    deliveryDate.setDate(now.getDate() + 1);
    const deliveryDateStr = `${deliveryDate.getFullYear()}${(deliveryDate.getMonth() + 1).toString().padStart(2, '0')}${deliveryDate.getDate().toString().padStart(2, '0')}`;

    return {
      OBTNumber: '',
      OrderId: order.order_number,
      Thermosphere: params.thermosphere || '0001',
      Spec: params.spec || '0002',
      ReceiptLocation: '01', // 到宅
      RecipientName: finalAddress.recipient_name,
      RecipientTel: finalAddress.tel_number || finalAddress.phone_number,
      RecipientMobile: finalAddress.phone_number,
      RecipientAddress: `${finalAddress.city || ''}${finalAddress.district || ''}${finalAddress.street_address || ''}`,
      SenderName: Deno.env.get('TCAT_SENDER_NAME') || '綠健有限公司',
      SenderTel: Deno.env.get('TCAT_SENDER_PHONE') || '02-12345678',
      SenderMobile: Deno.env.get('TCAT_SENDER_MOBILE') || '0912345678',
      SenderZipCode: Deno.env.get('TCAT_SENDER_ZIPCODE') || '104',
      SenderAddress: Deno.env.get('TCAT_SENDER_ADDRESS') || '台北市中山區某某路一段一號',
      ShipmentDate: shipmentDate,
      DeliveryDate: deliveryDateStr,
      DeliveryTime: '04', // 不指定
      IsFreight: params.isFreight || 'N', // [v1.4] 新增運費到付處理
      IsCollection: params.isCollection || 'N',
      CollectionAmount: params.collectionAmount || 0,
      ProductName: productName,
      Memo: params.memo || `訂單編號: ${order.order_number}`,
    };
  }
}