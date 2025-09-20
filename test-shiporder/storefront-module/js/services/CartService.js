// 檔案路徑: storefront-module/js/services/CartService.js
// 版本: v47.0 (客戶端日誌整合版)
// 說明: 此版本新增了關鍵錯誤的遠端日誌記錄功能，以消除觀測盲區。

import { supabase } from '../core/supabaseClient.js';
import { showNotification } from '../core/utils.js';

let _supabase = null;
let _state = {
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
let _subscribers = [];
let _initPromise = null;

const INVOKE_TIMEOUT = 15000;

// [v47.0 新增] 輕量級的遠端日誌記錄器
async function _logRemoteError(error, context = {}) {
    try {
        // 使用 'navigator.sendBeacon' 或 'fetch' 的 'keepalive' 選項是更健壯的做法，
        // 但為了簡單起見，我們先用標準 fetch。
        // 這是一個 "fire and forget" 的操作，我們不關心它的回傳結果。
        fetch('/.netlify/functions/log-client-error', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                error: { 
                    name: error.name, 
                    message: error.message, 
                    stack: error.stack 
                }, 
                context: {
                    ...context,
                    cartId: _state.cartId,
                    url: window.location.href
                }
            })
        });
    } catch (e) {
        // 如果日誌本身失敗，我們只在本地 console 記錄，避免循環錯誤。
        console.warn('Remote logging failed:', e);
    }
}


async function invokeWithTimeout(functionName, options = {}) {
    if (!_supabase) throw new Error('Supabase client not initialized.');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), INVOKE_TIMEOUT);
    try {
        const result = await _supabase.functions.invoke(functionName, { ...options, signal: controller.signal });
        clearTimeout(timeoutId);
        return result;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') { throw new Error(`對 ${functionName} 的請求已逾時 (${INVOKE_TIMEOUT / 1000} 秒)。`); }
        throw error;
    }
}

function _restoreStateFromLocalStorage() {
    try {
        const cartId = localStorage.getItem('cartId');
        if (!cartId) return { restored: false };
        _state.cartId = cartId;
        _state.isAnonymous = !!localStorage.getItem('anonymous_user_id');
        console.log(`🛒 從 localStorage 恢復 Cart ID: ${cartId}`);
        return { 
            restored: true, 
            anonymousToken: localStorage.getItem('anonymous_token'), 
            anonymousUserId: localStorage.getItem('anonymous_user_id') 
        };
    } catch (error) {
        console.warn('從 localStorage 恢復購物車狀態失敗:', error);
        return { restored: false };
    }
}

function _saveStateToLocalStorage() {
    try {
        if (_state.cartId) localStorage.setItem('cartId', _state.cartId);
    } catch (error) {
        console.warn('保存 Cart ID 到 localStorage 失敗:', error);
    }
}

function _notify() { 
    _subscribers.forEach(callback => {
        try { callback(_state); } catch (error) { console.warn('購物車狀態通知回呼函式執行失敗:', error); }
    });
}

function _updateStateFromSnapshot(snapshot) {
    if (!snapshot) return;
    _state.items = snapshot.items || [];
    _state.itemCount = snapshot.itemCount || 0;
    _state.summary = snapshot.summary || _state.summary;
    _state.appliedCoupon = snapshot.appliedCoupon || null;
    _state.shippingInfo = snapshot.shippingInfo || _state.shippingInfo;
    _state.selectedShippingMethodId = localStorage.getItem('selectedShippingMethodId');
    _notify();
}

// [v46.0 新增] 查詢函式，專職獲取最新狀態
async function _fetchCartSnapshot(payload = {}) {
    _state.isLoading = true;
    _notify();
    try {
        const fullPayload = {
            cartId: _state.cartId,
            couponCode: localStorage.getItem('appliedCouponCode'),
            shippingMethodId: localStorage.getItem('selectedShippingMethodId'),
            ...payload
        };
        const { data, error } = await _supabase.functions.invoke('get-cart-snapshot', { body: fullPayload });
        if (error) throw error;
        
        _updateStateFromSnapshot(data);
        return data;
    } catch (error) {
        console.error('獲取購物車快照失敗:', error);
        showNotification(`同步購物車失敗: ${error.message}`, 'error');
        // [v47.0 新增] 記錄此類關鍵失敗
        _logRemoteError(error, { operation: 'fetchCartSnapshot' });
    } finally {
        _state.isLoading = false;
        _notify();
    }
}

