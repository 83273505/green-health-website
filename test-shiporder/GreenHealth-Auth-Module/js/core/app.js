// 檔案路径: js/core/app.js (Final Initialization Fix)

/**
 * @file 應用程式主入口點 (Application Entry Point)
 * @description 此腳本作為所有頁面的中央控制器。它會確保核心服務按順序初始化，
 *              然後才根據 HTML 頁面 <body> 標籤的 ID，動態地載入對應的業務邏輯模組。
 */

// 引入所有需要在应用程式启动时初始化的核心服务和全域元件
import { CartService } from '../services/CartService.js';
import { CartWidget } from '../components/CartWidget.js';
import { CartSidebar } from '../components/CartSidebar.js';

document.addEventListener('DOMContentLoaded', async () => {
    // ✅ 【釜底抽薪的最终修正】
    // 采用严格的异步初始化顺序，防止状态竞争问题。

    // 1. 首先，我们「等待」核心的购物车服务「完全」完成其初始化。
    //    这包括了它内部所有的状态验证、清理旧 cartId、以及从后端获取第一次正确状态的全部流程。
    await CartService.init();

    // 2. 只有在 CartService 准备就绪之后，我们才初始化所有依赖它的全域 UI 元件。
    //    这样可以确保 CartWidget 和 CartSidebar 在第一次渲染时，获取到的就是绝对正确的初始数据，
    //    从而彻底避免了“UI 闪烁”或显示旧状态的问题。
    CartWidget.init('cart-widget-container');
    CartSidebar.init(); 

    // 3. 最后，才根据页面 ID 载入特定页面的业务逻辑，这部分维持不变。
    const pageId = document.body.id;

    if (!pageId) {
        console.error('頁面初始化時缺少 body ID，無法載入業務模組。');
        return;
    }

    let modulePath;

    // 路由分发逻辑
    switch (pageId) {
        // --- 會員模組路由 ---
        case 'auth-login':
        case 'auth-callback':
        case 'auth-forgot-password':
        case 'auth-update-password':
        case 'auth-terms':
            modulePath = '../modules/auth/auth.js';
            break;
        
        case 'dashboard':
            modulePath = '../modules/dashboard/dashboard.js';
            break;
        
        case 'address-management':
            modulePath = '../modules/address/address.js';
            break;
        
        case 'profile-edit':
            modulePath = '../modules/profile/profile-edit.js';
            break;
        
        case 'profile-setup':
            modulePath = '../modules/profile/profile-setup.js';
            break;

        // --- 商店模組路由 ---
        case 'products-list':
            modulePath = '../modules/product/product.js';
            break;

        case 'product-detail':
            modulePath = '../modules/product/product-detail.js';
            break;
        
        default:
            // 对于没有特定 JS 逻辑的页面，安静地退出即可
            return; 
    }

    // 动态载入并执行对应模组的 init 方法
    if (modulePath) {
        import(modulePath)
            .then(module => {
                if (module && typeof module.init === 'function') {
                    module.init(pageId); 
                } else {
                    console.error(`模組 ${modulePath} 沒有正確匯出 init 函式或模組載入失敗。`);
                }
            })
            .catch(err => console.error(`載入模組 ${modulePath} 時發生錯誤:`, err));
    }
});