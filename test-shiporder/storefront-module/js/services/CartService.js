// 檔案路徑: storefront-module/js/services/CartService.js
// ==============================================================================

/**
 * 檔案名稱：CartService.js
 * 檔案職責：處理所有與後端購物車 API 的通信，並在成功後更新中央狀態儲存 (cartStore)。
 * 版本：1.1 (正名修正版)
 * AI 註記：
 * - [核心修正]: 根據主席的最終指示，將此檔案的核心導出常數，從 `cartService`
 *   (小寫 c) 更正為 `CartService` (大寫 C)。此修正旨在解決因命名不一致
 *   而導致的 Uncaught SyntaxError，並使導出名與檔名保持一致。
 * 更新日誌 (Changelog)：
 * - v1.1 (2025-09-13)：修正 export 常數的大小寫，以匹配全專案的導入期望。
 */
import { supabase } from '../core/supabaseClient.js';
import { showNotification } from '../core/utils.js';
import { cartStore } from '../stores/cartStore.js';

const INVOKE_TIMEOUT = 10000;

class CartAPIError extends Error {
    constructor(message, code) {
        super(message);
        this.name = 'CartAPIError';
        this.code = code;
    }
}

async function invokeWithTimeout(functionName, options = {}) {
    const client = await supabase;
    if (!client) throw new Error('Supabase client not initialized.');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), INVOKE_TIMEOUT);
    try {
        const result = await client.functions.invoke(functionName, { ...options, signal: controller.signal });
        clearTimeout(timeoutId);
        return result;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') { throw new Error(`對 ${functionName} 的請求已逾時 (${INVOKE_TIMEOUT / 1000} 秒)。`); }
        throw error;
    }
}

function _updateStateFromSnapshot(snapshot) {
    if (!snapshot) return;
    const currentState = cartStore.get();
    cartStore.set({
        ...currentState,
        items: snapshot.items || [],
        itemCount: snapshot.itemCount || 0,
        summary: snapshot.summary || currentState.summary,
        appliedCoupon: snapshot.appliedCoupon || null,
        shippingInfo: snapshot.shippingInfo || currentState.shippingInfo,
    });
}

async function _recalculateCart(payload) {
    const currentState = cartStore.get();
    if (currentState.isLoading) return;
    cartStore.set({ ...currentState, isLoading: true });

    try {
        const { data: response, error } = await invokeWithTimeout('recalculate-cart', { body: { cartId: currentState.cartId, ...payload } });
        if (error) throw error;
        
        if (response.success === false) {
            const backendError = response.error;
            const apiError = new CartAPIError(backendError.message, backendError.code);
            console.warn(`後端業務錯誤: ${backendError.message}`);
            showNotification(backendError.message, 'warning');
            if (response.data) {
                _updateStateFromSnapshot(response.data);
            }
            throw apiError;
        } else {
            if (payload.shippingMethodId !== undefined) {
                const updatedState = cartStore.get();
                cartStore.set({ ...updatedState, selectedShippingMethodId: payload.shippingMethodId });
            }
            _updateStateFromSnapshot(response.data);
        }
    } catch (error) {
        if (!(error instanceof CartAPIError)) {
            console.error('更新購物車失敗:', error);
            const userMessage = error.message.includes('逾時') ? '購物車連線逾時，請檢查您的網路環境後重試。' : (error.message || '購物車更新失敗，請重試。');
            showNotification(userMessage, 'error');
        }
        throw error;
    } finally {
        const finalState = cartStore.get();
        cartStore.set({ ...finalState, isLoading: false });
    }
}

export const CartService = {
    async addItem({ variantId, quantity }) {
        if (!variantId || !(quantity > 0)) {
            showNotification('無效的商品或數量。', 'error');
            return;
        }
        try {
            await _recalculateCart({
                actions: [{ type: 'ADD_ITEM', payload: { variantId, quantity } }],
                couponCode: cartStore.get().appliedCoupon?.code,
                shippingMethodId: cartStore.get().selectedShippingMethodId
            });
            showNotification('商品已加入購物車！', 'success');
        } catch (error) {
            console.log("addItem 捕捉到來自後端的業務錯誤，已處理。");
        }
    },
    async updateItemQuantity(itemId, newQuantity) {
        if (!itemId || newQuantity < 0) return Promise.reject(new Error("無效的參數"));
        return _recalculateCart({
            actions: [{ type: 'UPDATE_ITEM_QUANTITY', payload: { itemId, newQuantity } }],
            couponCode: cartStore.get().appliedCoupon?.code,
            shippingMethodId: cartStore.get().selectedShippingMethodId
        });
    },
    async removeItem(itemId) {
        if (!itemId) return;
        try {
            await _recalculateCart({
                actions: [{ type: 'REMOVE_ITEM', payload: { itemId } }],
                couponCode: cartStore.get().appliedCoupon?.code,
                shippingMethodId: cartStore.get().selectedShippingMethodId
            });
            showNotification('商品已從購物車移除。', 'info');
        } catch (error) {
             console.log("removeItem 捕捉到來自 _recalculateCart 的錯誤，已處理。");
        }
    },
    async applyCoupon(couponCode) {
        if (typeof couponCode !== 'string') return;
        try {
            await _recalculateCart({ couponCode: couponCode.trim(), shippingMethodId: cartStore.get().selectedShippingMethodId });
        } catch(error) {
             console.log("applyCoupon 捕捉到來自 _recalculateCart 的錯誤，已處理。");
        }
    },
    async selectShippingMethod(shippingMethodId) {
        try {
            await _recalculateCart({ shippingMethodId, couponCode: cartStore.get().appliedCoupon?.code });
        } catch(error) {
             console.log("selectShippingMethod 捕捉到來自 _recalculateCart 的錯誤，已處理。");
        }
    },
    
    subscribe(callback) {
        return cartStore.subscribe(callback);
    },
    getState() {
        return cartStore.get();
    },

    internal: {
        invokeWithTimeout,
        recalculateCart: _recalculateCart,
        syncStateToLocalStorage: function() { /* Placeholder for future implementation */ },
        clearCartAndState: function() { /* Placeholder for future implementation */ },
        async fetchShippingMethods() {
            try {
                const client = await supabase;
                const { data, error } = await client.from('shipping_rates').select('*').eq('is_active', true).order('display_order', { ascending: true });
                if (error) throw error;
                const currentState = cartStore.get();
                cartStore.set({ ...currentState, availableShippingMethods: data || [] });
            } catch (error) {
                console.error('獲取運送方式失敗:', error);
                const currentState = cartStore.get();
                cartStore.set({ ...currentState, availableShippingMethods: [] });
            }
        }
    }
};