// ==============================================================================
// 檔案路徑: storefront-module/js/core/app.js
// 版本: v33.0 - 統一流程與體驗終局
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file 商店前端 (Storefront) - 應用程式主入口點
 * @description 此腳本作為商店前端所有公開頁面的中央控制器。
 */

import { supabase } from './// 檔案路徑: storefront-module/js/core/app.js
/**
 * 檔案名稱：app.js
 * 檔案職責：商店前端（Storefront）應用程式的主入口點與中央指揮官。
 * 版本：34.0 (星型架構啟動版)
 * SOP 條款對應：
 * - [附加價值提案] 引入原生 JS 狀態管理器
 * AI 註記：
 * - [核心架構重構]: 此版本為對 `v33.0` 的根本性重構，以支持全新的「星型架構」。
 *   - `import` 區塊更新：現在會正確地導入新的 `cartStore` 與 `cartService`。
 *   - 新增 `initializeApp` 函式：此函式定義了一個全新的、更健壯的應用程式啟動流程。
 *     它確保了核心服務（如 `cartService` 的初始化）總是在任何頁面模組（如 `cart.js`）
 *     被加載之前完成，從根源上解決了 `404` 依賴解析錯誤。
 *   - 舊的 `CartService.init()` 呼叫，已被一個更複雜、更完整的初始化程序所取代。
 * - [操作指示]: 請完整覆蓋原檔案。
 */

import { supabase } from './supabaseClient.js';
import { cartStore } from '../stores/cartStore.js';
import { cartService } from '../services/cartService.js';
import { CartWidget } from '../components/CartWidget.js';
import { showNotification } from './utils.js';

/**
 * 應用程式的核心初始化程序
 * @returns {Promise<void>}
 */
async function initializeApp() {
    let _supabase;

    try {
        _supabase = await supabase;
        if (!_supabase) {
            throw new Error('CartService 初始化失敗：無法獲取 supabaseClient 實例。');
        }

        console.log('🛒 開始初始化購物車服務...');
        
        // 從本地儲存恢復狀態
        const restoredState = _restoreStateFromLocalStorage();
        let currentState = cartStore.get();
        cartStore.set({ 
            ...currentState, 
            cartId: restoredState.cartId,
            selectedShippingMethodId: restoredState.savedShippingId,
            isAnonymous: !!restoredState.anonymousUserId,
            appliedCoupon: restoredState.savedCouponCode ? { code: restoredState.savedCouponCode } : null
        });
        
        // 如果是匿名使用者，嘗試恢復會話
        if (restoredState.anonymousToken && restoredState.anonymousUserId) {
            console.log(`🔒 嘗試恢復匿名 Session: ${restoredState.anonymousUserId}`);
            const { error } = await _supabase.auth.setSession({ access_token: restoredState.anonymousToken, refresh_token: 'dummy_refresh_token' });
            if (error) {
                console.warn('恢復匿名 Session 失敗，將重新獲取:', error.message);
                _clearCartAndState();
            }
        }
        
        // 如果沒有購物車 ID，則從後端獲取或建立
        currentState = cartStore.get();
        if (!currentState.cartId) {
            console.log('🛒 本地無 cartId 或恢復失敗，執行遠端獲取...');
            const { data, error } = await cartService.internal.invokeWithTimeout('get-or-create-cart');
            if (error) throw error;
            if (data.error) throw new Error(data.error);
            
            cartStore.set({ 
                ...cartStore.get(), 
                cartId: data.cartId,
                isAnonymous: data.isAnonymous || false 
            });

            localStorage.setItem('cartId', data.cartId);
            if (data.isAnonymous && data.userId && data.token) {
                localStorage.setItem('anonymous_user_id', data.userId);
                localStorage.setItem('anonymous_token', data.token);
            } else {
                localStorage.removeItem('anonymous_user_id');
                localStorage.removeItem('anonymous_token');
            }
        }
        
        // 並行獲取運送方式與計算購物車初始總覽
        await Promise.all([
            cartService.internal.fetchShippingMethods(),
            cartService.internal.recalculateCart({ 
                couponCode: cartStore.get().appliedCoupon?.code, 
                shippingMethodId: cartStore.get().selectedShippingMethodId 
            })
        ]);
        
        // 標記應用程式已準備就緒
        const finalState = cartStore.get();
        cartStore.set({ ...finalState, isReadyForRender: true, isLoading: false });
        console.log(`🛒 購物車服務初始化完成 (使用者狀態: ${finalState.isAnonymous ? '匿名' : '已認證'})`);

    } catch (error) {
        const finalState = cartStore.get();
        cartStore.set({ ...finalState, isReadyForRender: false, isLoading: false });
        
        const userMessage = error.message.includes('逾時') ? '初始化購物車失敗：連線逾時，請重新整理頁面。' : `初始化購物-車失敗：${error.message}`;
        showNotification(userMessage, 'error');
        
        // 向上拋出錯誤，讓頂層知道初始化失敗
        throw error;
    }
}

// 將 CartService 的內部輔助函式移至此處，作為 app 級別的啟動邏輯
function _restoreStateFromLocalStorage() {
    try {
        const cartId = localStorage.getItem('cartId');
        if (!cartId) return {};
        return {
            cartId,
            savedCouponCode: localStorage.getItem('appliedCouponCode'),
            savedShippingId: localStorage.getItem('selectedShippingMethodId'),
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
        
        // 重置 store 狀態
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


// --- 應用程式主啟動流程 ---
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // 1. 初始化核心服務與狀態
        await initializeApp();

        // 2. 初始化通用 UI 元件
        CartWidget.init('cart-widget-container');

        // 3. 根據頁面 ID，載入並初始化對應的頁面模組
        const pageId = document.body.id;
        if (!pageId) return;

        let modulePath;
        switch (pageId) {
            case 'products-list':
                modulePath = '../modules/product/product.js';
                break;
            case 'product-detail':
                modulePath = '../modules/product/product-detail.js';
                break;
            case 'cart-page':
                modulePath = '../modules/cart/cart.js';
                break;
            case 'checkout':
                modulePath = '../modules/checkout/checkout.js';
                break;
            case 'order-success':
                modulePath = '../modules/order/order-success.js';
                break;
            case 'auth-terms':
                return;
            default:
                return; 
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