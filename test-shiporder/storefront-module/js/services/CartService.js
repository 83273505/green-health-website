// 檔案路徑: storefront-module/js/services/CartService.js
// ==============================================================================

/**
 * 檔案名稱：CartService.js
 * 檔案職責：處理所有與後端購物車 API 的通信，並在成功後更新中央狀態儲存 (cartStore)。
 * 版本：1.3 (持久化強化版)
 * AI 註記：
 * - [核心修正]: 根據系統性重構計畫，新增了 `syncStateToLocalStorage` 和 `clearCartAndState`
 *   兩個核心的內部函式。前者負責將 `cartStore` 中的最新狀態可靠地寫入
 *   `localStorage`；後者則統一了清除所有本地狀態的邏輯。
 *   `_recalculateCart` 在成功後會自動呼叫同步函式，確保了狀態的持久化。
 * 更新日誌 (Changelog):
 * - v1.3 (2025-09-13): 增加並強化了與 localStorage 同步的邏輯。
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

// [核心修正] 新增集中的狀態同步函式
function _syncStateToLocalStorage() {
    try {
        const state = cartStore.get();
        if (state.cartId) {
            localStorage.setItem('cartId', state.cartId);
        } else {
            localStorage.removeItem('cartId');
        }
        
        if (state.appliedCoupon?.code) {
            localStorage.setItem('appliedCouponCode', state.appliedCoupon.code);
        } else {
            localStorage.removeItem('appliedCouponCode');
        }

        if (state.selectedShippingMethodId) {
            localStorage.setItem('selectedShippingMethodId', state.selectedShippingMethodId);
        } else {
            localStorage.removeItem('selectedShippingMethodId');
        }
        
        if (state.isAnonymous && state.anonymousUserId && state.anonymousToken) {
            localStorage.setItem('anonymous_user_id', state.anonymousUserId);
            localStorage.setItem('anonymous_token', state.anonymousToken);
        } else {
            localStorage.removeItem('anonymous_user_id');
            localStorage.removeItem('anonymous_token');
        }
    } catch (error) {
        console.error("同步購物車狀態至 localStorage 失敗:", error);
    }
}

// [核心修正] 新增集中的狀態清除函式
function _clearCartAndState() {
    try {
        localStorage.removeItem('cartId');
        localStorage.removeItem('appliedCouponCode');
        localStorage.removeItem('selectedShippingMethodId');
        localStorage.removeItem('anonymous_user_id');
        localStorage.removeItem('anonymous_token');
        
        cartStore.set({
            cartId: null, items: [], itemCount: 0,
            summary: { subtotal: 0, couponDiscount: 0, shippingFee: 0, total: 0 },
            appliedCoupon: null, availableShippingMethods: [], selectedShippingMethodId: null,
            shippingInfo: { freeShippingThreshold: 0, amountNeededForFreeShipping: 0 },
            isLoading: false, isAnonymous: false, isReadyForRender: false,
        });
        console.log('🛒 購物車本地與記憶體狀態已完全清除。');
    } catch (error) {
        console.error('清除購物車狀態時發生錯誤:', error);
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
    // [核心修正] 每次從後端成功更新狀態後，都同步到 localStorage
    _syncStateToLocalStorage();
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
        syncStateToLocalStorage: _syncStateToLocalStorage,
        clearCartAndState: _clearCartAndState,
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