// ==============================================================================
// 檔案路徑: supabase/functions/_shared/services/InvoiceService.ts
// 版本: v46.1 - 作廢日期格式加固 (穩定性提升版)
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Invoice Service (發票服務層)
 * @description 封裝所有與發票相關的業務流程，作為統一的入口。
 * @version v46.1
 * 
 * @update v46.1 - [VOID INVOICE DATE FORMATTING FIX]
 * 1. [核心加固] `voidInvoiceViaAPI` 函式中產生 `invoiceDate` 的方式被重構。
 *          放棄了依賴執行環境的 `toLocaleDateString`，改為手動、明確地
 *          建構 `YYYY/MM/DD` 格式的字串。
 * 2. [原理] 此修改確保了傳遞給速買配作廢 API 的日期格式，在任何伺服器
 *          環境下都保持絕對一致，消除了潛在的因環境差異導致的作廢失敗風險。
 * 3. [正體化] 修正檔案內所有殘留的簡體中文註解與字詞。
 */

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
   * [v46.0 核心重構] 決定最終用於建立發票的資料，能智慧區分會員與匿名訂單。
   * @param order - 剛在資料庫中建立的、完整的 newOrder 物件。
   * @param userProvidedOptions - 使用者在前端結帳時選擇的發票選項。
   */
  async determineInvoiceData(order: any, userProvidedOptions: any): Promise<any> {
    if (this.isInvoiceOptionsComplete(userProvidedOptions)) {
      console.log(`[InvoiceService] 使用者提供了完整的發票資料，直接使用:`, userProvidedOptions);
      return userProvidedOptions;
    }
    
    // 檢查訂單關聯的使用者是否為正式會員
    const userIsRealMember = order.user_id && !order.is_anonymous; // 假設 is_anonymous 標誌會被傳遞

    if (userIsRealMember) {
      // --- 正式會員邏輯：嘗試從 profiles 表補全資料 ---
      console.log(`[InvoiceService] 正式會員 (ID: ${order.user_id}) 未提供完整發票資料，嘗試從 profiles 補全。`);
      const { data: profile, error } = await this.supabase
        .from('profiles')
        .select('email, name')
        .eq('id', order.user_id)
        .single();

      if (!error && profile) {
        const finalOptions = { ...userProvidedOptions };
        if (finalOptions.type === 'cloud' && finalOptions.carrier_type === 'member' && !finalOptions.carrier_number) {
            finalOptions.carrier_number = profile.email;
        }
        finalOptions.recipient_name = profile.name || order.customer_name;
        finalOptions.recipient_email = profile.email || order.customer_email;
        
        console.log(`[InvoiceService] 已從 profiles 補全發票資料:`, finalOptions);
        return finalOptions;
      }
      console.error(`[InvoiceService] 無法獲取 ID 為 ${order.user_id} 的 profile 來補全資料:`, error);
    }
    
    // --- 匿名/訪客訂單邏輯 或 會員 profile 查詢失敗的備援邏輯 ---
    // 直接從訂單快照中提取最權威的資料
    console.log(`[InvoiceService] 匿名/訪客訂單或會員 profile 查詢失敗，從訂單快照中提取資料。`);
    const finalOptions = { ...userProvidedOptions };
    finalOptions.recipient_name = order.shipping_address_snapshot?.recipient_name || order.customer_name;
    finalOptions.recipient_email = order.customer_email;
    if (finalOptions.type === 'cloud' && finalOptions.carrier_type === 'member' && !finalOptions.carrier_number) {
        finalOptions.carrier_number = order.customer_email;
    }
    
    // 如果連訂單快照都沒有 email，則使用最終的安全備援
    if (!finalOptions.recipient_email) {
        console.warn(`[InvoiceService] 訂單快照中也缺少 Email，將使用預設捐贈發票。`);
        return this._getDefaultDonationInvoiceData(finalOptions.recipient_name);
    }

    console.log(`[InvoiceService] 已從訂單快照補全發票資料:`, finalOptions);
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

  async createAndIssueInvoiceFromOrder(order: any): Promise<void> {
    try {
      console.log(`[InvoiceService] 為訂單 ${order.order_number} 執行「建立並開立」快捷流程...`);
      if (!order || !order.id) {
        throw new Error("傳入的 order 物件無效或缺少 id。");
      }
      
      const invoiceData = {
        type: 'cloud',
        carrier_type: 'member',
        carrier_number: order.customer_email,
        recipient_name: order.shipping_address_snapshot?.recipient_name || order.customer_name,
        recipient_email: order.customer_email,
      };
      
      const newInvoice = await this.createInvoiceRecord(order.id, order.total_amount, invoiceData);
      
      await this.issueInvoiceViaAPI(newInvoice.id);
      
    } catch (error) {
      console.error(`[InvoiceService] createAndIssueInvoiceFromOrder 流程失敗:`, error.message);
      throw error; 
    }
  }
  
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

      // [v46.1 核心加固] 手動建構穩定的日期格式，避免環境差異
      const issuedDate = new Date(invoice.issued_at);
      const year = issuedDate.getFullYear();
      const month = String(issuedDate.getMonth() + 1).padStart(2, '0');
      const day = String(issuedDate.getDate()).padStart(2, '0');
      const invoiceDate = `${year}/${month}/${day}`; // 確保為 YYYY/MM/DD

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
        type: 'donation',
        donation_code: '111',
        recipient_name: recipientName,
        recipient_email: 'unknown@example.com'
      };
  }

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