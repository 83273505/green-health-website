// 檔案路徑: storefront-module/js/services/CartService.js
/**
 * 檔案名稱：CartService.js
 * 檔案職責：採用單例模式 (Singleton Pattern) 的購物車核心服務，處理所有購物車狀態管理與後端互動。
 * 版本：45.1 (完整性修正版)
 * SOP 條款對應：
 * - [3.1.4.1] 零省略指令 (🔴L1)
 * - [法案 KB-UPGRADE-20250909-04]
 * AI 註記：
 * - [核心除錯]: 此版本為對 v45.0 的完整性修正，補全了所有先前被錯誤省略的函式，
 *   確保交付的檔案是 100% 完整、可直接使用的最終狀態。
 * - [操作指示]: 請完整覆蓋原檔案。
 * 更新日誌 (Changelog)：
 * - v45.1 (2025-09-09)：[SOP COMPLIANCE] 補全所有函式內容，修正「零省略原則」違規。
 * - v45.0 (2025-09-09)：[CRITICAL BUG FIX] 修正了錯誤處理機制，確保庫存校驗失敗時能向上拋出異常。
 */

import { supabase } from '../core/supabaseClient.js';
import { showNotification } from '../core/utils.js';

let _supabase = null;

let _state = {
    cartId: null, items: [], itemCount: 0,
    summary: { subtotal: 0, couponDiscount: 0, shippingFee: 0, total: 0 },
    appliedCoupon: null, availableShippingMethods: [], selectedShippingMethodId: null,
    shippingInfo: { freeShippingThreshold: 0, amountNeededForFreeShipping: 0 },
    isLoading: false, isAnonymous: false, isReadyForRender: false, 
};
let _subscribers = [];
let _initPromise = null;

const INVOKE_TIMEOUT = 10000;

class CartServiceError extends Error {
    constructor(message, code) {
        super(message);
        this.name = 'CartServiceError';
        this.code = code;
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
        const savedCouponCode = localStorage.getItem('appliedCouponCode');
        const savedShippingId = localStorage.getItem('selectedShippingMethodId');
        const anonymousUserId = localStorage.getItem('anonymous_user_id');
        const anonymousToken = localStorage.getItem('anonymous_token');
        _state.cartId = cartId;
        _state.selectedShippingMethodId = savedShippingId;
        _state.isAnonymous = !!anonymousUserId;
        if (savedCouponCode) { _state.appliedCoupon = { code: savedCouponCode }; }
        console.log(`🛒 從 localStorage 恢復購物車狀態: Cart ID ${cartId}, 匿名模式: ${_state.isAnonymous}`);
        return { restored: true, anonymousToken, anonymousUserId };
    } catch (error) {
        console.warn('從 localStorage 恢復購物車狀態失敗:', error);
        return { restored: false };
    }
}

function _saveStateToLocalStorage() {
    try {
        if (_state.cartId) localStorage.setItem('cartId', _state.cartId);
        if (_state.appliedCoupon) localStorage.setItem('appliedCouponCode', _state.appliedCoupon.code);
        else localStorage.removeItem('appliedCouponCode');
        if (_state.selectedShippingMethodId) localStorage.setItem('selectedShippingMethodId', _state.selectedShippingMethodId);
        else localStorage.removeItem('selectedShippingMethodId');
    } catch (error) {
        console.warn('保存購物車狀態到 localStorage 失敗:', error);
    }
}

function _updateStateFromSnapshot(snapshot) {
    if (!snapshot) return;
    _state.items = snapshot.items || [];
    _state.itemCount = snapshot.itemCount || 0;
    _state.summary = snapshot.summary || _state.summary;
    _state.appliedCoupon = snapshot.appliedCoupon || null;
    _state.shippingInfo = snapshot.shippingInfo || _state.shippingInfo;
    _saveStateToLocalStorage();
    _notify();
}

function _notify() { 
    _subscribers.forEach(callback => {
        try { callback(_state); } catch (error) { console.warn('購物車狀態通知回呼函式執行失敗:', error); }
    });
}

