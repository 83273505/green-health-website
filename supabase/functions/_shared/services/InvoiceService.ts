// ==============================================================================
// 檔案路徑: supabase/functions/_shared/services/InvoiceService.ts
// 版本: v32.4 - 後端匿名容錯 (體驗修正)
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

import { createClient } from '../deps.ts';
import { SmilePayInvoiceAdapter } from '../adapters/SmilePayInvoiceAdapter.ts';

type SupabaseClient = ReturnType<typeof createClient>;

export class InvoiceService {
  private supabase: SupabaseClient;
  private smilePayAdapter: SmilePayInvoiceAdapter;

  constructor(supabaseClient: SupabaseClient) {
    this.supabase = supabaseClient;
    this.smilePayAdapter = new SmilePayInvoiceAdapter();
  }

  /**
   * 【核心修正】核心規則：決定最終用於建立發票的資料。
   * 此方法不再依賴 profiles 表，而是直接信任前端傳遞的 invoiceOptions。
   * 這使得函式能夠同時處理會員和匿名訪客的訂單。
   */
  async determineInvoiceData(userId: string, userProvidedOptions: any): Promise<any> {
    // 檢查使用者是否明確提供了完整的發票資訊
    if (this.isInvoiceOptionsComplete(userProvidedOptions)) {
      console.log(`[InvoiceService] 使用者提供了完整的發票資料:`, userProvidedOptions);
      return userProvidedOptions;
    }

    // 如果使用者沒有提供完整資訊（例如，只選了預設的會員載具），
    // 我們需要從 profiles 表中查詢 email 來補全資料。
    console.log(`[InvoiceService] 使用者提供的發票資料不完整，嘗試從 profile (ID: ${userId}) 獲取預設 Email。`);
    const { data: profile, error } = await this.supabase
      .from('profiles')
      .select('email, name') // 同時獲取姓名作為備援
      .eq('id', userId)
      .single();

    if (error || !profile) {
      console.error(`[InvoiceService] 無法獲取 ID 為 ${userId} 的 profile 來產生預設發票資料:`, error);
      // 在最壞的情況下，提供一個安全的預設值，確保訂單流程能繼續
      return {
        type: 'donation', // 預設捐贈
        donation_code: '111', // 公共的捐贈碼
        recipient_name: '顧客',
        recipient_email: 'unknown@example.com'
      };
    }

    // 將查詢到的 email 填入使用者選項中，並回傳
    const finalOptions = { ...userProvidedOptions };
    if (finalOptions.type === 'cloud' && finalOptions.carrier_type === 'member' && !finalOptions.carrier_number) {
        finalOptions.carrier_number = profile.email;
    }
    // 補全收件人姓名和 email
    finalOptions.recipient_name = profile.name || '顧客';
    finalOptions.recipient_email = profile.email;
    
    console.log(`[InvoiceService] 已補全發票資料:`, finalOptions);
    return finalOptions;
  }

  /**
   * 在 `invoices` 表中建立一筆新的、狀態為 'pending' 的發票記錄。
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
   * [私有輔助函式] 檢查使用者提供的發票選項是否完整。
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

  /**
   * 透過 API 開立發票
   */
  async issueInvoiceViaAPI(invoiceId: string): Promise<void> {
    try {
      console.log(`[InvoiceService] 開始為 Invoice ID ${invoiceId} 開立發票...`);
      const { data: invoice, error: fetchError } = await this.supabase
        .from('invoices')
        .select(`*, orders(*, order_items(*, product_variants(name)))`)
        .eq('id', invoiceId)
        .single();

      if (fetchError || !invoice) {
        throw new Error(`找不到 Invoice ID ${invoiceId} 或其關聯訂單的資料。`);
      }
      
      const result = await this.smilePayAdapter.issueInvoice(invoice);

      await this.supabase
        .from('invoices')
        .update({
          status: 'issued',
          invoice_number: result.invoiceNumber,
          api_response: result.apiResponse,
          issued_at: new Date().toISOString(),
          error_message: null
        })
        .eq('id', invoiceId);

      console.log(`[InvoiceService] Invoice ID ${invoiceId} 成功開立，發票號碼: ${result.invoiceNumber}`);

    } catch (error) {
      await this.handleInvoiceError(invoiceId, error);
      throw error;
    }
  }
  
  /**
   * 透過 API 作廢發票
   */
  async voidInvoiceViaAPI(invoiceId: string, reason: string): Promise<void> {
    try {
      console.log(`[InvoiceService] 開始為 Invoice ID ${invoiceId} 作廢發票...`);
      const { data: invoice } = await this.supabase
        .from('invoices')
        .select('invoice_number, issued_at')
        .eq('id', invoiceId)
        .single();
      
      if (!invoice?.invoice_number || !invoice.issued_at) {
        throw new Error('發票號碼不存在或發票尚未開立，無法作廢。');
      }

      const invoiceDate = new Date(invoice.issued_at).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });

      const result = await this.smilePayAdapter.voidInvoice(invoice.invoice_number, invoiceDate, reason);

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
   */
  private async handleInvoiceError(invoiceId: string, error: any): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[InvoiceService] 處理 Invoice ID ${invoiceId} 時發生錯誤:`, errorMessage);

    await this.supabase
      .from('invoices')
      .update({
        status: 'failed',
        error_message: errorMessage
      })
      .eq('id', invoiceId);
  }
}