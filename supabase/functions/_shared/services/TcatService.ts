// ==============================================================================
// 檔案路徑: supabase/functions/_shared/services/TcatService.ts
// 版本: v1.0 - 企業級日誌框架整合
// ------------------------------------------------------------------------------
// 【此為全新檔案，可直接使用】
// ==============================================================================

/**
 * @file T-cat Service (黑貓物流服務)
 * @description 封裝所有與黑貓宅急便相關的核心業務邏輯，並整合企業級日誌框架。
 * @version v1.0
 */

import { createClient } from '../deps.ts';
import { TcatShipmentAdapter } from '../adapters/TCatShipmentAdapter.ts';
import LoggingService from './loggingService.ts';

export class TcatService {
  private supabaseAdmin: ReturnType<typeof createClient>;
  private logger: LoggingService;

  constructor(supabaseAdmin: ReturnType<typeof createClient>, logger: LoggingService) {
    this.supabaseAdmin = supabaseAdmin;
    this.logger = logger;
  }

  /**
   * 根據訂單 ID 建立一筆黑貓託運單
   * @param orderId - 我們系統內部獨一無二的訂單 ID
   * @param correlationId - 用於端到端追蹤的關聯 ID
   * @returns {Promise<object>} 包含成功狀態和 API 回應的物件
   */
  async createShipment(orderId: string, correlationId: string): Promise<any> {
    this.logger.info(`開始處理建立黑貓託運單的請求`, correlationId, { orderId });

    try {
      // 步驟 1: 從我們的資料庫中獲取建立託運單所需的完整訂單資料
      const { data: orderData, error: orderError } = await this.supabaseAdmin
        .from('orders')
        .select(`
          order_number,
          shipping_address_snapshot,
          order_items (
            quantity,
            product_variants ( name, products ( name ) )
          )
        `)
        .eq('id', orderId)
        .single();

      if (orderError) {
        this.logger.error('查詢訂單資料以建立託運單時失敗', correlationId, orderError, { orderId });
        throw new Error(`查詢訂單資料失敗: ${orderError.message}`);
      }

      if (!orderData) {
        throw new Error(`在資料庫中找不到指定的訂單 (ID: ${orderId})`);
      }

      // 步驟 2: 初始化 Adapter，並將 logger 和 correlationId 注入
      const tcatAdapter = new TcatShipmentAdapter(this.logger, correlationId);

      // 步驟 3: 呼叫 Adapter 進行資料轉換並透過 Client 發送 API 請求
      const result = await tcatAdapter.createShipmentFromOrder(orderData);

      this.logger.info(`成功建立黑貓託運單並取得追蹤號碼`, correlationId, { 
        orderId, 
        trackingNumber: result.trackingNumber 
      });

      // 步驟 4: (可選) 將取得的託運單號回寫至 orders 表
      // await this.supabaseAdmin.from('orders').update({ shipping_tracking_code: result.trackingNumber }).eq('id', orderId);

      return result;

    } catch (error) {
      this.logger.error('建立黑貓託運單的整體流程失敗', correlationId, error, { orderId });
      throw error; // 將錯誤向上層拋出，由最外層的 Edge Function 統一處理
    }
  }
}