async function _recalculateCart(payload) {
    if (_state.isLoading) return;
    _state.isLoading = true;
    _notify();
    try {
        const { data: response, error } = await invokeWithTimeout('recalculate-cart', { body: { cartId: _state.cartId, ...payload } });
        if (error) throw error;
        
        if (response.success === false) {
            const backendError = response.error;
            const serviceError = new CartServiceError(backendError.message, backendError.code);
            
            console.warn(`後端業務錯誤: ${backendError.message}`);
            showNotification(backendError.message, 'warning');
            
            if (response.data) {
                _updateStateFromSnapshot(response.data);
            }
            
            throw serviceError;
        } else {
            if (payload.shippingMethodId !== undefined) { 
                _state.selectedShippingMethodId = payload.shippingMethodId; 
            }
            _updateStateFromSnapshot(response.data);
        }

    } catch (error) {
        if (!(error instanceof CartServiceError)) {
            console.error('更新購物車失敗:', error);
            const userMessage = error.message.includes('逾時') ? '購物車連線逾時，請檢查您的網路環境後重試。' : (error.message || '購物車更新失敗，請重試。');
            showNotification(userMessage, 'error');
        }
        throw error;
    } finally {
        _state.isLoading = false;
        _notify();
    }
}

export const CartService = {
    init() {
        if (_state.isReadyForRender) return Promise.resolve();
        if (_initPromise) return _initPromise;
        _initPromise = (async () => {
            _state.isReadyForRender = false;
            try {
                _supabase = await supabase;
                if (!_supabase) { throw new Error('CartService 初始化失敗：無法獲取 supabaseClient 實例。'); }
                console.log('🛒 開始初始化購物車服務...');
                const { restored, anonymousToken, anonymousUserId } = _restoreStateFromLocalStorage();
                if (restored && anonymousToken && anonymousUserId) {
                    console.log(`🔒 嘗試恢復匿名 Session: ${anonymousUserId}`);
                    const { error } = await _supabase.auth.setSession({ access_token: anonymousToken, refresh_token: 'dummy_refresh_token' });
                    if (error) { console.warn('恢復匿名 Session 失敗，將重新獲取:', error.message); this.clearCartAndState(); }
                }
                if (!_state.cartId) {
                    console.log('🛒 本地無 cartId 或恢復失敗，執行遠端獲取...');
                    const { data, error } = await invokeWithTimeout('get-or-create-cart');
                    if (error) throw error; if (data.error) throw new Error(data.error);
                    _state.cartId = data.cartId;
                    _state.isAnonymous = data.isAnonymous || false;
                    localStorage.setItem('cartId', _state.cartId);
                    if (data.isAnonymous && data.userId && data.token) {
                        localStorage.setItem('anonymous_user_id', data.userId);
                        localStorage.setItem('anonymous_token', data.token);
                    } else {
                        localStorage.removeItem('anonymous_user_id');
                        localStorage.removeItem('anonymous_token');
                    }
                }
                await Promise.all([
                    this.fetchShippingMethods(),
                    _recalculateCart({ couponCode: _state.appliedCoupon?.code, shippingMethodId: _state.selectedShippingMethodId })
                ]);
                _state.isReadyForRender = true;
                console.log(`🛒 購物車服務初始化完成 (使用者狀態: ${_state.isAnonymous ? '匿名' : '已認證'})`);
                _notify();
            } catch (error) {
                if (!(error instanceof CartServiceError)) {
                    console.error('初始化購物車服務失敗:', error);
                    const userMessage = error.message.includes('逾時') ? '初始化購物車失敗：連線逾時，請重新整理頁面。' : `初始化購物車失敗：${error.message}`;
                    showNotification(userMessage, 'error');
                }
                _initPromise = null; _state.isReadyForRender = false; _notify(); throw error;
            }
        })();
        return _initPromise;
    },
    isReady: () => _state.isReadyForRender,
    async fetchShippingMethods(retry = true) {
        try {
            if (!_supabase) await this.init();
            const { data, error } = await _supabase.from('shipping_rates').select('*').eq('is_active', true).order('display_order', { ascending: true });
            if (error) throw error;
            _state.availableShippingMethods = data || [];
        } catch (error) {
            if (retry) {
                console.warn('獲取運送方式失敗，1秒後自動重試一次...');
                await new Promise(resolve => setTimeout(resolve, 1000));
                await this.fetchShippingMethods(false);
            } else {
                console.error('獲取運送方式最終失敗:', error);
                _state.availableShippingMethods = [];
            }
        }
    },
    async addItem({ variantId, quantity }) {
        if (!variantId || !(quantity > 0)) {
            showNotification('無效的商品或數量。', 'error');
            return;
        }
        try {
            await _recalculateCart({
                actions: [{ type: 'ADD_ITEM', payload: { variantId, quantity } }],
                couponCode: _state.appliedCoupon?.code,
                shippingMethodId: _state.selectedShippingMethodId
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
            couponCode: _state.appliedCoupon?.code,
            shippingMethodId: _state.selectedShippingMethodId
        });
    },
    async removeItem(itemId) {
        if (!itemId) return;
        try {
            await _recalculateCart({
                actions: [{ type: 'REMOVE_ITEM', payload: { itemId } }],
                couponCode: _state.appliedCoupon?.code,
                shippingMethodId: _state.selectedShippingMethodId
            });
            showNotification('商品已從購物車移除。', 'info');
        } catch (error) {
             console.log("removeItem 捕捉到來自 _recalculateCart 的錯誤，已處理。");
        }
    },
    async applyCoupon(couponCode) {
        if (!couponCode || typeof couponCode !== 'string') return;
        try {
            await _recalculateCart({ couponCode: couponCode.trim(), shippingMethodId: _state.selectedShippingMethodId });
        } catch(error) {
             console.log("applyCoupon 捕捉到來自 _recalculateCart 的錯誤，已處理。");
        }
    },
    async selectShippingMethod(shippingMethodId) {
        try {
            await _recalculateCart({ shippingMethodId, couponCode: _state.appliedCoupon?.code });
        } catch(error) {
             console.log("selectShippingMethod 捕捉到來自 _recalculateCart 的錯誤，已處理。");
        }
    },
    refreshWithSnapshot(snapshot) { 
        if (!snapshot) return;
        _updateStateFromSnapshot(snapshot); 
    },
    getState() { return { ..._state }; },
    subscribe(callback) {
        if (typeof callback !== 'function') return;
        _subscribers.push(callback);
        if (_state.isReadyForRender) {
            try { callback(_state); } catch (error) { console.warn('初始化訂閱回呼時發生錯誤:', error); }
        }
        return () => { _subscribers = _subscribers.filter(cb => cb !== callback); };
    },
    clearCartAndState() {
        try {
            localStorage.removeItem('cartId'); localStorage.removeItem('appliedCouponCode');
            localStorage.removeItem('selectedShippingMethodId'); localStorage.removeItem('anonymous_user_id');
            localStorage.removeItem('anonymous_token');
            _state = {
                cartId: null, items: [], itemCount: 0,
                summary: { subtotal: 0, couponDiscount: 0, shippingFee: 0, total: 0 },
                appliedCoupon: null, availableShippingMethods: [], selectedShippingMethodId: null,
                shippingInfo: { freeShippingThreshold: 0, amountNeededForFreeShipping: 0 },
                isLoading: false, isAnonymous: false, isReadyForRender: false,
            };
            _initPromise = null; _notify();
            console.log('🛒 購物車本地狀態已完全清除。');
        } catch (error) {
            console.error('清除購物車狀態時發生錯誤:', error);
        }
    },
    isLoading() { return _state.isLoading; },
    async forceReinit() {
        console.log('🛒 強制重新初始化購物車...');
        this.clearCartAndState();
        return await this.init();
    }
};