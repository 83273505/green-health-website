// 檔案路徑: storefront-module/js/core/app.js
// ==============================================================================
/**
 * 檔案名稱：app.js
 * 檔案職責：應用程式主入口點。初始化 CartService，並根據頁面動態載入模組。
 * 版本：v35.1 (韌性初始化修正版)
 * AI 註記：
 * - [核心修正] 將 `initializeCart` (購物車初始化) 與頁面模組載入 (如 product.js)
 *   的流程解耦，並使用 Promise.allSettled 來確保它們可以平行執行且互不阻塞。
 * - [錯誤解決] 此修正確保了即使購物車服務初始化失敗或逾時，商品列表頁面
 *   依然能夠成功載入並渲染商品，徹底解決「卡在載入畫面」的問題。
 */
import { supabase } from './supabaseClient.js';
import { cartStore } from '../stores/cartStore.js';
import { CartService } from '../services/CartService.js';
import { CartWidget } from '../components/CartWidget.js';
import { showNotification } from './utils.js';

async function initializeCart() {
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
                CartService.internal.clearCartAndState();
            }
        }

        if (!cartStore.get().cartId) {
            const { data, error } = await CartService.internal.invokeWithTimeout('get-or-create-cart');
            if (error) throw error;
            if (data.error) throw new Error(data.error.message);
            
            cartStore.set({ 
                ...cartStore.get(), 
                cartId: data.cartId, 
                isAnonymous: data.isAnonymous || false,
                anonymousUserId: data.userId, 
                anonymousToken: data.token 
            });
            CartService.internal.syncStateToLocalStorage();
        }

        await Promise.all([
            CartService.internal.fetchShippingMethods(),
            CartService.internal.recalculateCart({ 
                couponCode: cartStore.get().appliedCoupon?.code, 
                shippingMethodId: cartStore.get().selectedShippingMethodId 
            })
        ]);

        const finalState = cartStore.get();
        cartStore.set({ ...finalState, isReadyForRender: true, isLoading: false });
        console.log(`🛒 購物車服務初始化完成 (使用者狀態: ${finalState.isAnonymous ? '匿名' : '已認證'})`);
    } catch (error) {
        const finalState = cartStore.get();
        cartStore.set({ ...finalState, isReadyForRender: false, isLoading: false });
        const userMessage = error.message.includes('逾時') ? '初始化購物車失敗：連線逾時，部分功能可能受限。' : `初始化購物車失敗：${error.message}`;
        // 將致命錯誤降級為非阻塞通知
        showNotification(userMessage, 'warning'); 
        console.error('🛒 購物車服務初始化時發生非致命錯誤:', error);
    }
}

async function loadPageModule() {
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
        try {
            console.log(`📦 正在載入頁面模組: ${pageId}...`);
            const module = await import(modulePath);
            if (module && typeof module.init === 'function') {
                await module.init();
                console.log(`✅ 頁面模組 ${pageId} 初始化完成。`);
            }
        } catch (error) {
            console.error(`❌ 載入或初始化頁面模組 ${pageId} 時發生錯誤:`, error);
            // 可以在此處顯示一個對使用者更友善的錯誤提示，而不是讓整個頁面崩潰
            const mainContent = document.querySelector('main') || document.body;
            if (mainContent) {
                mainContent.innerHTML = '<h1>頁面內容載入失敗</h1><p>很抱歉，此頁面的特定功能無法載入，請稍後再試。</p>';
            }
        }
    }
}


function _restoreStateFromLocalStorage() {
    try {
        const cartId = localStorage.getItem('cartId');
        if (!cartId) return {};
        const appliedCouponCode = localStorage.getItem('appliedCouponCode');
        return {
            cartId,
            appliedCoupon: appliedCouponCode ? { code: appliedCouponCode } : null,
            selectedShippingMethodId: localStorage.getItem('selectedShippingMethodId'),
            anonymousUserId: localStorage.getItem('anonymous_user_id'),
            anonymousToken: localStorage.getItem('anonymous_token')
        };
    } catch (error) {
        console.warn('從 localStorage 恢復購物車狀態失敗:', error);
        return {};
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        // [核心修正] 將兩個獨立的初始化流程放入 Promise.allSettled
        // 這確保了它們會平行執行，且一個失敗不會阻塞另一個
        const results = await Promise.allSettled([
            initializeCart(),
            loadPageModule()
        ]);

        CartWidget.init('cart-widget-container');

        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                const processName = index === 0 ? '購物車初始化' : '頁面模組載入';
                console.error(`[APP STARTUP] ${processName} 過程中發生未處理的異常:`, result.reason);
            }
        });

    } catch (error) {
        console.error('❌ 商店前端初始化時發生致命錯誤:', error);
        document.body.innerHTML = '<h1>系統初始化失敗</h1><p>無法連接到後端服務，請稍後再試或聯繫管理員。</p>';
    }
});