// ==============================================================================
// 檔案路徑: supabase/functions/_shared/services/InvoiceService.ts
// ------------------------------------------------------------------------------
// 【發票核心服務 - 完整更新版】
// ==============================================================================

import { createClient } from '../deps.ts';
// 【新增部分】引入速買配適配器
import { SmilePayInvoiceAdapter } from '../adapters/SmilePayInvoiceAdapter.ts';

type SupabaseClient = ReturnType<typeof createClient>;

export class InvoiceService {
  private supabase: SupabaseClient;
  // 【新增部分】宣告一個私有的 adapter 實例
  private smilePayAdapter: SmilePayInvoiceAdapter;

  constructor(supabaseClient: SupabaseClient) {
    this.supabase = supabaseClient;
    // 【新增部分】在建構函式中實例化 adapter
    this.smilePayAdapter = new SmilePayInvoiceAdapter();
  }

  /**
   * 核心規則：決定最終用於建立發票的資料。
   * (此方法維持不變)
   */
  async determineInvoiceData(userId: string, userProvidedOptions: any): Promise<any> {
    if (this.isInvoiceOptionsComplete(userProvidedOptions)) {
      console.log(`[InvoiceService] 使用者提供了發票資料:`, userProvidedOptions);
      return userProvidedOptions;
    }
    console.log(`[InvoiceService] 使用者未提供發票資料，從 profile (ID: ${userId}) 獲取預設值。`);
    const { data: profile, error } = await this.supabase
      .from('profiles')
      .select('name, email')
      .eq('id', userId)
      .single();
    if (error || !profile) {
      console.error(`[InvoiceService] 無法獲取 ID 為 ${userId} 的 profile 來產生預設發票資料:`, error);
      return {
        type: 'cloud', carrier_type: 'member', carrier_number: 'unknown@email.com',
        recipient_name: '顧客', recipient_email: 'unknown@email.com'
      };
    }
    return {
      type: 'cloud', carrier_type: 'member', carrier_number: profile.email,
      recipient_name: profile.name, recipient_email: profile.email
    };
  }

  /**
   * 在 `invoices` 表中建立一筆新的、狀態為 'pending' 的發票記錄。
   * (此方法維持不變)
   */
  async createInvoiceRecord(orderId: string, orderTotalAmount: number, invoiceData: any): Promise<any> {
    console.log(`[InvoiceService] 為訂單 ID ${orderId} 建立發票記錄...`);
    const { data: newInvoice, error } = await this.supabase
      .from('invoices')
      .insert({
        order_id: orderId,
        type: invoiceData.type,
        status: 'pending',
        recipient_name: invoiceData.recipient_name,
        recipient_email: invoiceData.recipient_email,
        vat_number: invoiceData.vat_number || null,
        company_name: invoiceData.company_name || null,
        carrier_type: invoiceData.carrier_type || null,
        carrier_number: invoiceData.carrier_number || null,
        donation_code: invoiceData.donation_code || null,
        total_amount: orderTotalAmount,
      })
      .select()
      .single();
    if (error) {
      console.error(`[InvoiceService] 建立發票記錄失敗 (訂單 ID: ${orderId}):`, error);
      throw new Error(`建立發票記錄時發生資料庫錯誤: ${error.message}`);
    }
    console.log(`[InvoiceService] 成功建立發票記錄 ID: ${newInvoice.id}`);
    return newInvoice;
  }
  
  /**
   * [私有輔助函式] 檢查使用者提供的發票選項是否有效。
   * (此方法維持不變)
   */
  private isInvoiceOptionsComplete(data: any): boolean {
    if (!data || !data.type) return false;
    switch (data.type) {
      case 'cloud': return !!(data.carrier_type && data.carrier_number);
      case 'business': return !!(data.vat_number && data.company_name);
      case 'donation': return !!(data.donation_code);
      default: return false;
    }
  }

  // --- 【新增部分】Phase 3 的核心方法 ---

  /**
   * 透過 API 開立發票
   * @param invoiceId - 要開立的發票記錄 ID
   */
  async issueInvoiceViaAPI(invoiceId: string): Promise<void> {
    try {
      console.log(`[InvoiceService] 開始為 Invoice ID ${invoiceId} 開立發票...`);
      // 1. 從資料庫獲取完整的發票與訂單資料
      const { data: invoice, error: fetchError } = await this.supabase
        .from('invoices')
        .select(`*, orders(*, order_items(*, product_variants(name)))`)
        .eq('id', invoiceId)
        .single();

      if (fetchError || !invoice) {
        throw new Error(`找不到 Invoice ID ${invoiceId} 或其關聯訂單的資料。`);
      }
      
      // 2. 呼叫適配器，將資料轉換並發送給速買配
      const result = await this.smilePayAdapter.issueInvoice(invoice);

      // 3. 更新本地發票記錄為 'issued'
      await this.supabase
        .from('invoices')
        .update({
          status: 'issued',
          invoice_number: result.invoiceNumber,
          api_response: result.apiResponse,
          issued_at: new Date().toISOString(),
          error_message: null // 清除舊的錯誤訊息
        })
        .eq('id', invoiceId);

      console.log(`[InvoiceService] Invoice ID ${invoiceId} 成功開立，發票號碼: ${result.invoiceNumber}`);

    } catch (error) {
      // 統一的錯誤處理
      await this.handleInvoiceError(invoiceId, error);
      // 將錯誤繼續向上拋出，讓呼叫者知道操作失敗
      throw error;
    }
  }
  
  /**
   * 透過 API 作廢發票
   * @param invoiceId - 要作廢的發票記錄 ID
   * @param reason - 作廢原因
   */
  async voidInvoiceViaAPI(invoiceId: string, reason: string): Promise<void> {
    try {
      console.log(`[InvoiceService] 開始為 Invoice ID ${invoiceId} 作廢發票...`);
      // 1. 獲取必要的發票資訊
      const { data: invoice } = await this.supabase
        .from('invoices')
        .select('invoice_number, issued_at')
        .eq('id', invoiceId)
        .single();
      
      if (!invoice?.invoice_number || !invoice.issued_at) {
        throw new Error('發票號碼不存在或發票尚未開立，無法作廢。');
      }

      // 格式化日期為速買配需要的 YYYY/MM/DD 格式
      const invoiceDate = new Date(invoice.issued_at).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });

      // 2. 呼叫適配器執行作廢
      const result = await this.smilePayAdapter.voidInvoice(invoice.invoice_number, invoiceDate, reason);

      // 3. 更新本地發票記錄為 'voided'
      await this.supabase
        .from('invoices')
        .update({
          status: 'voided',
          voided_at: new Date().toISOString(),
          void_reason: reason,
          api_response: result.apiResponse
        })
        .eq('id', invoiceId);
        
      console.log(`[InvoiceService] Invoice ID ${invoiceId} 已成功作廢。`);

    } catch (error) {
      await this.handleInvoiceError(invoiceId, error);
      throw error;
    }
  }

  /**
   * [私有] 統一的錯誤處理方法
   * @param invoiceId - 發生錯誤的發票 ID
   * @param error - 捕捉到的錯誤物件
   */
  private async handleInvoiceError(invoiceId: string, error: any): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[InvoiceService] 處理 Invoice ID ${invoiceId} 時發生錯誤:`, errorMessage);

    // 將發票狀態更新為 'failed' 並記錄錯誤訊息
    await this.supabase
      .from('invoices')
      .update({
        status: 'failed',
        error_message: errorMessage
      })
      .eq('id', invoiceId);
  }
}