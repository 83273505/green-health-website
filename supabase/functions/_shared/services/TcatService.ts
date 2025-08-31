// ==============================================================================
// 檔案路徑: supabase/functions/_shared/services/TcatService.ts
// 版本: v1.2 - 整合託運單下載功能
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file T-cat Service (黑貓物流服務)
 * @description 封裝所有與黑貓宅急便相關的核心業務邏輯，並整合企業級日誌框架。
 * @version v1.2
 * 
 * @update v1.2 - [FEATURE: SHIPMENT DOWNLOAD]
 * 1. [核心新增] 新增 downloadShipmentPDF 方法，用於處理下載託運單的業務流程。
 * 
 * @update v1.1 - [FEATURE: SHIPMENT STATUS]
 * 1. [核心新增] 新增 getShipmentStatus 方法，用於處理獲取託運單貨態的業務邏輯。
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

      const tcatAdapter = new TcatShipmentAdapter(this.logger, correlationId);
      const result = await tcatAdapter.createShipmentFromOrder(orderData);

      this.logger.info(`成功建立黑貓託運單並取得追蹤號碼`, correlationId, { 
        orderId, 
        trackingNumber: result.trackingNumber 
      });

      return result;
    } catch (error) {
      this.logger.error('建立黑貓託運單的整體流程失敗', correlationId, error, { orderId });
      throw error;
    }
  }

  /**
   * 獲取指定託運單號的最新貨態
   * @param trackingNumbers - 一個或多個託運單號的陣列
   * @param correlationId - 用於端到端追蹤的關聯 ID
   * @returns {Promise<object>} 包含 API 回應的物件
   */
  async getShipmentStatus(trackingNumbers: string[], correlationId: string): Promise<any> {
    this.logger.info(`開始處理查詢黑貓貨態的請求`, correlationId, { trackingNumbers });
    try {
      const tcatAdapter = new TcatShipmentAdapter(this.logger, correlationId);
      const result = await tcatAdapter.fetchShipmentStatus(trackingNumbers);
      
      this.logger.info(`成功從黑貓 API 獲取貨態資訊`, correlationId, { trackingNumbers });
      return result;
    } catch (error) {
      this.logger.error('查詢黑貓貨態的整體流程失敗', correlationId, error, { trackingNumbers });
      throw error;
    }
  }

  /**
   * [v1.2 新增] 下載指定託運單的 PDF 檔案
   * @param fileNo - 從建立託運單 API 取得的檔案編號
   * @param trackingNumber - 託運單號，主要用於日誌與檔名
   * @param correlationId - 用於端到端追蹤的關聯 ID
   * @returns {Promise<Blob>} PDF 檔案的二進位資料
   */
  async downloadShipmentPDF(fileNo: string, trackingNumber: string, correlationId: string): Promise<Blob> {
    this.logger.info(`開始處理下載黑貓託運單的請求`, correlationId, { fileNo, trackingNumber });
    try {
      const tcatAdapter = new TcatShipmentAdapter(this.logger, correlationId);
      const result = await tcatAdapter.downloadShipmentPDF(fileNo, trackingNumber);
      
      this.logger.info(`成功從黑貓 API 獲取託運單 PDF 資料流`, correlationId, { fileNo });
      return result;
    } catch (error) {
      this.logger.error('下載黑貓託運單的整體流程失敗', correlationId, error, { fileNo, trackingNumber });
      throw error;
    }
  }
}