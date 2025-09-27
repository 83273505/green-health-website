// 檔案路徑: storefront-module/js/services/CartService.js
// ==============================================================================
/**
 * 檔案名稱：CartService.js
 * 檔案職責：【v50.2 TypeError 修正版】管理全站購物車的狀態、與後端 API 的所有交互。
 * 版本：50.2
 * SOP 條款對應：
 * - [SOP v7.2 4.0] 變更優先診斷原則
 * - [SOP-CE 12] 謙遜協議
 * AI 註記：
 * 變更摘要:
 * - [核心邏輯]::[重構]::【✅ 根本原因修正】修正了 v50.1 中因錯誤 `import` 導致的 `TypeError: getSupabase is not a function` 致命錯誤。
 * - [核心邏輯]::[重構]::【✅ 健壯性強化】現在使用 `import { supabase } from ...` 直接導入 Promise，並在需要時使用 `_supabase = await supabase;` 的標準方式來解析它，確保語法正確性。
 * 更新日誌 (Changelog)：
 * - v50.2 (2025-09-27)：修正了 v50.1 引入的致命 TypeError。
 * - v50.1 (2025-09-27)：嘗試修復競爭條件但引入了 TypeError。
 * - v50.0 (2025-09-26)：舊版，存在狀態不一致的競爭條件。
 */

import { supabase } from '../core/supabaseClient.js';
import { showNotification } from '../core/utils.js';

let _supabase = null;
let _state = {
    cartId: null,
    cartAccessToken: null,
    items: [],
    itemCount: 0,
    summary: { subtotal: 0, couponDiscount: 0, shippingFee: 0, total: 0 },
    appliedCoupon: null,
    availableShippingMethods: [],
    selectedShippingMethodId: null,
    shippingInfo: { freeShippingThreshold: 0, amountNeededForFreeShipping: 0 },
    isLoading: true,
    isReadyForRender: false,
};
let _subscribers = [];
let _initPromise = null;

const INVOKE_TIMEOUT = 15000;

/**
 * [v50.2 修正版]
 * 確保 Supabase 有一個有效的 Session，並權威地回傳 access_token。
 * @returns {Promise<string>} 一個解析為有效 access_token 的 Promise。
 */
async function _ensureValidAccessToken() {
    if (!_supabase) _supabase = await supabase; // 【v50.2 核心修正】正確等待 Promise

    let { data: { session }, error: getSessionError } = await _supabase.auth.getSession();

    if (getSessionError) {
        console.error("❌ 獲取 Session 時發生錯誤:", getSessionError);
        throw new Error(`獲取 Session 失敗: ${getSessionError.message}`);
    }

    if (!session) {
        console.warn("🛒 未找到 Session，正在主動進行匿名登入...");
        const { data: anonData, error: anonError } = await _supabase.auth.signInAnonymously();
        if (anonError || !anonData.session) {
            console.error("❌ 匿名登入失敗:", anonError);
            throw new Error(`無法建立匿名使用者 Session: ${anonError?.message}`);
        }
        console.log("✅ 成功建立匿名 Session。");
        session = anonData.session;
    }
    
    if (!session.access_token) {
        console.error("❌ Session 有效但缺少 access_token，這是一個非預期狀態。");
        throw new Error("Session 中缺少 access_token。");
    }
    
    return session.access_token;
}


// 輕量級的遠端日誌記錄器
async function _logRemoteError(error, context = {}) {
    try {
        if (!_supabase) return;
        _supabase.functions.invoke('log-client-error', {
            body: { 
                error: { name: error.name, message: error.message, stack: error.stack }, 
                context: { ...context, cartId: _state.cartId, url: window.location.href }
            }
        });
    } catch (e) {
        console.warn('Remote logging failed:', e);
    }
}

/**
 * [v50.2 修正版]
 * 帶有逾時機制的 Supabase Function 呼叫器，現在會明確接收 access_token。
 * @param {string} functionName - 要呼叫的 Edge Function 名稱。
 * @param {string} accessToken - 用於驗證的 JWT。
 * @param {object} options - 包含 body 等的請求選項。
 * @returns {Promise<any>}
 */
