// 檔案路徑: storefront-module/js/modules/product/product-detail.js
/**
 * 檔案名稱：product-detail.js
 * 檔案職責：處理商品詳情頁的資料獲取、渲染、並實現「無聲守護者」即時庫存互動驗證。
 * 版本：34.0 (即時互動驗證最終版)
 * SOP 條款對應：
 * - [法案 KB-UPGRADE-20250909-03]
 * AI 註記：
 * - [核心昇華]: 此版本為最終交付版，實現了「無聲守護者」互動模式。
 *   - `displayStockStatus` 函式現在會從後端獲取 `available_stock` 並儲存在一個
 *     內部變數 `_currentAvailableStock` 中，但不會直接顯示它。
 *   - 新增 `handleQuantityChange` 函式，並將其綁定到數量輸入框的 `input` 事件。
 *   - 此函式會即時比對使用者輸入值與 `_currentAvailableStock`，如果超出，會自動
 *     將數值校正回最大庫存，並顯示一個非侵入式的提示訊息。
 * - [操作指示]: 請完整覆蓋原檔案。
 * 更新日誌 (Changelog)：
 * - v34.0 (2025-09-09)：[FEATURE] 新增「無聲守護者」即時互動驗證邏輯。
 * - v33.0 (2025-09-09)：整合即時庫存狀態顯示與貨到通知功能。
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
const stockStatusContainerEl = document.getElementById('stock-status-container');
const addToCartBtn = document.getElementById('add-to-cart-btn');
const requestNotificationBtn = document.getElementById('request-notification-btn');
// [v34.0 新增] 數量驗證提示訊息的容器
const quantityWarningEl = document.getElementById('quantity-warning');


let currentProduct = null;
// [v34.0 新增] 用於儲存當前選中規格的可用庫存
let _currentAvailableStock = 0;

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
        currentProduct = data;
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
            displayStockStatus(selectedVariantId);
        }
    }
    
    if (variantSelectorEl) {
        variantSelectorEl.addEventListener('change', updateVariantDisplay);
    }
    updateVariantDisplay();

    if (loadingView) loadingView.classList.add('hidden');
    if (detailContainer) detailContainer.classList.remove('hidden');
}

async function displayStockStatus(variantId) {
    if (!stockStatusContainerEl || !addToCartBtn || !requestNotificationBtn) return;

    stockStatusContainerEl.innerHTML = `<div class="skeleton-loader"></div>`;
    addToCartBtn.disabled = true;
    addToCartBtn.classList.remove('hidden');
    requestNotificationBtn.classList.add('hidden');
    if (quantityInput) quantityInput.disabled = true;
    _currentAvailableStock = 0; // 重置庫存

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
        _currentAvailableStock = stockInfo.available_stock || 0;
        
        let statusHtml = '';
        let statusClass = '';

        switch (stockInfo.stock_status) {
            case 'IN_STOCK':
                statusClass = 'status-in-stock';
                statusHtml = '庫存充足';
                addToCartBtn.disabled = false;
                if (quantityInput) quantityInput.disabled = false;
                break;
            case 'LOW_STOCK':
                statusClass = 'status-low-stock';
                statusHtml = '庫存緊張'; // 依然不顯示數字，保持商業機密
                addToCartBtn.disabled = false;
                if (quantityInput) quantityInput.disabled = false;
                break;
            case 'OUT_OF_STOCK':
                statusClass = 'status-out-of-stock';
                statusHtml = '已售完';
                addToCartBtn.classList.add('hidden');
                requestNotificationBtn.classList.remove('hidden');
                if (quantityInput) quantityInput.disabled = true;
                break;
            default:
                statusHtml = '狀態未知';
                break;
        }

        stockStatusContainerEl.innerHTML = `<span class="${statusClass}">${statusHtml}</span>`;
        // [v34.0] 觸發一次數量檢查，以防預設數量就超過庫存
        handleQuantityChange(); 

    } catch (error) {
        console.error("更新庫存狀態時發生錯誤:", error);
        stockStatusContainerEl.innerHTML = `<span class="status-out-of-stock">無法獲取庫存</span>`;
    }
}

/**
 * [v34.0 新增] 處理數量輸入的即時驗證
 */
function handleQuantityChange() {
    if (!quantityInput || quantityWarningEl === null) return;

    let currentQuantity = parseInt(quantityInput.value, 10);
    
    if (isNaN(currentQuantity) || currentQuantity < 1) {
        quantityInput.value = 1;
        currentQuantity = 1;
    }
    
    // 核心驗證邏輯
    if (_currentAvailableStock > 0 && currentQuantity > _currentAvailableStock) {
        quantityInput.value = _currentAvailableStock; // 自動校正
        quantityWarningEl.textContent = `此商品最多只能購買 ${_currentAvailableStock} 件。`;
        quantityWarningEl.classList.remove('hidden');
    } else {
        quantityWarningEl.classList.add('hidden');
    }
}

async function handleAddToCart(event) {
    event.preventDefault();
    handleQuantityChange(); // 提交前最後再驗證一次

    if (!variantSelectorEl || !quantityInput) return;
    const selectedVariantId = variantSelectorEl.value;
    const quantity = parseInt(quantityInput.value, 10);

    if (!selectedVariantId || isNaN(quantity) || quantity < 1) {
        showNotification('請選擇有效的規格與數量。', 'error', 'notification-message');
        return;
    }
    
    await CartService.addItem({ variantId: selectedVariantId, quantity });
}

async function handleRequestNotification() {
    // ... 此函式邏輯與 v33.0 保持不變 ...
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

        const { data, error } = await client.functions.invoke('request-stock-notification', {
            body: { variantId, email }
        });

        if (error) throw new Error(error.message);
        if (!data.success) throw new Error(data.error?.message || '登記失敗');

        showNotification(data.message, 'success', 'notification-message');
        requestNotificationBtn.textContent = data.message.includes("已登記過") ? '您已登記' : '已登記，將通知您';

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
    if (requestNotificationBtn) {
        requestNotificationBtn.addEventListener('click', handleRequestNotification);
    }
    // [v34.0 新增] 為數量輸入框綁定事件
    if (quantityInput) {
        quantityInput.addEventListener('input', handleQuantityChange);
    }
}