// ==============================================================================
// 檔案路徑: supabase/functions/_shared/adapters/TCatShipmentAdapter.ts
// 版本: v1.0 - 企業級日誌框架整合
// ------------------------------------------------------------------------------
// 【此為全新檔案，可直接使用】
// ==============================================================================

/**
 * @file T-cat Shipment Adapter (黑貓託運單適配器)
 * @description 扮演「翻譯官」的角色，負責將我們系統內部的訂單資料模型，
 *              轉換為黑貓宅急便 API 所需的特定請求格式。
 * @version v1.0
 */

import { TcatAPIClient, TcatOrder } from '../clients/TCatAPIClient.ts';
import LoggingService from '../services/loggingService.ts';

export class TcatShipmentAdapter {
  private apiClient: TcatAPIClient;
  private logger: LoggingService;
  private correlationId: string;

  constructor(logger: LoggingService, correlationId: string) {
    this.logger = logger;
    this.correlationId = correlationId;
    // 初始化底層 Client，並將日誌追蹤鏈傳遞下去
    this.apiClient = new TcatAPIClient(this.logger, this.correlationId);
  }

  /**
   * 從內部訂單資料建立一筆黑貓託運單
   * @param orderData - 從我們資料庫查詢到的完整訂單物件
   * @returns {Promise<object>} 包含託運單號等資訊的成功回應
   */
  async createShipmentFromOrder(orderData: any): Promise<any> {
    this.logger.info('開始將內部訂單資料轉換為黑貓 API 格式', this.correlationId, { orderNumber: orderData.order_number });

    try {
      // 步驟 1: 執行核心的資料格式轉換
      const tcatOrderPayload = this._transformOrderToTcatFormat(orderData);

      // 步驟 2: 呼叫底層 API Client 發送請求
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
   * [私有] 核心轉換邏輯：將我們的訂單物件，轉換為黑貓 API 的參數格式
   * @param order - 我們系統的訂單物件
   * @returns {TcatOrder} 準備好發送給黑貓 API 的參數物件
   */
  private _transformOrderToTcatFormat(order: any): TcatOrder {
    const address = order.shipping_address_snapshot;
    if (!address) {
      throw new Error(`訂單 #${order.order_number} 缺少必要的收件地址快照資訊。`);
    }

    // 將所有品項名稱拼接成單一字串，以符合 API 要求
    const productName = (order.order_items || [])
      .map(item => `${item.product_variants.products.name}(${item.product_variants.name}) x${item.quantity}`)
      .join(', ')
      .substring(0, 20); // API 限制 20 字元

    const now = new Date();
    const shipmentDate = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`;
    // 預設希望配達日為隔天
    const deliveryDate = new Date(now.setDate(now.getDate() + 1));
    const deliveryDateStr = `${deliveryDate.getFullYear()}${(deliveryDate.getMonth() + 1).toString().padStart(2, '0')}${deliveryDate.getDate().toString().padStart(2, '0')}`;

    return {
      OBTNumber: '',
      OrderId: order.order_number,
      Thermosphere: '0001', // 預設為常溫，未來可根據商品屬性動態設定
      Spec: '0002', // 預設為 90cm，未來可根據商品尺寸計算
      ReceiptLocation: '01', // 到宅
      RecipientName: address.recipient_name,
      RecipientTel: address.tel_number || address.phone_number, // 優先使用市話，否則用手機
      RecipientMobile: address.phone_number,
      RecipientAddress: `${address.city}${address.district}${address.street_address}`,
      SenderName: Deno.env.get('TCAT_SENDER_NAME') || '綠健有限公司',
      SenderTel: Deno.env.get('TCAT_SENDER_PHONE') || '02-12345678',
      SenderMobile: Deno.env.get('TCAT_SENDER_MOBILE') || '0912345678',
      SenderZipCode: Deno.env.get('TCAT_SENDER_ZIPCODE') || '104', // 應設為寄件地郵遞區號
      SenderAddress: Deno.env.get('TCAT_SENDER_ADDRESS') || '台北市中山區某某路一段一號',
      ShipmentDate: shipmentDate,
      DeliveryDate: deliveryDateStr,
      DeliveryTime: '04', // 不指定
      IsCollection: 'N', // 預設為非代收貨款
      CollectionAmount: 0,
      ProductName: productName,
      Memo: `訂單編號: ${order.order_number}`,
    };
  }
}