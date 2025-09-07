// 檔案路徑: storefront-module/js/modules/product/product-detail.js
/**
 * 檔案名稱：product-detail.js
 * 檔案職責：處理商品詳情頁的資料獲取、渲染、並整合即時庫存狀態顯示與貨到通知功能。
 * 版本：33.0 (庫存體驗昇華版)
 * SOP 條款對應：
 * - [1.1.1] 驗收標準鐵律
 * - [4.7] 使用者體驗迴歸測試
 * AI 註記：
 * - [核心昇華]: 此版本為重大功能升級。
 *   - 新增 `displayStockStatus` 函式，負責在頁面載入時，非同步呼叫新的後端 Edge Function
 *     (`get-product-stock-status`) 來獲取即時庫存狀態。
 *   - 在 `renderProductDetails` 中新增了 UI 元素 (骨架屏、狀態文字、通知按鈕)，並由
 *     `displayStockStatus` 函式根據後端回傳的狀態 (IN_STOCK, LOW_STOCK, OUT_OF_STOCK)
 *     進行動態渲染。
 *   - 當商品售完時，「加入購物車」按鈕將被禁用，並顯示「貨到通知我」按鈕。
 *   - 新增 `handleRequestNotification` 函式，用於處理「貨到通知我」的點擊事件，
 *     它將呼叫我們下一步會提供的 `request-stock-notification` Edge Function。
 * - [操作指示]: 請完整覆蓋原檔案。
 * 更新日誌 (Changelog)：
 * - v33.0 (2025-09-09)：[FEATURE] 整合即時庫存狀態顯示與貨到通知功能。
 * - v32.1 (2025-09-09)：修正狀態同步問題。
 */

import { supabase } from '../../core/supabaseClient.js';
import { TABLE_NAMES } from '../../core/constants.js';
import { CartService } from '../../services/CartService.js';
import { formatPrice, showNotification } from '../../core/utils.js';

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
// [v33.0 新增] 庫存狀態相關 DOM 元素
const stockStatusContainerEl = document.getElementById('stock-status-container');
const addToCartBtn = document.getElementById('add-to-cart-btn');
const requestNotificationBtn = document.getElementById('request-notification-btn');

let currentProduct = null;

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
        currentProduct = data; // 保存當前商品資料
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
            // [v33.0 新增] 當規格變更時，重新觸發庫存查詢
            displayStockStatus(selectedVariantId);
        }
    }
    
    if (variantSelectorEl) {
        variantSelectorEl.addEventListener('change', updateVariantDisplay);
    }
    updateVariantDisplay(); // 初始觸發一次

    if (loadingView) loadingView.classList.add('hidden');
    if (detailContainer) detailContainer.classList.remove('hidden');
}

/**
 * [v33.0 新增] 顯示庫存狀態的核心函式
 * @param {string} variantId 要查詢的商品規格 ID
 */
async function displayStockStatus(variantId) {
    if (!stockStatusContainerEl || !addToCartBtn || !requestNotificationBtn) return;

    // 1. 顯示骨架屏載入狀態
    stockStatusContainerEl.innerHTML = `<div class="skeleton-loader"></div>`;
    addToCartBtn.disabled = true;
    addToCartBtn.classList.remove('hidden');
    requestNotificationBtn.classList.add('hidden');

    try {
        const client = await supabase;
        const { data, error } = await client.functions.invoke('get-product-stock-status', {
            body: { variantIds: [variantId] }
        });

        if (error) throw new Error(`API 呼叫失敗: ${error.message}`);
        if (!data.success || !data.data || data.data.length === 0) {
            throw new Error(data.error?.message || '從 API 獲取庫存狀態失敗');
        }

        const stockInfo = data.data[0];
        let statusHtml = '';
        let statusClass = '';

        // 2. 根據 API 回應更新 UI
        switch (stockInfo.stock_status) {
            case 'IN_STOCK':
                statusClass = 'status-in-stock';
                statusHtml = '庫存充足';
                addToCartBtn.disabled = false;
                break;
            case 'LOW_STOCK':
                statusClass = 'status-low-stock';
                statusHtml = '庫存緊張';
                addToCartBtn.disabled = false;
                break;
            case 'OUT_OF_STOCK':
                statusClass = 'status-out-of-stock';
                statusHtml = '已售完';
                addToCartBtn.classList.add('hidden');
                requestNotificationBtn.classList.remove('hidden');
                break;
            default:
                statusHtml = '狀態未知';
                break;
        }

        stockStatusContainerEl.innerHTML = `<span class="${statusClass}">${statusHtml}</span>`;

    } catch (error) {
        console.error("更新庫存狀態時發生錯誤:", error);
        stockStatusContainerEl.innerHTML = `<span class="status-out-of-stock">無法獲取庫存</span>`;
    }
}

async function handleAddToCart(event) {
    event.preventDefault();
    if (!variantSelectorEl || !quantityInput) return;
    const selectedVariantId = variantSelectorEl.value;
    const quantity = parseInt(quantityInput.value, 10);

    if (!selectedVariantId || isNaN(quantity) || quantity < 1) {
        showNotification('請選擇有效的規格與數量。', 'error', 'notification-message');
        return;
    }
    
    await CartService.addItem({ variantId: selectedVariantId, quantity });
}

/**
 * [v33.0 新增] 處理「貨到通知」請求
 */
async function handleRequestNotification() {
    if (!variantSelectorEl) return;
    const variantId = variantSelectorEl.value;
    if (!variantId) return;

    try {
        const client = await supabase;
        const { data: { user } } = await client.auth.getUser();

        let email = user && !user.is_anonymous ? user.email : null;
        if (!email) {
            email = prompt("請輸入您的 Email，商品到貨時我們將通知您：");
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!email || !emailRegex.test(email)) {
                showNotification('請輸入有效的 Email 地址。', 'error', 'notification-message');
                return;
            }
        }
        
        requestNotificationBtn.disabled = true;
        requestNotificationBtn.textContent = '登記中...';

        // 注意: 此處呼叫的 Edge Function 將在下一步交付
        const { data, error } = await client.functions.invoke('request-stock-notification', {
            body: { variantId, email }
        });

        if (error) throw new Error(error.message);
        if (!data.success) throw new Error(data.error?.message || '登記失敗');

        showNotification('登記成功！商品到貨後我們將透過 Email 通知您。', 'success', 'notification-message');
        requestNotificationBtn.textContent = '已登記，將通知您';

    } catch (error) {
        console.error("登記貨到通知時發生錯誤:", error);
        showNotification(`登記失敗：${error.message}`, 'error', 'notification-message');
        requestNotificationBtn.disabled = false;
        requestNotificationBtn.textContent = '貨到通知我';
    }
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
    // [v33.0 新增] 為通知按鈕綁定事件
    if (requestNotificationBtn) {
        requestNotificationBtn.addEventListener('click', handleRequestNotification);
    }
}