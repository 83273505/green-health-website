// ==============================================================================
// 檔案路徑: supabase/functions/_shared/services/InvoiceService.ts
// 版本: v47.0 - 企業級日誌框架整合
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Invoice Service (發票服務層)
 * @description 封裝所有與發票相關的業務流程，作為統一的入口。
 * @version v47.0
 *
 * @update v47.0 - [ENTERPRISE LOGGING FRAMEWORK INTEGRATION]
 * 1. [核心架構] 引入 `LoggingService`，並透過建構函式注入。現在，Service
 *          能夠接收並向下傳遞 `correlationId` 至 Adapter 和 Client 層，
 *          完成了端到端的日誌追蹤鏈路。
 * 2. [日誌標準化] 所有 `console.*` 呼叫均已替換為標準的結構化日誌，並在
 *          所有關鍵業務決策點增加了詳細的日誌記錄。
 * 3. [向下相容] 透過 `_log` 輔助函式和可選的建構函式參數，確保即使在沒有
 *          提供 logger 的舊情境下，服務依然能正常運作。
 *
 * @update v46.1 - [VOID INVOICE DATE FORMATTING FIX]
 * 1. [核心加固] `voidInvoiceViaAPI` 中產生 `invoiceDate` 的方式被重構為
 *          手動、明確地建構 `YYYY/MM/DD` 格式，消除了環境差異風險。
 */

import { createClient } from '../deps.ts';
import { SmilePayInvoiceAdapter } from '../adapters/SmilePayInvoiceAdapter.ts';
import { SmilePayAPIClient } from '../clients/SmilePayAPIClient.ts';
import LoggingService from './loggingService.ts';

type SupabaseClient = ReturnType<typeof createClient>;

export class InvoiceService {
  private supabase: SupabaseClient;
  private smilePayAdapter: SmilePayInvoiceAdapter;
  private logger?: LoggingService;
  private correlationId?: string;

  constructor(supabaseClient: SupabaseClient, logger?: LoggingService, correlationId?: string) {
    this.supabase = supabaseClient;
    this.logger = logger;
    this.correlationId = correlationId || 'no-correlation-id';
    
    // 將日誌情境向下傳遞給 Adapter
    this.smilePayAdapter = new SmilePayInvoiceAdapter(this.logger!, this.correlationId);
  }

  private _log(level: 'INFO' | 'WARN' | 'ERROR', message: string, context: object = {}, error?: Error) {
    if (this.logger && this.correlationId) {
        switch(level) {
            case 'INFO': this.logger.info(message, this.correlationId, context); break;
            case 'WARN': this.logger.warn(message, this.correlationId, context); break;
            case 'ERROR': this.logger.error(message, this.correlationId, error || new Error(message), context); break;
        }
    } else {
        console.log(JSON.stringify({ level, service: 'InvoiceService', message, context, timestamp: new Date().toISOString() }));
    }
  }

  async determineInvoiceData(order: any, userProvidedOptions: any): Promise<any> {
    if (this.isInvoiceOptionsComplete(userProvidedOptions)) {
      this._log('INFO', `使用使用者提供的完整發票資料`, { orderId: order.id });
      return userProvidedOptions;
    }
    
    const userIsRealMember = order.user_id && !order.is_anonymous;

    if (userIsRealMember) {
      this._log('INFO', `正式會員未提供完整發票資料，嘗試從 profiles 補全`, { userId: order.user_id, orderId: order.id });
      const { data: profile, error } = await this.supabase.from('profiles').select('email, name').eq('id', order.user_id).single();

      if (!error && profile) {
        const finalOptions = { ...userProvidedOptions };
        if (finalOptions.type === 'cloud' && finalOptions.carrier_type === 'member' && !finalOptions.carrier_number) {
            finalOptions.carrier_number = profile.email;
        }
        finalOptions.recipient_name = profile.name || order.customer_name;
        finalOptions.recipient_email = profile.email || order.customer_email;
        
        this._log('INFO', `已從 profiles 補全發票資料`, { orderId: order.id });
        return finalOptions;
      }
      this._log('WARN', `無法獲取 profile 來補全資料`, { userId: order.user_id, orderId: order.id, error: error?.message });
    }
    
    this._log('INFO', `匿名/訪客訂單或會員 profile 查詢失敗，從訂單快照中提取資料`, { orderId: order.id });
    const finalOptions = { ...userProvidedOptions };
    finalOptions.recipient_name = order.shipping_address_snapshot?.recipient_name || order.customer_name;
    finalOptions.recipient_email = order.customer_email;
    if (finalOptions.type === 'cloud' && finalOptions.carrier_type === 'member' && !finalOptions.carrier_number) {
        finalOptions.carrier_number = order.customer_email;
    }
    
    if (!finalOptions.recipient_email) {
        this._log('WARN', `訂單快照中也缺少 Email，將使用預設捐贈發票`, { orderId: order.id });
        return this._getDefaultDonationInvoiceData(finalOptions.recipient_name);
    }

    this._log('INFO', `已從訂單快照補全發票資料`, { orderId: order.id });
    return finalOptions;
  }

