// 檔案路徑: js/services/CartService.js (Pointing to V2 Function - Final Version)

import { supabase } from '../core/supabaseClient.js';
import { showNotification } from '../core/utils.js';
import { getCurrentUser } from '../core/session.js';
import { TABLE_NAMES } from '../core/constants.js';

let _state = {
    cartId: null,
    items: [],
    itemCount: 0,
    summary: { subtotal: 0, couponDiscount: 0, shippingFee: 0, total: 0 },
    appliedCoupon: null,
    availableShippingMethods: [],
    selectedShippingMethodId: null,
    isInitialized: false,
    isLoading: false,
};
let _subscribers = [];

function _updateStateFromSnapshot(snapshot) {
    _state.items = snapshot.items || [];
    _state.itemCount = snapshot.itemCount || 0;
    _state.summary = snapshot.summary || _state.summary;
    _state.appliedCoupon = snapshot.appliedCoupon || null;
    _notify();
}

function _notify() {
    _subscribers.forEach(callback => callback(_state));
}

async function _recalculateCart(payload) {
    if (_state.isLoading) return;
    _state.isLoading = true;
    showNotification('正在更新購物車...', 'info', 'notification-message');

    try {
        const requestBody = {
            cartId: _state.cartId,
            couponCode: _state.appliedCoupon?.code || payload.couponCode,
            shippingMethodId: _state.selectedShippingMethodId || payload.shippingMethodId,
            ...payload,
        };
        
        console.log("即將發送到 calculate-cart-v2 的請求 Body:", requestBody);

        // ✅ 【關鍵修正】
        // 將所有呼叫都指向我们新建立的、乾淨的 calculate-cart-v2 函式
        const { data: snapshot, error } = await supabase.functions.invoke('calculate-cart-v2', {
            body: requestBody,
        });

        if (error) throw error;
        if (snapshot.error) throw new Error(snapshot.error);
        
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
    async init() {
        if (_state.isInitialized) return;
        try {
            const validatedCartId = await this.validateAndGetCorrectCartId();
            if (!validatedCartId) {
                const { data, error } = await supabase.functions.invoke('get-or-create-cart');
                if (error) throw error;
                if (data.error) throw new Error(data.error);
                _state.cartId = data.cartId;
            } else {
                _state.cartId = validatedCartId;
            }
            localStorage.setItem('cartId', _state.cartId);
            await this.fetchShippingMethods();
            await _recalculateCart({});
            _state.isInitialized = true;
            console.log(`購物車服務初始化完成，Cart ID: ${_state.cartId}`);
        } catch (error) {
            console.error('初始化購物車服務失敗:', error);
            showNotification('購物車系統載入失敗，請重新整理頁面。', 'error', 'notification-message');
        }
    },

    async validateAndGetCorrectCartId() {
        const localCartId = localStorage.getItem('cartId');
        if (!localCartId) return null;
        const currentUser = await getCurrentUser();
        const { data: cartOwner, error } = await supabase.from('carts').select('user_id, users(is_anonymous)').eq('id', localCartId).single();
        if (error || !cartOwner) {
            localStorage.removeItem('cartId');
            return null;
        }
        const isCartAnonymous = cartOwner.users.is_anonymous;
        const isUserLoggedIn = currentUser && !currentUser.is_anonymous;
        if (isUserLoggedIn && isCartAnonymous) {
            console.log('偵測到使用者已登入，但購物車為匿名狀態。正在清除舊的匿名購物車...');
            localStorage.removeItem('cartId');
            return null;
        }
        return localCartId;
    },

    async fetchShippingMethods() {
        const { data, error } = await supabase.from('shipping_rates').select('*').eq('is_active', true);
        if (!error) {
            _state.availableShippingMethods = data;
            _notify();
        }
    },

    async addToCart(variantId, quantity) {
        const action = { type: 'ADD_ITEM', payload: { variantId, quantity } };
        await _recalculateCart({ actions: [action] });
    },

    async updateItemQuantity(itemId, newQuantity) {
        const action = { type: 'UPDATE_ITEM_QUANTITY', payload: { itemId, newQuantity } };
        await _recalculateCart({ actions: [action] });
    },

    async removeItem(itemId) {
        const action = { type: 'REMOVE_ITEM', payload: { itemId } };
        await _recalculateCart({ actions: [action] });
    },
    
    async applyCoupon(couponCode) {
        await _recalculateCart({ couponCode: couponCode });
    },
    
    async selectShippingMethod(shippingMethodId) {
        _state.selectedShippingMethodId = shippingMethodId;
        await _recalculateCart({ shippingMethodId: shippingMethodId });
    },

    getState() {
        return { ..._state };
    },

    subscribe(callback) {
        _subscribers.push(callback);
        callback(_state);
        return () => {
            _subscribers = _subscribers.filter(cb => cb !== callback);
        };
    },
};