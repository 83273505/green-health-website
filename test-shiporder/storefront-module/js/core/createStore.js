// 檔案路徑: storefront-module/js/core/createStore.js
// 版本：1.2 (正名重構版)
// 職責：【狀態管理器工廠 (Factory)】。提供一個名為 `createStore` 的通用函式，
//       如同一個「藍圖」，可用於創建任何類型的、獨立的狀態管理器實例。
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