  async createInvoiceRecord(orderId: string, orderTotalAmount: number, invoiceData: any): Promise<any> {
    this._log('INFO', `準備為訂單建立發票記錄`, { orderId });
    const { data: newInvoice, error } = await this.supabase
      .from('invoices')
      .insert({
        order_id: orderId, type: invoiceData.type, status: 'pending',
        recipient_name: invoiceData.recipient_name, recipient_email: invoiceData.recipient_email,
        vat_number: invoiceData.vat_number || null, company_name: invoiceData.company_name || null,
        carrier_type: invoiceData.carrier_type || null, carrier_number: invoiceData.carrier_number || null,
        donation_code: invoiceData.donation_code || null, total_amount: orderTotalAmount,
      })
      .select().single();
      
    if (error) {
      this._log('ERROR', `建立發票記錄失敗`, { orderId }, error);
      throw new Error(`建立發票記錄時發生資料庫錯誤: ${error.message}`);
    }
    this._log('INFO', `成功建立發票記錄`, { orderId, invoiceId: newInvoice.id });
    return newInvoice;
  }

  async createAndIssueInvoiceFromOrder(order: any): Promise<void> {
    try {
      this._log('INFO', `開始「建立並開立」快捷流程`, { orderNumber: order.order_number });
      if (!order || !order.id) throw new Error("傳入的 order 物件無效或缺少 id。");
      
      const invoiceData = {
        type: 'cloud', carrier_type: 'member', carrier_number: order.customer_email,
        recipient_name: order.shipping_address_snapshot?.recipient_name || order.customer_name,
        recipient_email: order.customer_email,
      };
      
      const newInvoice = await this.createInvoiceRecord(order.id, order.total_amount, invoiceData);
      await this.issueInvoiceViaAPI(newInvoice.id);
      
    } catch (error) {
      this._log('ERROR', `createAndIssueInvoiceFromOrder 流程失敗`, { orderNumber: order.order_number }, error);
      throw error; 
    }
  }
  
  async issueInvoiceViaAPI(invoiceId: string): Promise<void> {
    try {
      this._log('INFO', `開始開立發票流程`, { invoiceId });
      const { data: invoice, error: fetchError } = await this.supabase
        .from('invoices')
        .select(`*, orders(*, order_items(*, product_variants(name)))`)
        .eq('id', invoiceId).single();

      if (fetchError || !invoice) {
        throw new Error(`找不到 Invoice ID ${invoiceId} 或其關聯訂單的資料。`);
      }
      
      const result = await this.smilePayAdapter.issueInvoice(invoice);

      await this.supabase
        .from('invoices')
        .update({
          status: 'issued', invoice_number: result.invoiceNumber, api_response: result.apiResponse,
          issued_at: new Date().toISOString(), error_message: null
        })
        .eq('id', invoiceId);

      this._log('INFO', `發票成功開立`, { invoiceId, invoiceNumber: result.invoiceNumber });

    } catch (error) {
      await this.handleInvoiceError(invoiceId, error);
      throw error;
    }
  }
  
  async voidInvoiceViaAPI(invoiceId: string, reason: string): Promise<void> {
    try {
      this._log('INFO', `開始作廢發票流程`, { invoiceId, reason });
      const { data: invoice } = await this.supabase
        .from('invoices')
        .select('invoice_number, issued_at')
        .eq('id', invoiceId).single();
      
      if (!invoice?.invoice_number || !invoice.issued_at) {
        throw new Error('發票號碼不存在或發票尚未開立，無法作廢。');
      }

      const issuedDate = new Date(invoice.issued_at);
      const year = issuedDate.getFullYear();
      const month = String(issuedDate.getMonth() + 1).padStart(2, '0');
      const day = String(issuedDate.getDate()).padStart(2, '0');
      const invoiceDate = `${year}/${month}/${day}`;

      // 由於 SmilePayAdapter 尚未整合日誌，Client 需在此處實例化以傳遞情境
      const apiClient = new SmilePayAPIClient(this.logger, this.correlationId);
      const result = await apiClient.voidInvoice(invoice.invoice_number, invoiceDate, reason);

      await this.supabase
        .from('invoices')
        .update({
          status: 'voided', voided_at: new Date().toISOString(), void_reason: reason, api_response: result.apiResponse
        })
        .eq('id', invoiceId);
        
      this._log('INFO', `發票已成功作廢`, { invoiceId });

    } catch (error) {
      await this.handleInvoiceError(invoiceId, error);
      throw error;
    }
  }

  private isInvoiceOptionsComplete(data: any): boolean {
    if (!data || !data.type) return false;
    switch (data.type) {
      case 'cloud': return !!(data.carrier_type && data.carrier_number);
      case 'business': return !!(data.vat_number && data.company_name);
      case 'donation': return !!(data.donation_code);
      default: return false;
    }
  }

  private _getDefaultDonationInvoiceData(recipientName: string = '顧客'): any {
      return {
        type: 'donation', donation_code: '111',
        recipient_name: recipientName, recipient_email: 'unknown@example.com'
      };
  }

  private async handleInvoiceError(invoiceId: string, error: any): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    this._log('ERROR', `處理發票時發生錯誤`, { invoiceId }, error);

    await this.supabase
      .from('invoices')
      .update({ status: 'failed', error_message: errorMessage })
      .eq('id', invoiceId);
  }
}