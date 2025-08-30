// ==============================================================================
// 檔案路徑: supabase/functions/_shared/services/ShipmentService.ts
// 版本: v1.2 - 整合貨態查詢功能與快取機制
// ==============================================================================
/**
@file Shipment Service (物流服務層)
@description
【核心職責】
此檔案是處理所有與「物流運送」相關業務邏輯的核心中樞。它封裝了從建立
託運單到查詢貨態的完整流程，確保業務規則的一致性與可維護性。
【架構定位】
作為「服務層 (Service)」，它向上為 Edge Functions (如 create-tcat-shipment)
提供清晰的業務介面，向下則調度 TcatAPIClient 來與外部 API 進行通訊，
並負責與 Supabase 資料庫進行所有相關的讀寫操作。
@version v1.2
@update v1.2 - [整合貨態查詢功能與快取機制]
[新增核心方法] 新增 getShipmentStatusForOrder 方法，此為「查詢貨態」
功能的業務邏輯主體。
[實作快取策略] 為了遵循黑貓 API (2小時查詢一次) 的頻率限制並提升效能，
此方法內建了基於資料庫 shipping_status_cache 欄位的快取機制。
僅當快取不存在或過期時，才會觸發實際的 API 呼叫。
[強化安全性] 在 getShipmentStatusForOrder 方法中加入了 userId 驗證，
從業務邏輯層面確保使用者只能查詢屬於自己的訂單，這是 RLS 之外的
一道重要防線。
*/
import { createClient, SupabaseClient } from '../deps.ts';
import { TcatAPIClient, TcatOrder, TcatShipmentResponse, TcatShipmentStatus } from '../clients/TcatAPIClient.ts';
import LoggingService from './loggingService.ts';
// 快取有效時間（2 小時，以毫秒為單位），並減去 5 分鐘作為緩衝以應對邊界情況
const CACHE_DURATION_MS = (2 * 60 - 5) * 60 * 1000;
export class ShipmentService {
private supabase: SupabaseClient;
private tcatClient: TcatAPIClient;
private logger?: LoggingService;
private correlationId?: string;
constructor(supabaseClient: SupabaseClient, logger?: LoggingService, correlationId?: string) {
this.supabase = supabaseClient;
this.logger = logger;
this.correlationId = correlationId || 'no-correlation-id-shipment';
// 將日誌情境向下傳遞給 Client (現在是 v1.2 版本)
this.tcatClient = new TcatAPIClient(this.logger, this.correlationId);
}
private _log(level: 'INFO' | 'WARN' | 'ERROR', message: string, context: object = {}, error?: Error) {
if (this.logger && this.correlationId) {
switch (level) {
case 'INFO':
this.logger.info(message, this.correlationId, context);
break;
case 'WARN':
this.logger.warn(message, this.correlationId, context);
break;
case 'ERROR':
this.logger.error(message, this.correlationId, error || new Error(message), context);
break;
}
} else {
console.log(JSON.stringify({ level, service: 'ShipmentService', message, context, timestamp: new Date().toISOString() }));
}
}
/**
[v1.2 新增] 查詢特定訂單的貨態進度
@param orderId 訂單的 UUID
@param userId 請求者的使用者 UUID，用於權限驗證
@returns 格式化後的貨態資訊
*/
async getShipmentStatusForOrder(orderId: string, userId: string): Promise<TcatShipmentStatus> {
this._log('INFO', '開始查詢訂單貨態', { orderId, userId });
const { data: order, error: fetchError } = await this.supabase
  .from('orders')
  .select('id, user_id, tracking_number, shipping_status_cache')
  .eq('id', orderId)
  .single();

if (fetchError || !order) {
  throw new Error(`找不到訂單 (ID: ${orderId})。`);
}

if (order.user_id !== userId) {
  this._log('WARN', '權限不足：使用者嘗試查詢不屬於自己的訂單貨態', { orderId, userId, ownerId: order.user_id });
  throw new Error('權限不足，無法查詢此訂單。');
}

if (!order.tracking_number) {
  this._log('INFO', '訂單尚未出貨，無託運單號可查詢', { orderId });
  // 回傳一個預設的「準備中」狀態，讓前端可以統一處理
  return { OBTNumber: '', OrderId: '', StatusId: 'pending', StatusName: '準備出貨中', StatusList: [] };
}

// 檢查快取是否有效
const cache = order.shipping_status_cache as { timestamp: string; data: TcatShipmentStatus } | null;
if (cache && new Date().getTime() - new Date(cache.timestamp).getTime() < CACHE_DURATION_MS) {
  this._log('INFO', '成功從快取中讀取貨態資料', { orderId, trackingNumber: order.tracking_number });
  return cache.data;
}

// 快取失效或不存在，呼叫 API
this._log('INFO', '快取失效或不存在，準備呼叫外部 API', { orderId, trackingNumber: order.tracking_number });
const apiResponse = await this.tcatClient.getShipmentStatus([order.tracking_number]);

if (apiResponse.IsOK !== 'Y' || !apiResponse.Data || !apiResponse.Data.OBTs || apiResponse.Data.OBTs.length === 0) {
  // 如果 API 查詢失敗，但我們有舊的快取，則回傳舊快取以提升使用者體驗
  if (cache) {
    this._log('WARN', `查詢新貨態失敗，但存在舊快取，將回傳舊資料。API 訊息: ${apiResponse.Message}`, { orderId });
    return cache.data;
  }
  throw new Error(`查詢貨態失敗: ${apiResponse.Message}`);
}

const shipmentStatus = apiResponse.Data.OBTs;

// 將從 API 獲取的最新資料更新回資料庫快取
const { error: cacheUpdateError } = await this.supabase
  .from('orders')
  .update({
    shipping_status_cache: {
      timestamp: new Date().toISOString(),
      data: shipmentStatus,
    },
  })
  .eq('id', orderId);

if (cacheUpdateError) {
  // 僅記錄錯誤，不阻斷流程，確保使用者能優先看到結果
  this._log('ERROR', '更新貨態快取至資料庫時失敗', { orderId }, cacheUpdateError);
} else {
  this._log('INFO', '成功更新貨態快取至資料庫', { orderId });
}

return shipmentStatus;
}
async createShipmentFromOrder(orderId: string): Promise<{ obtNumber: string; fileNo: string }> {
try {
this._log('INFO', 開始為訂單建立託運單, { orderId });
const { data: order, error: fetchError } = await this.supabase.from('orders').select('*').eq('id', orderId).single();

  if (fetchError || !order) {
    throw new Error(`找不到訂單 ID ${orderId} 的資料。`);
  }

  const tcatPayload = this._mapOrderToTcatPayload(order);
  this._log('INFO', '訂單資料已成功映射為 T-cat API 格式', { orderId });

  const result: TcatShipmentResponse = await this.tcatClient.createShipment(tcatPayload);

  if (result.IsOK !== 'Y' || !result.Data || !result.Data.Orders || result.Data.Orders.length === 0) {
    throw new Error(`黑貓 API 建立託運單失敗: ${result.Message}`);
  }

  const shipmentResult = result.Data.Orders;
  const obtNumber = shipmentResult.OBTNumber;
  const fileNo = shipmentResult.FileNo || result.Data.FileNo || '';

  this._log('INFO', '成功從黑貓 API 取得託運單號', { orderId, obtNumber });

  const { error: updateError } = await this.supabase
    .from('orders')
    .update({
      shipping_provider: 'tcat',
      tracking_number: obtNumber,
      shipping_meta: { fileNo: fileNo, apiResponse: result },
    })
    .eq('id', orderId);

  if (updateError) {
    this._log('ERROR', '託運單已建立，但回寫資料庫時失敗！需手動介入。', { orderId, obtNumber }, updateError);
    throw new Error(`託運單已建立(${obtNumber})，但回寫資料庫失敗: ${updateError.message}`);
  }

  this._log('INFO', `託運單號已成功回寫至訂單`, { orderId, obtNumber });

  return { obtNumber, fileNo };
} catch (error) {
  this._log('ERROR', `從訂單建立託運單的完整流程失敗`, { orderId }, error);
  await this.supabase
    .from('orders')
    .update({
      status: 'shipping_failed',
      status_history: this.supabase.sql`status_history || ${JSON.stringify({
        status: 'shipping_failed',
        timestamp: new Date().toISOString(),
        reason: `T-cat: ${error.message.substring(0, 200)}`,
      })}::jsonb`,
    })
    .eq('id', orderId);
  throw error;
}
}
private _mapOrderToTcatPayload(order: any): TcatOrder {
const shippingInfo = order.shipping_address_snapshot;
if (!shippingInfo) {
  throw new Error(`訂單 ${order.id} 缺少 'shipping_address_snapshot' 快照資料。`);
}

const sender = {
  name: 'GREEN HEALTH 客服中心',
  tel: '02-12345678',
  mobile: '0912345678',
  zipCode: '11560',
  address: '台北市南港區成功路一段32號',
};

return {
  OBTNumber: '',
  OrderId: order.order_number,
  Thermosphere: '0001',
  Spec: '0001',
  ReceiptLocation: '01',
  RecipientName: shippingInfo.recipient_name,
  RecipientTel: shippingInfo.recipient_phone || 'N/A',
  RecipientMobile: shippingInfo.recipient_mobile,
  RecipientAddress: shippingInfo.full_address,
  SenderName: sender.name,
  SenderTel: sender.tel,
  SenderMobile: sender.mobile,
  SenderZipCode: sender.zipCode,
  SenderAddress: sender.address,
  ShipmentDate: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
  DeliveryDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10).replace(/-/g, ''),
  DeliveryTime: '04',
  IsCollection: order.payment_method === 'cod' ? 'Y' : 'N',
  CollectionAmount: order.payment_method === 'cod' ? order.total_amount : 0,
  ProductName: '保健食品一批',
  Memo: `訂單號: ${order.order_number}`,
};
}
}