async function invokeWithTimeout(functionName, accessToken, options = {}) {
    if (!_supabase) _supabase = await supabase; // 【v50.2 核心修正】
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), INVOKE_TIMEOUT);
    
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        ...(_state.cartAccessToken && { 'X-Cart-Token': _state.cartAccessToken })
    };

    try {
        const result = await _supabase.functions.invoke(functionName, {
            ...options,
            headers,
            signal: controller.signal
        });
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
        const cartAccessToken = localStorage.getItem('cartAccessToken');
        if (cartId && cartAccessToken) {
            _state.cartId = cartId;
            _state.cartAccessToken = cartAccessToken;
            console.log(`🛒 從 localStorage 恢復 Cart 憑證`);
            return { restored: true };
        }
        return { restored: false };
    } catch (error) {
        console.warn('從 localStorage 恢復購物車狀態失敗:', error);
        return { restored: false };
    }
}

function _saveStateToLocalStorage() {
    try {
        if (_state.cartId) localStorage.setItem('cartId', _state.cartId);
        if (_state.cartAccessToken) localStorage.setItem('cartAccessToken', _state.cartAccessToken);
    } catch (error) {
        console.warn('保存 Cart 憑證到 localStorage 失敗:', error);
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

async function _fetchCartSnapshot(accessToken, payload = {}) {
    _state.isLoading = true;
    _notify();
    try {
        const fullPayload = {
            cartId: _state.cartId,
            couponCode: localStorage.getItem('appliedCouponCode'),
            shippingMethodId: localStorage.getItem('selectedShippingMethodId'),
            ...payload
        };
        const { data, error } = await invokeWithTimeout('get-cart-snapshot', accessToken, {
            body: fullPayload 
        });
        if (error) throw error;
        
        _updateStateFromSnapshot(data);
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
        const { data, error } = await invokeWithTimeout('manage-cart', accessToken, {
            body: { cartId: _state.cartId, action } 
        });
        if (error) throw error;
        if (data.success === false) throw new Error(data.error);
        return data;
    } catch (error) {
        console.error('修改購物車失敗:', error);
        showNotification(`操作失敗: ${error.message}`, 'error');
        await _fetchCartSnapshot(accessToken); 
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
                _supabase = await supabase; // 【v50.2 核心修正】
                console.log('🛒 開始初始化購物車服務 (v50.2)...');

                const accessToken = await _ensureValidAccessToken();
                const { restored } = _restoreStateFromLocalStorage();

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
            if (!_supabase) _supabase = await supabase; // 【v50.2 核心修正】
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
        await _fetchCartSnapshot(accessToken); 
        showNotification('商品已加入購物車！', 'success');
    },

    async updateItemQuantity(itemId, newQuantity) {
        await this.init();
        const accessToken = await _ensureValidAccessToken();
        await _modifyCart(accessToken, { type: 'UPDATE_ITEM_QUANTITY', payload: { itemId, newQuantity } });
        await _fetchCartSnapshot(accessToken);
    },

    async removeItem(itemId) {
        await this.init();
        const accessToken = await _ensureValidAccessToken();
        await _modifyCart(accessToken, { type: 'REMOVE_ITEM', payload: { itemId } });
        await _fetchCartSnapshot(accessToken);
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
        const accessToken = await _ensureValidAccessToken();
        localStorage.setItem('selectedShippingMethodId', shippingMethodId || '');
        await _fetchCartSnapshot(accessToken, { shippingMethodId: shippingMethodId || null });
    },

    async finalizeCheckout(checkoutData) {
        await this.init();
        const accessToken = await _ensureValidAccessToken();
        try {
            const { data, error } = await invokeWithTimeout('create-order-from-cart', accessToken, {
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
            throw error;
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
        localStorage.removeItem('cartAccessToken');
        localStorage.removeItem('supabase.auth.token');
        localStorage.removeItem('selectedShippingMethodId');
        localStorage.removeItem('appliedCouponCode');
        
        _state = {
            cartId: null, cartAccessToken: null, items: [], itemCount: 0,
            summary: { subtotal: 0, couponDiscount: 0, shippingFee: 0, total: 0 },
            appliedCoupon: null, availableShippingMethods: [], selectedShippingMethodId: null,
            shippingInfo: { freeShippingThreshold: 0, amountNeededForFreeShipping: 0 },
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