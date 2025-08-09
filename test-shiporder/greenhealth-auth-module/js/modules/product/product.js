// 档案路径: js/modules/product/product.js

/**
 * @file Product Service Module (商品服務模組)
 * @description 負責處理商品列表頁的資料獲取與渲染。
 */

// ✅ 【增加】明確引入 TABLE_NAMES 常數
import { supabase } from '../../core/supabaseClient.js';
import { TABLE_NAMES } from '../../core/constants.js';
import { ProductCard } from './components/ProductCard.js'; // 同時也修正 ProductCard 的引用

// --- DOM 元素获取 ---
const loadingView = document.getElementById('loading-view');
const productGrid = document.getElementById('product-grid');

// --- 核心函式 ---

/**
 * 從 Supabase 獲取所有已上架 (active) 的商品及其所有規格 (variants)。
 * @returns {Promise<Array|null>} 商品資料陣列，若出錯則回傳 null。
 */
async function fetchActiveProducts() {
    // ✅ 【修正】現在 TABLE_NAMES.PRODUCTS 可以被正確識別了
    const { data, error } = await supabase
        .from(TABLE_NAMES.PRODUCTS)
        .select(`
            *,
            product_variants (
                *
            )
        `)
        .eq('is_active', true);

    if (error) {
        console.error('讀取商品資料時發生錯誤:', error);
        return null;
    }

    return data;
}

/**
 * 將商品資料陣列渲染到指定的網格容器中。
 * @param {Array} products - 從 fetchActiveProducts 獲取的商品陣列。
 */
function renderProducts(products) {
    if (!products) {
        if (loadingView) loadingView.textContent = '載入商品時發生錯誤，請稍後再試。';
        return;
    }
    
    if (products.length === 0) {
        if (loadingView) loadingView.textContent = '目前沒有已上架的商品。';
        return;
    }

    // ✅ 【修正】現在 ProductCard 的呼叫是基於明確的 import
    const productsHtml = products.map(product => ProductCard(product)).join('');
    if (productGrid) {
        productGrid.innerHTML = productsHtml;
        productGrid.classList.remove('hidden');
    }
    if (loadingView) loadingView.classList.add('hidden');
}

/**
 * 由 app.js 呼叫的主初始化函式。
 */
export async function init() {
    const products = await fetchActiveProducts();
    renderProducts(products);
}