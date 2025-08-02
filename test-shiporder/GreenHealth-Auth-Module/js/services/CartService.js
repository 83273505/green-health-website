// 檔案路徑: js/services/CartService.js (Final Refactored Version)
import { supabase } from '../core/supabaseClient.js';
import { showNotification } from '../core/utils.js';

let _state = {
    cartId: null, items: [], itemCount: 0,
    summary: { subtotal: 0, couponDiscount: 0, shippingFee: 0, total: 0 },
    appliedCoupon: null, availableShippingMethods: [], selectedShippingMethodId: null,
    isInitialized: false, isLoading: false,
};
let _subscribers = [];
let _initPromise = null;

function _updateStateFromSnapshot(snapshot) {
    _state.items = snapshot.items || [];
    _state.itemCount = snapshot.itemCount || 0;
    _state.summary = snapshot.summary || _state.summary;
    _state.appliedCoupon = snapshot.appliedCoupon || null;
    if (_state.appliedCoupon) localStorage.setItem('appliedCouponCode', _state.appliedCoupon.code);
    else localStorage.removeItem('appliedCouponCode');
    if (_state.selectedShippingMethodId) localStorage.setItem('selectedShippingMethodId', _state.selectedShippingMethodId);
    else localStorage.removeItem('selectedShippingMethodId');
    _notify();
}

function _notify() { _subscribers.forEach(callback => callback(_state)); }

async function _recalculateCart(payload) {
    if (_state.isLoading) return;
    _state.isLoading = true;
    showNotification('正在更新購物車...', 'info', 'notification-message');
    try {
        const { data: snapshot, error } = await supabase.functions.invoke('recalculate-cart', {
            body: { cartId: _state.cartId, ...payload },
        });
        if (error) throw error;
        if (snapshot.error) throw new Error(snapshot.error);
        if(payload.shippingMethodId) _state.selectedShippingMethodId = payload.shippingMethodId;
        _updateStateFromSnapshot(snapshot);
        showNotification('購物車已更新！', 'success', 'notification-message');
    } catch (error) {
        console.error('更新購物車失敗:', error);
        showNotification('購物車更新失敗，請重試。', 'error', 'notification-message');
    } finally {
        _state.isLoading = false;
    }
}

export const CartService = {
    init() {
        if (_initPromise) return _initPromise;
        _initPromise = (async () => {
            if (_state.isInitialized) return;
            try {
                const { data, error } = await supabase.functions.invoke('get-or-create-cart');
                if (error) throw error;
                if (data.error) throw new Error(data.error);
                _state.cartId = data.cartId;
                localStorage.setItem('cartId', _state.cartId);
                const savedCouponCode = localStorage.getItem('appliedCouponCode');
                const savedShippingId = localStorage.getItem('selectedShippingMethodId');
                _state.selectedShippingMethodId = savedShippingId;
                await this.fetchShippingMethods();
                await _recalculateCart({ couponCode: savedCouponCode, shippingMethodId: savedShippingId });
                _state.isInitialized = true;
                console.log(`購物車服務初始化完成，Cart ID: ${_state.cartId}`);
            } catch (error) {
                console.error('初始化購物車服務失敗:', error);
            }
        })();
        return _initPromise;
    },
    isReady: () => _state.isInitialized,
    async fetchShippingMethods() {
        const { data, error } = await supabase.from('shipping_rates').select('*').eq('is_active', true);
        if (!error) _state.availableShippingMethods = data;
    },
    async addToCart(variantId, quantity) {
        await _recalculateCart({
            actions: [{ type: 'ADD_ITEM', payload: { variantId, quantity } }],
            couponCode: _state.appliedCoupon?.code,
            shippingMethodId: _state.selectedShippingMethodId
        });
    },
    async updateItemQuantity(itemId, newQuantity) {
        await _recalculateCart({
            actions: [{ type: 'UPDATE_ITEM_QUANTITY', payload: { itemId, newQuantity } }],
            couponCode: _state.appliedCoupon?.code,
            shippingMethodId: _state.selectedShippingMethodId
        });
    },
    async removeItem(itemId) {
        await _recalculateCart({
            actions: [{ type: 'REMOVE_ITEM', payload: { itemId } }],
            couponCode: _state.appliedCoupon?.code,
            shippingMethodId: _state.selectedShippingMethodId
        });
    },
    async applyCoupon(couponCode) {
        await _recalculateCart({ couponCode, shippingMethodId: _state.selectedShippingMethodId });
    },
    async selectShippingMethod(shippingMethodId) {
        await _recalculateCart({ shippingMethodId, couponCode: _state.appliedCoupon?.code });
    },
    refreshWithSnapshot(snapshot) { _updateStateFromSnapshot(snapshot); },
    getState() { return { ..._state }; },
    subscribe(callback) {
        _subscribers.push(callback);
        callback(_state);
        return () => { _subscribers = _subscribers.filter(cb => cb !== callback); };
    },
};