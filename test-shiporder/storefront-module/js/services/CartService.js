// ==============================================================================
// 檔案路徑: storefront-module/js/services/CartService.js
// 版本: v50.0 (權威身份驗證模式 - 最終決定版)
// 說明: 此版本徹底重寫了初始化邏輯，以遵循「前端主導身份，後端專職驗證」的
//       最終架構。它將主動確保匿名 Session 的存在，然後才與後端交互。
// ==============================================================================

import { supabase as getSupabase } from '../core/supabaseClient.js';
import { showNotification } from '../core/utils.js';

let _supabase = null;
let _state = {
    cartId: null,
    cartAccessToken: null, // 新增，用於匿名訪問
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

// [v50.0 核心修正] 新增一個健壯的、確保 Session 存在的函式
async function _ensureSession() {
    if (!_supabase) _supabase = await getSupabase;

    let { data: { session } } = await _supabase.auth.getSession();

    // 如果沒有 session，則主動、明確地進行匿名登入
    if (!session) {
        console.warn("🛒 未找到 Session，正在主動進行匿名登入...");
        const { data: anonSessionData, error: anonError } = await _supabase.auth.signInAnonymously();
        if (anonError) {
            console.error("❌ 匿名登入失敗:", anonError);
            throw new Error("無法建立匿名使用者 Session");
        }
        console.log("✅ 成功建立匿名 Session。");
        session = anonSessionData.session;
    }
    
    // 將最新的 token 設置到客戶端，以備後續所有 invoke 使用
    await _supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
    });

    return session;
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

// [v50.0] 更新請求標頭邏輯
function _getAuthHeaders() {
    const headers = { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${_supabase.auth.currentSession?.access_token}`
    };
    if (_state.cartAccessToken) {
        headers['X-Cart-Token'] = _state.cartAccessToken;
    }
    return headers;
}


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
        const { data, error } = await invokeWithTimeout('get-cart-snapshot', { 
            headers: _getAuthHeaders(),
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

async function _modifyCart(action) {
    _state.isLoading = true;
    _notify();
    try {
        const { data, error } = await invokeWithTimeout('manage-cart', { 
            headers: _getAuthHeaders(),
            body: { cartId: _state.cartId, action } 
        });
        if (error) throw error;
        if (data.success === false) throw new Error(data.error);
        return data;
    } catch (error) {
        console.error('修改購物車失敗:', error);
        showNotification(`操作失敗: ${error.message}`, 'error');
        await _fetchCartSnapshot(); 
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
                _supabase = await getSupabase;
                console.log('🛒 開始初始化購物車服務 (v50.0)...');

                // 步驟 1: 確保擁有一個有效的 Session
                await _ensureSession();

                // 步驟 2: 檢查本地是否有購物車憑證
                const { restored } = _restoreStateFromLocalStorage();

                // 如果沒有本地憑證，或需要驗證，則呼叫後端
                if (!restored) {
                    const { data: apiResponse, error } = await invokeWithTimeout('get-or-create-cart', {
                        headers: _getAuthHeaders()
                    });
                    
                    if (error) throw error;
                    if (!apiResponse.cartId || !apiResponse.cart_access_token) {
                        throw new Error("後端未能回傳有效的購物車憑證");
                    }
                    
                    _state.cartId = apiResponse.cartId;
                    _state.cartAccessToken = apiResponse.cart_access_token;
                    _saveStateToLocalStorage();
                }

                await this.fetchShippingMethods();
                await _fetchCartSnapshot();
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
            if (!_supabase) _supabase = await getSupabase;
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
                headers: _getAuthHeaders(),
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
        localStorage.removeItem('supabase.auth.token'); // Supabase JS v2 stores session here
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