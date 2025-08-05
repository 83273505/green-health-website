// ==============================================================================
// 檔案路徑: supabase/functions/_shared/services/InvoiceService.ts
// ------------------------------------------------------------------------------
// 【發票核心服務】
// ------------------------------------------------------------------------------
// 此服務封裝了所有與發票相關的商業邏輯，供不同的 Edge Functions 調用。
// ==============================================================================

import { createClient } from '../deps.ts'; // 從我們統一的依賴中心引入

// 定義一個 SupabaseClient 的類型，方便在類別中使用
type SupabaseClient = ReturnType<typeof createClient>;

export class InvoiceService {
  private supabase: SupabaseClient;

  constructor(supabaseClient: SupabaseClient) {
    this.supabase = supabaseClient;
  }

  /**
   * 核心規則：決定最終用於建立發票的資料。
   * 1. 如果使用者在前端有明確填寫發票選項，則優先使用。
   * 2. 如果使用者未填寫，則自動抓取會員的個人資料作為預設值。
   * @param userId - 當前操作的使用者 ID
   * @param userProvidedOptions - 從前端結帳頁面傳來的 invoiceOptions 物件
   * @returns {Promise<object>} - 一個格式化後的、準備寫入資料庫的發票資料物件
   */
  async determineInvoiceData(userId: string, userProvidedOptions: any): Promise<any> {
    // 檢查使用者提供的選項是否有效且完整
    if (this.isInvoiceOptionsComplete(userProvidedOptions)) {
      console.log(`[InvoiceService] 使用者提供了發票資料:`, userProvidedOptions);
      return userProvidedOptions;
    }

    // 如果使用者未提供，則從 profiles 表中獲取預設資料
    console.log(`[InvoiceService] 使用者未提供發票資料，從 profile (ID: ${userId}) 獲取預設值。`);
    const { data: profile, error } = await this.supabase
      .from('profiles')
      .select('name, email') // 只選取需要的欄位
      .eq('id', userId)
      .single();

    if (error || !profile) {
      console.error(`[InvoiceService] 無法獲取 ID 為 ${userId} 的 profile 來產生預設發票資料:`, error);
      // 在最壞的情況下，也回傳一個基礎結構，避免後續流程出錯
      return {
        type: 'cloud',
        carrier_type: 'member',
        carrier_number: 'unknown@email.com', // 降級處理
        recipient_name: '顧客',
        recipient_email: 'unknown@email.com'
      };
    }

    // 基於會員資料，生成一個預設的「會員載具」發票選項
    return {
      type: 'cloud',
      carrier_type: 'member',
      carrier_number: profile.email,
      recipient_name: profile.name,
      recipient_email: profile.email
    };
  }

  /**
   * 在 `invoices` 表中建立一筆新的、狀態為 'pending' 的發票記錄。
   * @param orderId - 關聯的訂單 ID
   * @param orderTotalAmount - 訂單總金額
   * @param invoiceData - 經過 determineInvoiceData 處理後的發票資料
   * @returns {Promise<object>} - 新建立的發票記錄
   */
  async createInvoiceRecord(orderId: string, orderTotalAmount: number, invoiceData: any): Promise<any> {
    console.log(`[InvoiceService] 為訂單 ID ${orderId} 建立發票記錄...`);

    const { data: newInvoice, error } = await this.supabase
      .from('invoices')
      .insert({
        order_id: orderId,
        type: invoiceData.type,
        status: 'pending', // 初始狀態為待開立
        
        recipient_name: invoiceData.recipient_name,
        recipient_email: invoiceData.recipient_email,
        vat_number: invoiceData.vat_number || null,
        company_name: invoiceData.company_name || null,
        carrier_type: invoiceData.carrier_type || null,
        carrier_number: invoiceData.carrier_number || null,
        donation_code: invoiceData.donation_code || null,
        
        total_amount: orderTotalAmount, // 從訂單總額快照
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
   * @param data - 從前端傳來的 invoiceOptions 物件
   * @returns {boolean}
   */
  private isInvoiceOptionsComplete(data: any): boolean {
    if (!data || !data.type) return false;
    
    // 根據不同發票類型，檢查是否包含最基本的必要欄位
    switch (data.type) {
      case 'cloud':
        return !!(data.carrier_type && data.carrier_number);
      case 'business':
        return !!(data.vat_number && data.company_name);
      case 'donation':
        return !!(data.donation_code);
      default:
        return false;
    }
  }

  // Phase 3 將在此處新增 issueInvoice, voidInvoice 等方法...
}