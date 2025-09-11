// 檔案路徑: storefront-module/js/stores/cartStore.js
/**
 * 檔案名稱：cartStore.js
 * 檔案職責：定義並匯出唯一的、權威的購物車「中央狀態儲存 (Store)」。
 * 版本：1.0
 * AI 註記：
 * - 此為一個全新的檔案，其命名遵循主席團關於「消除同名檔案混淆」的指令。
 * - [操作指示]: 請在 `storefront-module/js/` 目錄下，建立一個新的 `stores` 資料夾，並將此檔案儲存於其中。
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