// [v46.0 新增] 命令函式，專職修改購物車
async function _modifyCart(action) {
    _state.isLoading = true;
    _notify();
    try {
        const { data, error } = await _supabase.functions.invoke('manage-cart', { body: { cartId: _state.cartId, action } });
        if (error) throw error;
        if (data.success === false) throw new Error(data.error);
        return data;
    } catch (error) {
        console.error('修改購物車失敗:', error);
        showNotification(`操作失敗: ${error.message}`, 'error');
        await _fetchCartSnapshot(); 
        // [v47.0 新增] 記錄此類關鍵失敗
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
                // ... (從 localStorage 恢復 cartId 和匿名 session 的邏輯) ...
                if (!_state.cartId) {
                    const { data: apiResponse, error } = await invokeWithTimeout('get-or-create-cart');
                    if (error || !apiResponse.cartId) throw new Error(error?.message || "未能獲取購物車");
                    _state.cartId = apiResponse.cartId;
                    _saveStateToLocalStorage();
                }
                await this.fetchShippingMethods();
                await _fetchCartSnapshot();
                _state.isReadyForRender = true;
            } catch (error) {
                 console.error('初始化購物車服務失敗:', error);
                 showNotification(`初始化購物車失敗：${error.message}`, 'error');
                 _initPromise = null;
                 // [v47.0 新增] 記錄此類關鍵失敗
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
            if (!_supabase) await this.init();
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
        await _modifyCart({ type: 'ADD_ITEM', payload: { variantId, quantity } });
        await _fetchCartSnapshot(); 
        showNotification('商品已加入購物車！', 'success');
    },

    async updateItemQuantity(itemId, newQuantity) {
        await this.init();
        await _modifyCart({ type: 'UPDATE_ITEM_QUANTITY', payload: { itemId, newQuantity } });
        await _fetchCartSnapshot();
    },

    async removeItem(itemId) {
        await this.init();
        await _modifyCart({ type: 'REMOVE_ITEM', payload: { itemId } });
        await _fetchCartSnapshot();
        showNotification('商品已從購物車移除。', 'info');
    },

    async applyCoupon(couponCode) {
        await this.init();
        localStorage.setItem('appliedCouponCode', couponCode || '');
        await _fetchCartSnapshot({ couponCode: couponCode || null });
    },

    async selectShippingMethod(shippingMethodId) {
        await this.init();
        localStorage.setItem('selectedShippingMethodId', shippingMethodId || '');
        await _fetchCartSnapshot({ shippingMethodId: shippingMethodId || null });
    },

    async finalizeCheckout(checkoutData) {
        await this.init();
        try {
            const { data, error } = await invokeWithTimeout('create-order-from-cart', {
                body: {
                    cartId: _state.cartId,
                    couponCode: _state.appliedCoupon?.code || null,
                    selectedShippingMethodId: _state.selectedShippingMethodId,
                    frontendValidationSummary: _state.summary,
                    ...checkoutData
                }
            });
            if (error) throw error;
            if (!data.success) throw { context: { json: data } };
            return data.data;
        } catch(error) {
            _logRemoteError(error, { operation: 'finalizeCheckout' });
            throw error; // 繼續向上拋出，讓 UI 層處理
        }
    },
    
    getState() { 
        return { ..._state }; 
    },

    subscribe(callback) {
        _subscribers.push(callback);
        if (_state.isReadyForRender) { 
            callback(_state); 
        }
        return () => { 
            _subscribers = _subscribers.filter(cb => cb !== callback); 
        };
    },

    clearCartAndState() {
        localStorage.removeItem('cartId');
        localStorage.removeItem('anonymous_user_id');
        localStorage.removeItem('anonymous_token');
        localStorage.removeItem('selectedShippingMethodId');
        localStorage.removeItem('appliedCouponCode');
        
        _state = {
            cartId: null, items: [], itemCount: 0,
            summary: { subtotal: 0, couponDiscount: 0, shippingFee: 0, total: 0 },
            appliedCoupon: null, availableShippingMethods: [], selectedShippingMethodId: null,
            shippingInfo: { freeShippingThreshold: 0, amountNeededForFreeShipping: 0 },
            isLoading: true, isAnonymous: false, isReadyForRender: false, 
        };
        _initPromise = null; 
        _notify();
    },

    async forceReinit() {
        this.clearCartAndState();
        return this.init();
    }
};