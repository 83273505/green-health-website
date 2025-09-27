// 檔案路徑: storefront-module/js/services/CartService.js
// ==============================================================================
/**
 * 檔案名稱：CartService.js
 * 檔案職責：【v51.0 熔爐協議重構版】管理全站購物車的狀態、與後端 API 的所有交互。
 * 版本：51.0
 * SOP 條款對應：
 * - [SOP-CE 13] 競爭性熔爐協議
 * AI 註記：
 * 變更摘要:
 * - [核心邏輯]::[重構]::【✅ Gamma 組方案】完全重構為「無狀態」模式。前端不再自行計算或維護購物車內容與總計。
 * - [核心邏輯]::[簡化]:: 任何修改購物車的操作（新增、更新、移除），現在只會向後端發送命令，然後**立即重新呼叫 `_fetchCartSnapshot`** 來獲取唯一的、權威的最新狀態。
 * - [核心邏輯]::[簡化]:: 廢除了所有前端的 `summary`, `items`, `itemCount` 等狀態變數，UI 渲染現在 100% 依賴 `_fetchCartSnapshot` 回傳的結果。這徹底根除了所有前端的競爭條件與狀態不一致風險。
 * 更新日誌 (Changelog)：
 * - v51.0 (2025-09-27)：熔爐協議後的無狀態架構重構。
 * - v50.2 (2025-09-27)：舊版，有狀態且存在競爭條件。
 */

import { supabase } from '../core/supabaseClient.js';
import { showNotification } from '../core/utils.js';

let _supabase = null;
// 【v51.0 核心簡化】前端狀態最小化
let _state = {
    cartId: null,
    cartAccessToken: null,
    // 【v51.0】移除 items, summary 等，這些現在由後端權威提供
    snapshot: null, // 用於儲存從後端獲取的完整快照
    availableShippingMethods: [],
    selectedShippingMethodId: null,
    isLoading: true,
    isReadyForRender: false,
};
let _subscribers = [];
let _initPromise = null;

const INVOKE_TIMEOUT = 15000;

async function _ensureValidAccessToken() {
    if (!_supabase) _supabase = await supabase;
    let { data: { session }, error: getSessionError } = await _supabase.auth.getSession();
    if (getSessionError) throw new Error(`獲取 Session 失敗: ${getSessionError.message}`);
    if (!session) {
        const { data: anonData, error: anonError } = await _supabase.auth.signInAnonymously();
        if (anonError || !anonData.session) throw new Error(`無法建立匿名使用者 Session: ${anonError?.message}`);
        session = anonData.session;
    }
    if (!session.access_token) throw new Error("Session 中缺少 access_token。");
    return session.access_token;
}

async function _logRemoteError(error, context = {}) {
    try {
        if (!_supabase) return;
        _supabase.functions.invoke('log-client-error', {
            body: { 
                error: { name: error.name, message: error.message, stack: error.stack }, 
                context: { ...context, cartId: _state.cartId, url: window.location.href }
            }
        });
    } catch (e) { console.warn('Remote logging failed:', e); }
}

async function invokeWithTimeout(functionName, accessToken, options = {}) {
    if (!_supabase) _supabase = await supabase;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), INVOKE_TIMEOUT);
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        ...(_state.cartAccessToken && { 'X-Cart-Token': _state.cartAccessToken })
    };
    try {
        const result = await _supabase.functions.invoke(functionName, { ...options, headers, signal: controller.signal });
        clearTimeout(timeoutId);
        return result;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') throw new Error(`對 ${functionName} 的請求已逾時 (${INVOKE_TIMEOUT / 1000} 秒)。`);
        throw error;
    }
}

function _restoreStateFromLocalStorage() {
    try {
        const cartId = localStorage.getItem('cartId');
        const cartAccessToken = localStorage.getItem('cartAccessToken');
        if (cartId && cartAccessToken) {
            _state.cartId = cartId;
            _state.cartAccessToken = cartAccessToken;
            _state.selectedShippingMethodId = localStorage.getItem('selectedShippingMethodId');
            return true;
        }
        return false;
    } catch (error) {
        console.warn('從 localStorage 恢復購物車狀態失敗:', error);
        return false;
    }
}

