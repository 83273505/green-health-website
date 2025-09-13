// 檔案路徑: storefront-module/js/core/stores.js
// ==============================================================================

/**
 * 檔案名稱：stores.js
 * 檔案職責：【狀態管理器工廠 (Factory)】。此檔案不包含任何具體的應用程式狀態，
 *           其唯一職責是提供一個名為 `createStore` 的通用函式。
 *           此函式如同一個「藍圖」，可用於創建任何類型的、獨立的狀態管理器實例。
 * 版本：1.1 (註解強化版)
 * AI 註記：
 * - [架構澄清]: 為了解決與 cartStore.js 的命名混淆，特此註明此檔案的「工廠」角色。
 * 更新日誌 (Changelog):
 * - v1.1 (2025-09-13): 根據主席指示，新增架構性職責說明註解。
 */
export function createStore(initialValue) {
    let value = initialValue;
    const subscribers = new Set();
    return {
        get() {
            return value;
        },
        set(newValue) {
            if (value !== newValue) {
                value = newValue;
                subscribers.forEach(callback => callback(value));
            }
        },
        subscribe(callback) {
            subscribers.add(callback);
            callback(value);
            return () => subscribers.delete(callback);
        }
    };
}