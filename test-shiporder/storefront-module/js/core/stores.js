// 檔案路徑: storefront-module/js/core/stores.js
/**
 * 檔案名稱：stores.js
 * 檔案職責：實現一個原生的、極簡的、靈感來自 Nano Stores 的狀態管理器。
 * 版本：1.0
 * AI 註記：
 * - 此為一個全新的核心檔案，旨在實現前端狀態的「中心化管理」。
 * - `createStore` 函數創建了一個具備 `get()`, `set()`, `subscribe()` 方法的響應式物件。
 * - 這是我們解決「蜘蛛網式依賴」問題、實現「星型架構」的基石。
 * - [操作指示]: 請在 `storefront-module/js/core/` 目錄下，建立這個新檔案。
 */

/**
 * 創建一個簡單的、可訂閱的狀態儲存 (Store)。
 * @param {any} initialValue - 狀態的初始值。
 * @returns {{get: function(): any, set: function(any): void, subscribe: function(function): function}}
 */
export function createStore(initialValue) {
    let value = initialValue;
    const subscribers = new Set();

    return {
        /**
         * 獲取當前的狀態值。
         * @returns {any}
         */
        get() {
            return value;
        },

        /**
         * 設置新的狀態值，並通知所有訂閱者。
         * @param {any} newValue - 新的狀態值。
         */
        set(newValue) {
            if (value !== newValue) {
                value = newValue;
                subscribers.forEach(callback => callback(value));
            }
        },

        /**
         * 訂閱狀態的變更。
         * @param {function(any): void} callback - 當狀態變更時要執行的回呼函式。
         * @returns {function(): void} 一個可以取消此次訂閱的函式。
         */
        subscribe(callback) {
            subscribers.add(callback);
            callback(value); 
            return () => subscribers.delete(callback);
        }
    };
}