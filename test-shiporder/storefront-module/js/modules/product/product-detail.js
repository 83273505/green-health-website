// ==============================================================================
// 檔案路徑: storefront-module/js/modules/product/product-detail.js
// 版本: v32.1 - 狀態同步勝利收官版
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Product Detail Module (商品詳情模組)
 * @description 處理商品詳情頁的資料獲取、渲染與加入購物車等互動邏輯。
 * @version v32.1
 * 
 * @update v32.1 - [STATE SYNCHRONIZATION FIX]
 * 1. [核心修正] `handleAddToCart` 函式現在呼叫的是統一的、中央的
 *          `CartService.addItem` 方法，取代了已被棄用的 `addToCart`。
 * 2. [錯誤解決] 此修改確保了在商品頁加入購物車的行為，能夠被中央的
 *          `CartService` 正確捕獲並觸發狀態更新通知，從而解決了行動端
 *          購物車圖示數量無法即時更新的問題。
 */

import { supabase } from '../../core/supabaseClient.js';
import { TABLE_NAMES } from '../../core/constants.js';
import { CartService } from '../../services/CartService.js';
import { formatPrice } from '../../core/utils.js';

const loadingView = document.getElementById('loading-view');
const detailContainer = document.getElementById('product-detail-container');
const productNameEl = document.getElementById('product-name');
const productDescriptionEl = document.getElementById('product-description');
const productImageEl = document.getElementById('product-image');
const variantSelectorEl = document.getElementById('variant-selector');
const priceEl = document.getElementById('price');
const addToCartForm = document.getElementById('add-to-cart-form');
const quantityInput = document.getElementById('quantity');

async function fetchProductByHandle(handle) {
    try {
        const client = await supabase;
        const { data, error } = await client
            .from(TABLE_NAMES.PRODUCTS)
            .select(`*, product_variants(*)`)
            .eq('handle', handle)
            .single();
        if (error) {
            console.error('讀取商品詳細資料時發生錯誤:', error);
            return null;
        }
        return data;
    } catch (error) {
        console.error('獲取 Supabase Client 或查詢商品時失敗:', error);
        return null;
    }
}

function renderProductDetails(product) {
    if (!product) {
        if (loadingView) loadingView.innerHTML = `<h1>找不到商品</h1><p>您尋找的商品可能已下架或不存在。</p><a href="/storefront-module/products.html">返回商品列表</a>`;
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

    function updateVariantDisplay() {
        if (!variantSelectorEl) return;
        const selectedVariantId = variantSelectorEl.value;
        const selectedVariant = product.product_variants.find(v => v.id === selectedVariantId);
        
        if (selectedVariant) {
            const hasSale = selectedVariant.sale_price && selectedVariant.sale_price > 0 && selectedVariant.sale_price < selectedVariant.price;
            if (priceEl) {
                if (hasSale) {
                    priceEl.innerHTML = `<span class="sale-price">${formatPrice(selectedVariant.sale_price)}</span> <span class="original-price"><s>${formatPrice(selectedVariant.price)}</s></span>`;
                } else {
                    priceEl.innerHTML = `<span>${formatPrice(selectedVariant.price)}</span>`;
                }
            }
            if (productImageEl) {
                productImageEl.style.backgroundImage = `url('${product.image_url || 'https://placehold.co/600x600/eeeeee/cccccc?text=無圖片'}')`;
            }
        }
    }
    
    if (variantSelectorEl) {
        variantSelectorEl.addEventListener('change', updateVariantDisplay);
    }
    updateVariantDisplay();

    if (loadingView) loadingView.classList.add('hidden');
    if (detailContainer) detailContainer.classList.remove('hidden');
}

async function handleAddToCart(event) {
    event.preventDefault();
    if (!variantSelectorEl || !quantityInput) return;
    const selectedVariantId = variantSelectorEl.value;
    const quantity = parseInt(quantityInput.value, 10);

    if (!selectedVariantId || isNaN(quantity) || quantity < 1) {
        alert('請選擇有效的規格與數量。');
        return;
    }
    
    // [v32.1] 核心修正: 呼叫統一的 addItem 方法
    await CartService.addItem({ variantId: selectedVariantId, quantity });
}

export async function init() {
    const urlParams = new URLSearchParams(window.location.search);
    const handle = urlParams.get('handle');

    if (!handle) {
        if (loadingView) loadingView.innerHTML = `<h1>無效的商品連結</h1><p>缺少商品識別碼，無法載入頁面。</p><a href="/storefront-module/products.html">返回商品列表</a>`;
        return;
    }

    const product = await fetchProductByHandle(handle);
    renderProductDetails(product);

    if (addToCartForm) {
        addToCartForm.addEventListener('submit', handleAddToCart);
    }
}