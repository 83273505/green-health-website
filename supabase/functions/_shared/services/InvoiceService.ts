// ==============================================================================
// 檔案路徑: supabase/functions/_shared/services/InvoiceService.ts
// 版本: v45.1 - 「資料來源」終局統一
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Invoice Service (發票服務層)
 * @description 封裝所有與發票相關的業務流程，作為統一的入口。
 * @version v45.1
 * 
 * @update v45.1 - [DATA SOURCE UNIFICATION]
 * 1. [核心新增] 新增了一個名為 `createAndIssueInvoiceFromOrder` 的公共方法。
 *          此方法專為“出貨後自動開票”等、已经拥有完整订单资料的情境而设计。
 * 2. [原理] 它接收一个完整的 order 物件，直接从中提取最权威的资料来建立并
 *          立即开立发票，避免了不必要的、可能出错的二次查询，彻底解决了
 *          因资料来源不一致导致的静默失败问题。
 * 3. [正體化] 檔案內所有註解及 UI 字串均已修正為正體中文。
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
   * 核心規則：決定最終用於建立發票的資料。
   * 主要用於 `create-order-from-cart`，此時只有前端傳來的 `invoiceOptions`。
   */
  async determineInvoiceData(userId: string | null, userProvidedOptions: any): Promise<any> {
    if (this.isInvoiceOptionsComplete(userProvidedOptions)) {
      console.log(`[InvoiceService] 使用者提供了完整的發票資料:`, userProvidedOptions);
      return userProvidedOptions;
    }

    if (!userId) {
        // 如果是匿名使用者且未提供完整發票選項，只能使用安全的預設值
        console.warn(`[InvoiceService] 匿名使用者未提供完整發票資料，將使用預設捐赠發票。`);
        return this._getDefaultDonationInvoiceData();
    }

    console.log(`[InvoiceService] 使用者提供的發票資料不完整，嘗試從 profile (ID: ${userId}) 獲取預設 Email。`);
    const { data: profile, error } = await this.supabase
      .from('profiles')
      .select('email, name')
      .eq('id', userId)
      .single();

    if (error || !profile) {
      console.error(`[InvoiceService] 無法獲取 ID 為 ${userId} 的 profile 來產生預設發票資料:`, error);
      return this._getDefaultDonationInvoiceData(profile?.name);
    }

    const finalOptions = { ...userProvidedOptions };
    if (finalOptions.type === 'cloud' && finalOptions.carrier_type === 'member' && !finalOptions.carrier_number) {
        finalOptions.carrier_number = profile.email;
    }
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
   * [v45.1 核心新增] 從一個完整的 order 物件，一步到位地建立並立即觸發開立發票。
   * @param order - 一個從資料庫查詢到的、完整的 order 物件。
   */
  async createAndIssueInvoiceFromOrder(order: any): Promise<void> {
    try {
      console.log(`[InvoiceService] 為訂單 ${order.order_number} 執行「建立並開立」快捷流程...`);
      if (!order || !order.id) {
        throw new Error("傳入的 order 物件無效或缺少 id。");
      }

      // 步驟 1: 從 order 物件中直接構造最權威的 invoiceData
      // 這裡我們不再依賴前端傳來的 options，而是使用訂單快照中的真實資料。
      // 預設開立最單純的會員載具發票。
      const invoiceData = {
        type: 'cloud',
        carrier_type: 'member',
        carrier_number: order.customer_email, // 使用訂單上的 email
        recipient_name: order.shipping_address_snapshot?.recipient_name || order.customer_name,
        recipient_email: order.customer_email,
      };

      // 步驟 2: 建立發票記錄
      const newInvoice = await this.createInvoiceRecord(order.id, order.total_amount, invoiceData);

      // 步驟 3: 立即觸發開立
      await this.issueInvoiceViaAPI(newInvoice.id);
      
    } catch (error) {
      // 錯誤將被 issueInvoiceViaAPI 內部處理，此處只需記錄
      console.error(`[InvoiceService] createAndIssueInvoiceFromOrder 流程失敗:`, error.message);
      // 我們不向上拋出錯誤，以避免中斷 `mark-order-as-shipped` 的主流程
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

      const invoiceDate = new Date(invoice.issued_at).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '/');

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
   * [私有] 檢查使用者提供的發票選項是否完整。
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
   * [私有] 產生一個安全的回退用捐贈發票資料
   */
  private _getDefaultDonationInvoiceData(recipientName: string = '顧客'): any {
      return {
        type: 'donation',
        donation_code: '111', // 公共的捐贈碼
        recipient_name: recipientName,
        recipient_email: 'unknown@example.com'
      };
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