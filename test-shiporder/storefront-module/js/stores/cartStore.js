// 檔案路徑: storefront-module/js/stores/cartStore.js
// 版本：2.0 (架構核心版)
// 職責：【購物車狀態實例 (Instance)】。應用程式中唯一的、權威的購物車
//       「中央狀態儲存庫」。它透過導入 `createStore` 工廠函式來建立自己。
import { createStore } from '../core/createStore.js';
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
    anonymousUserId: null,
    anonymousToken: null,
};
export const cartStore = createStore(initialState);