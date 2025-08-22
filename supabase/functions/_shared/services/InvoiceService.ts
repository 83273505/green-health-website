// ==============================================================================
// 檔案路徑: supabase/functions/_shared/services/InvoiceService.ts
// 版本: v46.0 - 「資料來源」終局分離 (最终决定版)
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Invoice Service (發票服務層)
 * @description 封裝所有與發票相關的業務流程，作為統一的入口。
 * @version v46.0
 * 
 * @update v46.0 - [DATA SOURCE SEPARATION & FINAL FIX]
 * 1. [核心重構] `determineInvoiceData` 函式的參數和内部逻辑被彻底重构。
 *          它不再接收 `userId`，而是接收完整的 `order` 物件。
 * 2. [原理] 新的逻辑会检查 `order` 物件中的使用者是否为匿名。
 *          - 如果是正式会员，它会如常查询 `profiles` 表以获取最权威的会员资料。
 *          - 如果是匿名或访客订单，它将直接从 `order` 物件自身的快照中
 *            (customer_email, shipping_address_snapshot) 提取资料。
 * 3. [架构纯化] 此修改彻底分离了会员与非会员的资料来源，回归了 `profiles` 表
 *          只服务于正式会员的设计初衷，解决了资料污染和逻辑混乱的问题。
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
   * [v46.0 核心重構] 决定最终用于建立发票的资料，能智慧区分会员与匿名订单。
   * @param order - 刚刚在资料库中建立的、完整的 newOrder 物件。
   * @param userProvidedOptions - 使用者在前端结帐时选择的发票选项。
   */
  async determineInvoiceData(order: any, userProvidedOptions: any): Promise<any> {
    if (this.isInvoiceOptionsComplete(userProvidedOptions)) {
      console.log(`[InvoiceService] 使用者提供了完整的發票資料，直接使用:`, userProvidedOptions);
      return userProvidedOptions;
    }
    
    // 检查订单关联的使用者是否为正式会员
    const userIsRealMember = order.user_id && !order.is_anonymous; // 假设 is_anonymous 标志会被传递

    if (userIsRealMember) {
      // --- 正式会员逻辑：尝试从 profiles 表补全资料 ---
      console.log(`[InvoiceService] 正式会员 (ID: ${order.user_id}) 未提供完整發票資料，尝试从 profiles 补全。`);
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
        
        console.log(`[InvoiceService] 已从 profiles 补全發票資料:`, finalOptions);
        return finalOptions;
      }
      console.error(`[InvoiceService] 无法获取 ID 为 ${order.user_id} 的 profile 来补全资料:`, error);
    }
    
    // --- 匿名/访客订单逻辑 或 会员 profile 查询失败的备援逻辑 ---
    // 直接从订单快照中提取最权威的资料
    console.log(`[InvoiceService] 匿名/访客订单或会员 profile 查询失败，从订单快照中提取资料。`);
    const finalOptions = { ...userProvidedOptions };
    finalOptions.recipient_name = order.shipping_address_snapshot?.recipient_name || order.customer_name;
    finalOptions.recipient_email = order.customer_email;
    if (finalOptions.type === 'cloud' && finalOptions.carrier_type === 'member' && !finalOptions.carrier_number) {
        finalOptions.carrier_number = order.customer_email;
    }
    
    // 如果连订单快照都没有 email，则使用最终的安全备援
    if (!finalOptions.recipient_email) {
        console.warn(`[InvoiceService] 订单快照中也缺少 Email，将使用预设捐赠發票。`);
        return this._getDefaultDonationInvoiceData(finalOptions.recipient_name);
    }

    console.log(`[InvoiceService] 已从订单快照补全發票資料:`, finalOptions);
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