function _saveStateToLocalStorage() {
    try {
        if (_state.cartId) localStorage.setItem('cartId', _state.cartId);
        if (_state.cartAccessToken) localStorage.setItem('cartAccessToken', _state.cartAccessToken);
        if (_state.selectedShippingMethodId) localStorage.setItem('selectedShippingMethodId', _state.selectedShippingMethodId);
    } catch (error) {
        console.warn('保存 Cart 憑證到 localStorage 失敗:', error);
    }
}

function _notify() { 
    // 【v51.0】建構一個對 UI 更友善的 state 物件
    const snapshot = _state.snapshot || {};
    const renderState = {
        isLoading: _state.isLoading,
        isReadyForRender: _state.isReadyForRender,
        cartId: _state.cartId,
        items: snapshot.items || [],
        itemCount: snapshot.itemCount || 0,
        summary: snapshot.summary || { subtotal: 0, couponDiscount: 0, shippingFee: 0, total: 0 },
        appliedCoupon: snapshot.appliedCoupon || null,
        shippingInfo: snapshot.shippingInfo || { freeShippingThreshold: 0, amountNeededForFreeShipping: 0 },
        availableShippingMethods: _state.availableShippingMethods,
        selectedShippingMethodId: _state.selectedShippingMethodId,
    };
    _subscribers.forEach(callback => {
        try { callback(renderState); } catch (error) { console.warn('購物車狀態通知回呼函式執行失敗:', error); }
    });
}

async function _fetchCartSnapshot(accessToken, payload = {}) {
    _state.isLoading = true;
    _notify();
    try {
        const fullPayload = {
            cartId: _state.cartId,
            couponCode: localStorage.getItem('appliedCouponCode'),
            shippingMethodId: _state.selectedShippingMethodId,
            ...payload
        };
        const { data, error } = await invokeWithTimeout('get-cart-snapshot', accessToken, { body: fullPayload });
        if (error) throw error;
        
        _state.snapshot = data; // 【v51.0】直接儲存權威快照
        _notify();
        return data;
    } catch (error) {
        console.error('獲取購物車快照失敗:', error);
        showNotification(`同步購物車失敗: ${error.message}`, 'error');
        _logRemoteError(error, { operation: 'fetchCartSnapshot' });
    } finally {
        _state.isLoading = false;
        _notify();
    }
}

async function _modifyCart(accessToken, action) {
    _state.isLoading = true;
    _notify();
    try {
        const { data, error } = await invokeWithTimeout('manage-cart', accessToken, { body: { cartId: _state.cartId, action } });
        if (error) throw error;
        if (data.success === false) throw new Error(data.error);
        
        // 【v51.0】操作成功後，立即重新獲取權威狀態
        await _fetchCartSnapshot(accessToken);

    } catch (error) {
        console.error('修改購物車失敗:', error);
        showNotification(`操作失敗: ${error.message}`, 'error');
        // 即使失敗，也刷新一次狀態以同步UI
        const newAccessToken = await _ensureValidAccessToken();
        await _fetchCartSnapshot(newAccessToken); 
        _logRemoteError(error, { operation: 'modifyCart', action });
        throw error;
    }
}

