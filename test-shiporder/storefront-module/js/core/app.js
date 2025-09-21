// ==============================================================================
// 診斷版 app.js - 用於找出初始化問題
// ==============================================================================

console.log('🚀 開始載入 app.js');

document.addEventListener('DOMContentLoaded', async () => {
    console.log('📄 DOM 已載入，開始初始化應用程式');
    
    try {
        // 步驟 1: 檢查基礎模組載入
        console.log('🔍 步驟 1: 檢查模組載入');
        
        let supabaseModule, CartServiceModule, CartWidgetModule;
        
        try {
            console.log('📦 載入 supabaseClient...');
            supabaseModule = await import('./supabaseClient.js');
            console.log('✅ supabaseClient 載入成功:', !!supabaseModule);
        } catch (error) {
            console.error('❌ supabaseClient 載入失敗:', error);
            throw new Error(`supabaseClient 載入失敗: ${error.message}`);
        }

        try {
            console.log('📦 載入 CartService...');
            CartServiceModule = await import('../services/CartService.js');
            console.log('✅ CartService 載入成功:', !!CartServiceModule.CartService);
        } catch (error) {
            console.error('❌ CartService 載入失敗:', error);
            throw new Error(`CartService 載入失敗: ${error.message}`);
        }

        try {
            console.log('📦 載入 CartWidget...');
            CartWidgetModule = await import('../components/CartWidget.js');
            console.log('✅ CartWidget 載入成功:', !!CartWidgetModule.CartWidget);
        } catch (error) {
            console.error('❌ CartWidget 載入失敗:', error);
            throw new Error(`CartWidget 載入失敗: ${error.message}`);
        }

        // 步驟 2: 初始化 Supabase
        console.log('🔍 步驟 2: 初始化 Supabase 客戶端');
        let supabaseClient;
        
        try {
            // 檢查 supabase 的類型
            console.log('🔍 supabaseModule.supabase 類型:', typeof supabaseModule.supabase);
            
            if (typeof supabaseModule.supabase === 'object' && supabaseModule.supabase.then) {
                console.log('📋 supabase 是 Promise，等待解析...');
                supabaseClient = await supabaseModule.supabase;
            } else {
                console.log('📋 supabase 是同步物件');
                supabaseClient = supabaseModule.supabase;
            }
            
            console.log('✅ Supabase 客戶端獲取成功:', !!supabaseClient);
            console.log('🔍 Supabase 客戶端方法:', Object.keys(supabaseClient || {}));
            
        } catch (error) {
            console.error('❌ Supabase 客戶端初始化失敗:', error);
            throw new Error(`Supabase 初始化失敗: ${error.message}`);
        }

        // 步驟 3: 初始化 CartService
        console.log('🔍 步驟 3: 初始化 CartService');
        try {
            const { CartService } = CartServiceModule;
            console.log('🔍 CartService.init 方法存在:', typeof CartService.init === 'function');
            
            console.log('🛒 開始初始化 CartService...');
            await CartService.init(supabaseClient);
            console.log('✅ CartService 初始化成功');
            
        } catch (error) {
            console.error('❌ CartService 初始化失敗:', error);
            console.error('❌ CartService 錯誤詳情:', {
                name: error.name,
                message: error.message,
                stack: error.stack
            });
            throw new Error(`CartService 初始化失敗: ${error.message}`);
        }

        // 步驟 4: 初始化 CartWidget
        console.log('🔍 步驟 4: 初始化 CartWidget');
        try {
            const { CartWidget } = CartWidgetModule;
            console.log('🔍 CartWidget.init 方法存在:', typeof CartWidget.init === 'function');
            
            // 檢查容器是否存在
            const container = document.getElementById('cart-widget-container');
            console.log('🔍 cart-widget-container 存在:', !!container);
            
            if (container) {
                console.log('🎨 開始初始化 CartWidget...');
                CartWidget.init('cart-widget-container');
                console.log('✅ CartWidget 初始化成功');
            } else {
                console.warn('⚠️ cart-widget-container 不存在，跳過 CartWidget 初始化');
            }
            
        } catch (error) {
            console.error('❌ CartWidget 初始化失敗:', error);
            // CartWidget 失敗不應該中斷整個應用，只記錄錯誤
        }

        // 步驟 5: 頁面模組初始化
        console.log('🔍 步驟 5: 頁面模組初始化');
        const pageId = document.body.id;
        console.log('🔍 當前頁面 ID:', pageId);
        
        if (!pageId) {
            console.warn('⚠️ 頁面沒有設定 ID，跳過頁面模組載入');
            return;
        }

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
                console.log('📋 auth-terms 頁面，不需要模組');
                return;
            default:
                console.log('📋 未知頁面 ID，不載入模組');
                return; 
        }

        console.log('🔍 準備載入頁面模組:', modulePath);

        if (modulePath) {
            try {
                const module = await import(modulePath);
                console.log('✅ 頁面模組載入成功:', !!module);
                
                if (module && typeof module.init === 'function') {
                    console.log('🚀 執行頁面模組初始化...');
                    await module.init(pageId);
                    console.log('✅ 頁面模組初始化成功');
                } else {
                    console.warn('⚠️ 頁面模組沒有 init 方法');
                }
            } catch (error) {
                console.error('❌ 頁面模組載入/初始化失敗:', error);
                throw new Error(`頁面模組 ${modulePath} 失敗: ${error.message}`);
            }
        }

        console.log('🎉 應用程式初始化完成！');

    } catch (error) {
        console.error('💥 商店前端初始化時發生致命錯誤:', error);
        console.error('💥 錯誤堆疊:', error.stack);
        
        // 提供更友善的錯誤訊息
        const errorContainer = document.createElement('div');
        errorContainer.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(255,255,255,0.95); z-index: 10000;
            display: flex; align-items: center; justify-content: center;
            font-family: Arial, sans-serif;
        `;
        
        errorContainer.innerHTML = `
            <div style="text-align: center; max-width: 600px; padding: 2rem;">
                <h1 style="color: #dc2626; margin-bottom: 1rem;">⚠️ 系統初始化失敗</h1>
                <p style="color: #374151; margin-bottom: 1rem;">
                    無法正常載入購物系統，請檢查以下可能原因：
                </p>
                <ul style="text-align: left; color: #6b7280;">
                    <li>網路連線是否正常</li>
                    <li>瀏覽器是否支援現代 JavaScript</li>
                    <li>是否有瀏覽器擴充功能干擾</li>
                </ul>
                <p style="color: #dc2626; margin-top: 1rem; font-family: monospace;">
                    錯誤詳情: ${error.message}
                </p>
                <button onclick="location.reload()" 
                        style="margin-top: 1rem; padding: 0.5rem 1rem; 
                               background: #3b82f6; color: white; border: none; 
                               border-radius: 4px; cursor: pointer;">
                    重新載入頁面
                </button>
            </div>
        `;
        
        document.body.appendChild(errorContainer);
    }
});