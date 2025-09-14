// ==============================================================================
// 檔案路徑: storefront-module/js/services/CartService.js
// 版本: v43.0 - 健壯性重構版 (Robust Refactor Edition)
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================
import { supabase } from '../core/supabaseClient.js';
import { showNotification } from '../core/utils.js';

// --- 模組內部狀態與設定 ---
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

// --- 私有輔助函式 ---

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
    if (!snapshot) return; // 保護措施，避免空快照清空狀態
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

/**
 * [v43.0 核心修正] 統一處理 API 回應的函式
 * @param {object} response - 來自 supabase.functions.invoke 的回應
 * @param {object} payload - 原始請求的 payload，用於日誌
 */
function _handleApiResponse(response, payload) {
    const { data: apiData, error: networkError } = response;

    if (networkError) {
        throw networkError; // 網路或函式級別的錯誤
    }

    // 後端業務邏輯錯誤 (例如：庫存不足)
    if (apiData.success === false) {
        // 【Bug #1 修正點】
        // 即使操作失敗，我們依然使用後端回傳的 `data` 快照來更新 UI，
        // 確保購物車內容不會被清空。
        if (apiData.data) {
            _updateStateFromSnapshot(apiData.data);
        }
        // 將後端的錯誤訊息拋出，讓呼叫者可以捕捉並顯示給使用者
        throw new Error(apiData.error?.message || '發生未知的業務邏輯錯誤。');
    }

    // 完全成功的操作
    if (apiData.success === true && apiData.data) {
        if (payload.shippingMethodId !== undefined) { 
            _state.selectedShippingMethodId = payload.shippingMethodId; 
        }
        _updateStateFromSnapshot(apiData.data);
    } else {
        // 對於未預期但不屬於錯誤的回應格式，進行記錄
        console.warn("API 回應格式非預期，但未標記為錯誤:", apiData);
    }
}


async function _recalculateCart(payload) {
    if (_state.isLoading) return;
    _state.isLoading = true;
    _notify();

    try {
        const response = await invokeWithTimeout('recalculate-cart', { body: { cartId: _state.cartId, ...payload } });
        // [v43.0 核心修正] 使用統一的處理函式
        _handleApiResponse(response, payload);
    } catch (error) {
        console.error('更新購物車失敗:', error);
        const userMessage = error.message.includes('逾時') ? '購物車連線逾時，請檢查您的網路環境後重試。' : error.message;
        showNotification(userMessage, 'error', 'notification-message');
        // 向上拋出，讓呼叫的 UI 元件可以捕捉並做出反應 (例如：停止轉圈)
        throw error;
    } finally {
        _state.isLoading = false;
        _notify();
    }
}

// --- 公開 API (Public API) ---

export const CartService = {
    async init() {
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
                    if (error) { 
                        console.warn('恢復匿名 Session 失敗，將重新獲取:', error.message);
                        this.clearCartAndState(); // 清除無效的本地狀態
                    }
                }

                if (!_state.cartId) {
                    console.log('🛒 本地無 cartId 或恢復失敗，執行遠端獲取...');
                    const response = await invokeWithTimeout('get-or-create-cart');
                    _handleApiResponse(response, {});
                    // 額外儲存匿名使用者資訊
                    if (response.data?.isAnonymous && response.data?.userId && response.data?.token) {
                        localStorage.setItem('anonymous_user_id', response.data.userId);
                        localStorage.setItem('anonymous_token', response.data.token);
                    } else {
                        localStorage.removeItem('anonymous_user_id');
                        localStorage.removeItem('anonymous_token');
                    }
                }
                
                // [v43.0 Bug #2 修正點]
                // 確保在初始化結束前，一定會獲取最新的運送方式與購物車狀態
                await Promise.all([
                    this.fetchShippingMethods(),
                    _recalculateCart({ couponCode: _state.appliedCoupon?.code, shippingMethodId: _state.selectedShippingMethodId })
                ]);
                
                _state.isReadyForRender = true;
                console.log(`🛒 購物車服務初始化完成 (使用者狀態: ${_state.isAnonymous ? '匿名' : '已認證'})`);
                _notify();
            } catch (error) {
                console.error('初始化購物車服務失敗:', error);
                const userMessage = error.message.includes('逾時') ? '初始化購物車失敗：連線逾時，請重新整理頁面。' : `初始化購物車失敗：${error.message}`;
                showNotification(userMessage, 'error', 'notification-message');
                _initPromise = null; _state.isReadyForRender = false; _notify(); throw error;
            }
        })();
        return _initPromise;
    },
    
    // ... 其他公開方法的內容保持不變 ...
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
        await this.init();
        await _recalculateCart({
            actions: [{ type: 'ADD_ITEM', payload: { variantId, quantity } }],
            couponCode: _state.appliedCoupon?.code,
            shippingMethodId: _state.selectedShippingMethodId
        });
        showNotification('商品已加入購物車！', 'success');
    },
    async updateItemQuantity(itemId, newQuantity) {
        if (!itemId || newQuantity < 0) return;
        await this.init();
        await _recalculateCart({
            actions: [{ type: 'UPDATE_ITEM_QUANTITY', payload: { itemId, newQuantity } }],
            couponCode: _state.appliedCoupon?.code,
            shippingMethodId: _state.selectedShippingMethodId
        });
    },
    async removeItem(itemId) {
        if (!itemId) return;
        await this.init();
        await _recalculateCart({
            actions: [{ type: 'REMOVE_ITEM', payload: { itemId } }],
            couponCode: _state.appliedCoupon?.code,
            shippingMethodId: _state.selectedShippingMethodId
        });
        showNotification('商品已從購物車移除。', 'info');
    },
    async applyCoupon(couponCode) {
        if (!couponCode || typeof couponCode !== 'string') return;
        await this.init();
        await _recalculateCart({ couponCode: couponCode.trim(), shippingMethodId: _state.selectedShippingMethodId });
    },
    async selectShippingMethod(shippingMethodId) {
        await this.init();
        await _recalculateCart({ shippingMethodId, couponCode: _state.appliedCoupon?.code });
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