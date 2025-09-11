// 檔案路徑: storefront-module/js/core/stores.js
/**
 * 檔案名稱：stores.js
 * 檔案職責：實現一個原生的、極簡的、靈感來自 Nano Stores 的狀態管理器。
 * 版本：1.0
 * AI 註記：
 * - 此為一個全新的核心檔案，旨在實現前端狀態的「中心化管理」。
 * - [操作指示]: 請在 `storefront-module/js/core/` 目錄下，建立這個新檔案。
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