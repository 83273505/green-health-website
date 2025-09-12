// 檔案路徑: storefront-module/js/core/app.js
// ==============================================================================

/**
 * 檔案名稱：app.js
 * 檔案職責：商店前端（Storefront）應用程式的主入口點與中央指揮官。
 * 版本：34.1 (命名同步修正版)
 * AI 註記：
 * - [核心修正]: 根據 `CartService.js` v1.1 的命名校準，此檔案中的 `import`
 *   語句已從 `cartService` (小寫 c) 更新為 `CartService` (大寫 C)，
 *   同時所有內部的函式呼叫也已同步更新，以確保命名一致性。
 * 更新日誌 (Changelog)：
 * - v34.1 (2025-09-12)：同步 `CartService` 的命名，以修復模組載入錯誤。
 */
import { supabase } from './supabaseClient.js';
import { cartStore } from '../stores/cartStore.js';
// 【核心修正】將 `cartService` 修正為 `CartService`
import { CartService } from '../services/CartService.js';
import { CartWidget } from '../components/CartWidget.js';
import { showNotification } from './utils.js';

async function initializeApp() {
    let _supabase;
    try {
        _supabase = await supabase;
        if (!_supabase) throw new Error('Supabase client 初始化失敗');
        console.log('🛒 開始初始化購物車服務...');
        const restoredState = _restoreStateFromLocalStorage();
        cartStore.set({ ...cartStore.get(), ...restoredState });
        if (restoredState.anonymousToken && restoredState.anonymousUserId) {
            const { error } = await _supabase.auth.setSession({ access_token: restoredState.anonymousToken, refresh_token: 'dummy_refresh_token' });
            if (error) {
                console.warn('恢復匿名 Session 失敗:', error.message);
                _clearCartAndState();
            }
        }
        if (!cartStore.get().cartId) {
            // 【核心修正】將 `cartService` 修正為 `CartService`
            const { data, error } = await CartService.internal.invokeWithTimeout('get-or-create-cart');
            if (error) throw error;
            if (data.error) throw new Error(data.error);
            cartStore.set({ ...cartStore.get(), cartId: data.cartId, isAnonymous: data.isAnonymous || false });
            localStorage.setItem('cartId', data.cartId);
            if (data.isAnonymous && data.userId && data.token) {
                localStorage.setItem('anonymous_user_id', data.userId);
                localStorage.setItem('anonymous_token', data.token);
            } else {
                localStorage.removeItem('anonymous_user_id');
                localStorage.removeItem('anonymous_token');
            }
        }
        await Promise.all([
            // 【核心修正】將 `cartService` 修正為 `CartService`
            CartService.internal.fetchShippingMethods(),
            CartService.internal.recalculateCart({ couponCode: cartStore.get().appliedCoupon?.code, shippingMethodId: cartStore.get().selectedShippingMethodId })
        ]);
        const finalState = cartStore.get();
        cartStore.set({ ...finalState, isReadyForRender: true, isLoading: false });
        console.log(`🛒 購物車服務初始化完成 (使用者狀態: ${finalState.isAnonymous ? '匿名' : '已認證'})`);
    } catch (error) {
        const finalState = cartStore.get();
        cartStore.set({ ...finalState, isReadyForRender: false, isLoading: false });
        const userMessage = error.message.includes('逾時') ? '初始化購物車失敗：連線逾時，請重新整理頁面。' : `初始化購物車失敗：${error.message}`;
        showNotification(userMessage, 'error');
        throw error;
    }
}

function _restoreStateFromLocalStorage() {
    try {
        const cartId = localStorage.getItem('cartId');
        if (!cartId) return {};
        return {
            cartId,
            appliedCoupon: localStorage.getItem('appliedCouponCode') ? { code: localStorage.getItem('appliedCouponCode') } : null,
            selectedShippingMethodId: localStorage.getItem('selectedShippingMethodId'),
            anonymousUserId: localStorage.getItem('anonymous_user_id'),
            anonymousToken: localStorage.getItem('anonymous_token')
        };
    } catch (error) {
        console.warn('從 localStorage 恢復購物車狀態失敗:', error);
        return {};
    }
}

function _clearCartAndState() {
    try {
        localStorage.removeItem('cartId');
        localStorage.removeItem('appliedCouponCode');
        localStorage.removeItem('selectedShippingMethodId');
        localStorage.removeItem('anonymous_user_id');
        localStorage.removeItem('anonymous_token');
        cartStore.set({
            cartId: null, items: [], itemCount: 0,
            summary: { subtotal: 0, couponDiscount: 0, shippingFee: 0, total: 0 },
            appliedCoupon: null, availableShippingMethods: [], selectedShippingMethodId: null,
            shippingInfo: { freeShippingThreshold: 0, amountNeededForFreeShipping: 0 },
            isLoading: false, isAnonymous: false, isReadyForRender: false,
        });
        console.log('🛒 購物車本地狀態已完全清除。');
    } catch (error) {
        console.error('清除購物車狀態時發生錯誤:', error);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await initializeApp();
        CartWidget.init('cart-widget-container');
        const pageId = document.body.id;
        if (!pageId) return;
        let modulePath;
        switch (pageId) {
            case 'products-list': modulePath = '../modules/product/product.js'; break;
            case 'product-detail': modulePath = '../modules/product/product-detail.js'; break;
            case 'cart-page': modulePath = '../modules/cart/cart.js'; break;
            case 'checkout': modulePath = '../modules/checkout/checkout.js'; break;
            case 'order-success': modulePath = '../modules/order/order-success.js'; break;
            default: return; 
        }
        if (modulePath) {
            const module = await import(modulePath);
            if (module && typeof module.init === 'function') {
                await module.init();
            }
        }
    } catch (error) {
        console.error('❌ 商店前端初始化時發生致命錯誤:', error);
        document.body.innerHTML = '<h1>系統初始化失敗</h1><p>無法連接到後端服務，請稍後再試或聯繫管理員。</p>';
    }
});