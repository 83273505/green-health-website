// 檔案路徑: js/modules/product/product-detail.js

import { supabase } from '../../core/supabaseClient.js';
import { TABLE_NAMES } from '../../core/constants.js';
import { CartService } from '../../services/CartService.js';
import { formatPrice } from '../../core/utils.js';

// --- DOM 元素獲取 ---
const loadingView = document.getElementById('loading-view');
const detailContainer = document.getElementById('product-detail-container');
const productNameEl = document.getElementById('product-name');
const productDescriptionEl = document.getElementById('product-description');
const productImageEl = document.getElementById('product-image');
const variantSelectorEl = document.getElementById('variant-selector');
const priceEl = document.getElementById('price');
const addToCartForm = document.getElementById('add-to-cart-form');
const quantityInput = document.getElementById('quantity');

/**
 * 根據 URL 中的 handle 參數，從 Supabase 獲取單一商品的完整資料。
 */
async function fetchProductByHandle(handle) {
    // 這個查詢會將 product_variants 作為一個陣列嵌套在 product 物件中一併回傳
    const { data, error } = await supabase
        .from(TABLE_NAMES.PRODUCTS)
        .select(`*, product_variants(*)`)
        .eq('handle', handle)
        .single();

    if (error) {
        console.error('讀取商品詳細資料時發生錯誤:', error);
        return null;
    }
    return data;
}

/**
 * 將獲取到的商品資料渲染到頁面上。
 */
function renderProductDetails(product) {
    if (!product) {
        if (loadingView) loadingView.innerHTML = `<h1>找不到商品</h1><p>您尋找的商品可能已下架或不存在。</p><a href="./products.html">返回商品列表</a>`;
        return;
    }

    if (productNameEl) productNameEl.textContent = product.name;
    if (productDescriptionEl) productDescriptionEl.innerHTML = product.description.replace(/\n/g, '<br>');

    if (variantSelectorEl) {
        variantSelectorEl.innerHTML = '';
        product.product_variants.forEach(variant => {
            if (variant.is_active) {
                let optionText = `${variant.name}`;
                const hasSale = variant.sale_price && variant.sale_price > 0 && variant.sale_price < variant.price;
                if (hasSale) {
                    optionText += ` - ${formatPrice(variant.sale_price)} (原價 ${formatPrice(variant.price)})`;
                } else {
                    optionText += ` - ${formatPrice(variant.price)}`;
                }
                const option = new Option(optionText, variant.id);
                variantSelectorEl.add(option);
            }
        });
    }

    // 負責更新主價格區和圖片的函式
    function updateVariantDisplay() {
        if (!variantSelectorEl) return;
        const selectedVariantId = variantSelectorEl.value;
        const selectedVariant = product.product_variants.find(v => v.id === selectedVariantId);
        
        if (selectedVariant) {
            // 更新價格顯示的邏輯維持不變
            const hasSale = selectedVariant.sale_price && selectedVariant.sale_price > 0 && selectedVariant.sale_price < selectedVariant.price;
            if (priceEl) {
                if (hasSale) {
                    priceEl.innerHTML = `<span class="sale-price">${formatPrice(selectedVariant.sale_price)}</span> <span class="original-price"><s>${formatPrice(selectedVariant.price)}</s></span>`;
                } else {
                    priceEl.innerHTML = `<span>${formatPrice(selectedVariant.price)}</span>`;
                }
            }
            
            // ✅ 【關鍵修正】圖片 URL 應該直接從主 product 物件中獲取，而不是從 variant 中獲取。
            //    這樣確保了無論選擇哪個規格，主圖都保持不變。
            if (productImageEl) {
                productImageEl.style.backgroundImage = `url('${product.image_url || 'https://placehold.co/600x600/eeeeee/cccccc?text=無圖片'}')`;
            }
        }
    }
    
    if (variantSelectorEl) {
        variantSelectorEl.addEventListener('change', updateVariantDisplay);
    }
    updateVariantDisplay(); // 初始載入時就執行一次

    if (loadingView) loadingView.classList.add('hidden');
    if (detailContainer) detailContainer.classList.remove('hidden');
}

/**
 * 處理「加入購物車」表單的提交事件
 */
async function handleAddToCart(event) {
    event.preventDefault();
    if (!variantSelectorEl || !quantityInput) return;
    const selectedVariantId = variantSelectorEl.value;
    const quantity = parseInt(quantityInput.value, 10);

    if (!selectedVariantId || isNaN(quantity) || quantity < 1) {
        alert('請選擇有效的規格與數量。');
        return;
    }
    await CartService.addToCart(selectedVariantId, quantity);
}

/**
 * 由 app.js 呼叫的主初始化函式
 */
export async function init() {
    const urlParams = new URLSearchParams(window.location.search);
    const handle = urlParams.get('handle');

    if (!handle) {
        if (loadingView) loadingView.innerHTML = `<h1>無效的商品連結</h1><p>缺少商品識別碼，無法載入頁面。</p><a href="./products.html">返回商品列表</a>`;
        return;
    }

    const product = await fetchProductByHandle(handle);
    renderProductDetails(product);

    if (addToCartForm) {
        addToCartForm.addEventListener('submit', handleAddToCart);
    }
}