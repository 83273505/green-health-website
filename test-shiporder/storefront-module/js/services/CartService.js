// ==============================================================================
// 檔案路徑: storefront-module/js/services/CartService.js
// 版本: v32.4 - 後端驅動體驗
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

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
    // 【核心新增】新增用於儲存後端計算結果的狀態
    shippingInfo: {
        freeShippingThreshold: 0,
        amountNeededForFreeShipping: 0
    },
    isLoading: false,
    isAnonymous: false,
    isReadyForRender: false, 
};
let _subscribers = [];
let _initPromise = null;

function _restoreStateFromLocalStorage() {
    try {
        const cartId = localStorage.getItem('cartId');
        const savedCouponCode = localStorage.getItem('appliedCouponCode');
        const savedShippingId = localStorage.getItem('selectedShippingMethodId');
        const anonymousUserId = localStorage.getItem('anonymous_user_id');
        
        if (cartId) {
            _state.cartId = cartId;
            _state.selectedShippingMethodId = savedShippingId;
            _state.isAnonymous = !!anonymousUserId;
            if (savedCouponCode) {
                _state.appliedCoupon = { code: savedCouponCode };
            }
            console.log(`🛒 從 localStorage 恢復購物車狀態: Cart ID ${cartId}, 匿名模式: ${_state.isAnonymous}`);
            return true;
        }
    } catch (error) {
        console.warn('從 localStorage 恢復購物車狀態失敗:', error);
    }
    return false;
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
    _state.items = snapshot.items || [];
    _state.itemCount = snapshot.itemCount || 0;
    _state.summary = snapshot.summary || _state.summary;
    _state.appliedCoupon = snapshot.appliedCoupon || null;
    // 【核心新增】更新來自後端的免運資訊
    _state.shippingInfo = snapshot.shippingInfo || _state.shippingInfo;
    _saveStateToLocalStorage();
    _notify();
}

function _notify() { 
    _subscribers.forEach(callback => {
        try {
            callback(_state);
        } catch (error) {
            console.warn('購物車狀態通知回呼函式執行失敗:', error);
        }
    });
}

async function _recalculateCart(payload) {
    if (_state.isLoading) {
        return;
    }
    _state.isLoading = true;
    _notify();
    try {
        const { data: snapshot, error } = await _supabase.functions.invoke('recalculate-cart', {
            body: { cartId: _state.cartId, ...payload },
        });
        
        if (error) throw error;
        if (snapshot.error) throw new Error(snapshot.error);
        
        if (payload.shippingMethodId !== undefined) {
            _state.selectedShippingMethodId = payload.shippingMethodId;
        }
        _updateStateFromSnapshot(snapshot);
    } catch (error) {
        console.error('更新購物車失敗:', error);
        showNotification('購物車更新失敗，請重試。', 'error', 'notification-message');
        throw error;
    } finally {
        _state.isLoading = false;
        _notify();
    }
}

