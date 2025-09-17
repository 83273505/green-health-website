// ==============================================================================
// 檔案路徑: storefront-module/js/services/CartService.js
// ==============================================================================

/**
 * 檔案名稱：CartService.js
 * 檔案職責：作為購物車的輕量級狀態容器與 API 客戶端。
 * 版本：44.0 (原子化架構重構版)
 * AI 註記：
 * - [核心架構]: 內部邏輯被完全重構。不再呼叫 `recalculate-cart`，而是統一呼叫
 *   新的 `manage-cart` 原子化端點。
 * - [簡化]: 移除了複雜的內部狀態計算，現在完全信任後端回傳的權威快照。
 * - [相容性]: 所有公開 API (`init`, `addItem`, etc.) 保持不變，確保 UI 層無需修改。
 */
import { supabase } from '../core/supabaseClient.js';
import { showNotification } from '../core/utils.js';

let _supabase = null;
let _state = {
    cartId: null, items: [], itemCount: 0,
    summary: { subtotal: 0, couponDiscount: 0, shippingFee: 0, total: 0 },
    appliedCoupon: null, availableShippingMethods: [], selectedShippingMethodId: null,
    shippingInfo: { freeShippingThreshold: 0, amountNeededForFreeShipping: 0 },
    isLoading: true, isAnonymous: false, isReadyForRender: false, 
};
let _subscribers = [];
let _initPromise = null;

const INVOKE_TIMEOUT = 15000;

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

function _updateStateFromSnapshot(snapshot) {
    if (!snapshot) return;
    _state.items = snapshot.items || [];
    _state.itemCount = snapshot.itemCount || 0;
    _state.summary = snapshot.summary || _state.summary;
    _state.appliedCoupon = snapshot.appliedCoupon || null;
    _state.shippingInfo = snapshot.shippingInfo || _state.shippingInfo;
    if(snapshot.summary.couponCode) {
        _state.appliedCoupon = { code: snapshot.summary.couponCode, discountAmount: snapshot.summary.couponDiscount };
    } else {
        _state.appliedCoupon = null;
    }
    _notify();
}

function _notify() { 
    _subscribers.forEach(callback => {
        try { callback(_state); } catch (error) { console.warn('購物車狀態通知回呼函式執行失敗:', error); }
    });
}

async function _manageCart(payload) {
    if (_state.isLoading) return;
    _state.isLoading = true;
    _notify();
    try {
        const response = await invokeWithTimeout('manage-cart', { body: { cartId: _state.cartId, ...payload } });
        const { data: apiData, error: networkError } = response;
        if (networkError) throw networkError;
        if (apiData.success === false) {
             if (apiData.data) _updateStateFromSnapshot(apiData.data);
             throw apiData.error;
        }
        if (apiData.success === true && apiData.data) {
            if (payload.shippingMethodId !== undefined) _state.selectedShippingMethodId = payload.shippingMethodId;
            localStorage.setItem('selectedShippingMethodId', _state.selectedShippingMethodId);
            if (payload.couponCode) localStorage.setItem('appliedCouponCode', payload.couponCode);
            else if (payload.couponCode === null && !apiData.data.summary.couponCode) localStorage.removeItem('appliedCouponCode');
            _updateStateFromSnapshot(apiData.data);
        }
    } catch (error) {
        console.error('更新購物車失敗:', error);
        const userMessage = error.message || '購物車操作失敗，請稍後再試。';
        showNotification(userMessage, 'error', 'notification-message');
        throw error;
    } finally {
        _state.isLoading = false;
        _notify();
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
                console.log('🛒 開始初始化購物車服務...');
                const { restored, anonymousToken, anonymousUserId } = _restoreStateFromLocalStorage();
                if (restored && anonymousToken && anonymousUserId) {
                    const { error } = await _supabase.auth.setSession({ access_token: anonymousToken, refresh_token: 'dummy_refresh_token' });
                    if (error) { 
                        console.warn('恢復匿名 Session 失敗:', error.message);
                        this.clearCartAndState();
                    }
                }

                if (!_state.cartId) {
                    const { data: apiResponse, error } = await invokeWithTimeout('get-or-create-cart');
                    if (error || !apiResponse.cartId) throw new Error(error?.message || "未能獲取購物車");
                    _state.cartId = apiResponse.cartId;
                    _state.isAnonymous = apiResponse.isAnonymous;
                    _saveStateToLocalStorage();
                    if (apiResponse.isAnonymous && apiResponse.userId && apiResponse.token) {
                        localStorage.setItem('anonymous_user_id', apiResponse.userId);
                        localStorage.setItem('anonymous_token', apiResponse.token);
                    }
                }
                await this.fetchShippingMethods();
                await _manageCart({ 
                    couponCode: localStorage.getItem('appliedCouponCode'), 
                    shippingMethodId: localStorage.getItem('selectedShippingMethodId')
                });
                _state.isReadyForRender = true;
            } catch (error) {
                console.error('初始化購物車服務失敗:', error);
                showNotification(`初始化購物車失敗：${error.message}`, 'error');
                _initPromise = null;
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
        }
    },
    async addItem({ variantId, quantity }) {
        await this.init();
        await _manageCart({ actions: [{ type: 'ADD_ITEM', payload: { variantId, quantity } }] });
        showNotification('商品已加入購物車！', 'success');
    },
    async updateItemQuantity(itemId, newQuantity) {
        await this.init();
        return _manageCart({ actions: [{ type: 'UPDATE_ITEM_QUANTITY', payload: { itemId, newQuantity } }] });
    },
    async removeItem(itemId) {
        await this.init();
        await _manageCart({ actions: [{ type: 'REMOVE_ITEM', payload: { itemId } }] });
        showNotification('商品已從購物車移除。', 'info');
    },
    async applyCoupon(couponCode) {
        await this.init();
        await _manageCart({ couponCode: couponCode || null });
    },
    async selectShippingMethod(shippingMethodId) {
        await this.init();
        await _manageCart({ shippingMethodId: shippingMethodId || null });
    },
    getState() { return { ..._state }; },
    subscribe(callback) {
        _subscribers.push(callback);
        if (_state.isReadyForRender) { callback(_state); }
        return () => { _subscribers = _subscribers.filter(cb => cb !== callback); };
    },
    clearCartAndState() {
        localStorage.clear();
        _state = { /* reset state */ };
        _initPromise = null; _notify();
    },
    async forceReinit() {
        this.clearCartAndState();
        return this.init();
    }
};