export const CartService = {
    async init() {
        if (_initPromise) return _initPromise;
        _initPromise = (async () => {
            _state.isLoading = true;
            _notify();
            try {
                _supabase = await supabase;
                console.log('🛒 開始初始化購物車服務 (v51.0)...');

                const accessToken = await _ensureValidAccessToken();
                const restored = _restoreStateFromLocalStorage();

                if (!restored) {
                    const { data: apiResponse, error } = await invokeWithTimeout('get-or-create-cart', accessToken);
                    if (error) throw error;
                    if (!apiResponse.cartId || !apiResponse.cart_access_token) {
                        throw new Error("後端未能回傳有效的購物車憑證");
                    }
                    _state.cartId = apiResponse.cartId;
                    _state.cartAccessToken = apiResponse.cart_access_token;
                    _saveStateToLocalStorage();
                }

                await this.fetchShippingMethods();
                await _fetchCartSnapshot(accessToken);
                _state.isReadyForRender = true;

            } catch (error) {
                 console.error('初始化購物車服務失敗:', error);
                 showNotification(`初始化購物車失敗：${error.message}`, 'error');
                 _initPromise = null;
                 _logRemoteError(error, { operation: 'init' });
            } finally {
                _state.isLoading = false;
                _notify();
            }
        })();
        return _initPromise;
    },
    
    async fetchShippingMethods() {
        try {
            if (!_supabase) _supabase = await supabase;
            const { data, error } = await _supabase.from('shipping_rates').select('*').eq('is_active', true).order('display_order', { ascending: true });
            if (error) throw error;
            _state.availableShippingMethods = data || [];
        } catch (error) {
            console.error('獲取運送方式失敗:', error);
            _state.availableShippingMethods = [];
            _logRemoteError(error, { operation: 'fetchShippingMethods' });
        }
    },

    async addItem({ variantId, quantity }) {
        await this.init();
        const accessToken = await _ensureValidAccessToken();
        await _modifyCart(accessToken, { type: 'ADD_ITEM', payload: { variantId, quantity } });
        showNotification('商品已加入購物車！', 'success');
    },

    async updateItemQuantity(itemId, newQuantity) {
        await this.init();
        const accessToken = await _ensureValidAccessToken();
        await _modifyCart(accessToken, { type: 'UPDATE_ITEM_QUANTITY', payload: { itemId, newQuantity } });
    },

    async removeItem(itemId) {
        await this.init();
        const accessToken = await _ensureValidAccessToken();
        await _modifyCart(accessToken, { type: 'REMOVE_ITEM', payload: { itemId } });
        showNotification('商品已從購物車移除。', 'info');
    },

    async applyCoupon(couponCode) {
        await this.init();
        const accessToken = await _ensureValidAccessToken();
        localStorage.setItem('appliedCouponCode', couponCode || '');
        await _fetchCartSnapshot(accessToken, { couponCode: couponCode || null });
    },

    async selectShippingMethod(shippingMethodId) {
        await this.init();
        _state.selectedShippingMethodId = shippingMethodId;
        _saveStateToLocalStorage();
        const accessToken = await _ensureValidAccessToken();
        await _fetchCartSnapshot(accessToken);
    },

    async finalizeCheckout(checkoutData) {
        await this.init();
        const accessToken = await _ensureValidAccessToken();
        try {
            const { data, error } = await invokeWithTimeout('create-order-from-cart', accessToken, {
                body: {
                    cartId: _state.cartId,
                    couponCode: _state.snapshot?.appliedCoupon?.code || null,
                    selectedShippingMethodId: _state.selectedShippingMethodId,
                    frontendValidationSummary: _state.snapshot?.summary,
                    ...checkoutData
                }
            });
            if (error) throw error;
            if (!data.success) throw { context: { json: data } };
            return data.data;
        } catch(error) {
            _logRemoteError(error, { operation: 'finalizeCheckout' });
            throw error;
        }
    },
    
    getState() {
        // 【v51.0】對外總是回傳渲染專用的 state
        const snapshot = _state.snapshot || {};
        return {
            isLoading: _state.isLoading,
            isReadyForRender: _state.isReadyForRender,
            cartId: _state.cartId,
            items: snapshot.items || [],
            itemCount: snapshot.itemCount || 0,
            summary: snapshot.summary || { subtotal: 0, couponDiscount: 0, shippingFee: 0, total: 0 },
            appliedCoupon: snapshot.appliedCoupon || null,
            shippingInfo: snapshot.shippingInfo || { freeShippingThreshold: 0, amountNeededForFreeShipping: 0 },
            availableShippingMethods: _state.availableShippingMethods,
            selectedShippingMethodId: _state.selectedShippingMethodId,
        };
    },

    subscribe(callback) {
        _subscribers.push(callback);
        if (_state.isReadyForRender) { 
            callback(this.getState()); 
        }
        return () => { 
            _subscribers = _subscribers.filter(cb => cb !== callback); 
        };
    },

    clearCartAndState() {
        localStorage.removeItem('cartId');
        localStorage.removeItem('cartAccessToken');
        localStorage.removeItem('supabase.auth.token');
        localStorage.removeItem('selectedShippingMethodId');
        localStorage.removeItem('appliedCouponCode');
        
        _state = {
            cartId: null, cartAccessToken: null, snapshot: null,
            availableShippingMethods: [], selectedShippingMethodId: null,
            isLoading: true, isReadyForRender: false, 
        };
        _initPromise = null; 
        _notify();
    },

    async forceReinit() {
        this.clearCartAndState();
        return this.init();
    }
};