export const CartService = {
    init(supabaseClient) {
        if (_state.isReadyForRender) return Promise.resolve();
        if (_initPromise) return _initPromise;

        _initPromise = (async () => {
            _state.isReadyForRender = false;
            try {
                if (!supabaseClient) {
                    throw new Error('CartService 初始化失敗：缺少 supabaseClient 實例。');
                }
                _supabase = supabaseClient;

                console.log('🛒 開始初始化購物車服務...');
                _restoreStateFromLocalStorage();
                
                if (!_state.cartId) {
                    console.log('🛒 本地無 cartId，執行遠端獲取...');
                    const { data, error } = await _supabase.functions.invoke('get-or-create-cart');
                    if (error) throw error;
                    if (data.error) throw new Error(data.error);

                    _state.cartId = data.cartId;
                    _state.isAnonymous = data.isAnonymous || false;
                    localStorage.setItem('cartId', _state.cartId);

                    if (data.isAnonymous && data.userId) {
                        localStorage.setItem('anonymous_user_id', data.userId);
                    } else {
                        localStorage.removeItem('anonymous_user_id');
                    }
                }

                await Promise.all([
                    this.fetchShippingMethods(),
                    _recalculateCart({ 
                        couponCode: _state.appliedCoupon?.code, 
                        shippingMethodId: _state.selectedShippingMethodId 
                    })
                ]);
                
                _state.isReadyForRender = true;
                console.log(`🛒 購物車服務初始化完成 (使用者狀態: ${_state.isAnonymous ? '匿名' : '已認證'})`);
                _notify();

            } catch (error) {
                console.error('初始化購物車服務失敗:', error);
                _initPromise = null;
                _state.isReadyForRender = false;
                _notify();
                throw error;
            }
        })();
        
        return _initPromise;
    },
    
    isReady: () => _state.isReadyForRender,
    
    async fetchShippingMethods(retry = true) {
        try {
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
    
    async addToCart(variantId, quantity) {
        if (!variantId || !(quantity > 0)) {
            return showNotification('無效的商品或數量。', 'error');
        }
        await this.init(_supabase);
        try {
            await _recalculateCart({
                actions: [{ type: 'ADD_ITEM', payload: { variantId, quantity } }],
                couponCode: _state.appliedCoupon?.code,
                shippingMethodId: _state.selectedShippingMethodId
            });
            showNotification('商品已加入購物車！', 'success');
        } catch (error) {
            console.error('addToCart 失敗:', error);
        }
    },
    
    async updateItemQuantity(itemId, newQuantity) {
        if (!itemId || newQuantity < 0) return;
        await this.init(_supabase);
        await _recalculateCart({
            actions: [{ type: 'UPDATE_ITEM_QUANTITY', payload: { itemId, newQuantity } }],
            couponCode: _state.appliedCoupon?.code,
            shippingMethodId: _state.selectedShippingMethodId
        });
    },
    
    async removeItem(itemId) {
        if (!itemId) return;
        await this.init(_supabase);
        await _recalculateCart({
            actions: [{ type: 'REMOVE_ITEM', payload: { itemId } }],
            couponCode: _state.appliedCoupon?.code,
            shippingMethodId: _state.selectedShippingMethodId
        });
        showNotification('商品已從購物車移除。', 'info');
    },
    
    async applyCoupon(couponCode) {
        if (!couponCode || typeof couponCode !== 'string') return;
        await this.init(_supabase);
        await _recalculateCart({ couponCode: couponCode.trim(), shippingMethodId: _state.selectedShippingMethodId });
    },
    
    async selectShippingMethod(shippingMethodId) {
        await this.init(_supabase);
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
            try {
                callback(_state);
            } catch (error) {
                console.warn('初始化訂閱回呼時發生錯誤:', error);
            }
        }
        return () => { _subscribers = _subscribers.filter(cb => cb !== callback); };
    },

    clearCartAndState() {
        try {
            localStorage.removeItem('cartId');
            localStorage.removeItem('appliedCouponCode');
            localStorage.removeItem('selectedShippingMethodId');
            localStorage.removeItem('anonymous_user_id');
            
            _state = {
                cartId: null, items: [], itemCount: 0,
                summary: { subtotal: 0, couponDiscount: 0, shippingFee: 0, total: 0 },
                appliedCoupon: null, availableShippingMethods: [], selectedShippingMethodId: null,
                shippingInfo: { freeShippingThreshold: 0, amountNeededForFreeShipping: 0 }, // 重設
                isLoading: false, isAnonymous: false,
                isReadyForRender: false,
            };
            
            _initPromise = null;
            _notify();
            console.log('🛒 購物車本地狀態已完全清除。');
        } catch (error) {
            console.error('清除購物車狀態時發生錯誤:', error);
        }
    },

    isLoading() { return _state.isLoading; },

    async forceReinit() {
        console.log('🛒 強制重新初始化購物車...');
        this.clearCartAndState();
        return await this.init(_supabase);
    }
};