// ==============================================================================
// 檔案路徑: supabase/functions/_shared/utils/NumberToTextHelper.ts
// ------------------------------------------------------------------------------
// 【輕量級數值轉文字工具類】
// ==============================================================================
// 此工具類專門解決將 JavaScript number 類型放入郵件模板時，
// 可能因序列化問題導致顯示為空值的問題。

export class NumberToTextHelper {
  /**
   * 安全地將任何值轉換為字串。
   * 這是最基礎的轉換，確保不會是 null 或 undefined。
   * @param value - 任何類型的值
   * @returns {string} - 轉換後的字串
   */
  static safeToString(value: any): string {
    if (value === null || value === undefined) return '0';
    return String(value);
  }

  /**
   * 將數值格式化為用於郵件顯示的台幣金額字串。
   * @param value - 任何類型的值
   * @returns {string} - 例如: "NT$ 1,280"
   */
  static formatMoney(value: any): string {
    // 先用 safeToString 確保我們得到的是一個合法的字串
    const stringValue = this.safeToString(value);
    const numberValue = parseFloat(stringValue);

    if (isNaN(numberValue)) {
      console.warn(`[NumberToTextHelper] formatMoney 無法解析值: ${value}`);
      return 'NT$ 金額錯誤';
    }
    
    // 使用 Intl.NumberFormat 進行標準的貨幣格式化
    return `NT$ ${numberValue.toLocaleString('zh-TW', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`;
  }
}