// 檔案路徑: storefront-module/js/stores/cartStore.js
// ==============================================================================

/**
 * 檔案名稱：cartStore.js
 * 檔案職責：【購物車狀態實例 (Instance)】。此檔案是應用程式中唯一的、權威的
 *           購物車「中央狀態儲存庫」。它透過導入位於 `../core/stores.js` 的
 *           `createStore` 工廠函式來建立自己。
 * 版本：1.1 (註解強化版)
 * AI 註記：
 * - [架構澄清]: 為了解決命名混淆，特此註明此檔案的「實例」角色，並澄清
 *   其對 `../core/stores.js` 的依賴是正確且符合設計的。
 * 更新日誌 (Changelog):
 * - v1.1 (2025-09-13): 根據主席指示，新增架構性職責說明註解。
 */
import { createStore } from '../core/stores.js';
const initialState = {
    cartId: null,
    items: [],
    itemCount: 0,
    summary: { subtotal: 0, couponDiscount: 0, shippingFee: 0, total: 0 },
    appliedCoupon: null,
    availableShippingMethods: [],
    selectedShippingMethodId: null,
    shippingInfo: { freeShippingThreshold: 0, amountNeededForFreeShipping: 0 },
    isLoading: true,
    isAnonymous: false,
    isReadyForRender: false,
};
export const cartStore = createStore(initialState);