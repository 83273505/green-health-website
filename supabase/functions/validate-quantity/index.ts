// 檔案路徑: supabase/functions/validate-quantity/index.ts
/**
 * 檔案名稱：index.ts
 * 檔案職責：提供一個輕量級的、即時的庫存數量預檢服務。
 * 版本：1.0
 * SOP 條款對應：
 * - [專案憲章 ECOMMERCE-V1, 1.1] 交易數據絕對準確性原則
 * AI 註記：
 * - 此為「無聲守護者 v2.0」方案的核心後端實現。
 * - 它接收 variantId 和 requestedQuantity，並直接呼叫 DB Function
 *   `get_public_stock_status` 來獲取權威的庫存數據，然後回傳一個簡單的布林值結果。
 * - [操作指示]: 請建立 `supabase/functions/validate-quantity` 資料夾，並將此程式碼儲存為 `index.ts`。
 */

import { createClient } from '../_shared/deps.ts';
import { corsHeaders } from '../_shared/cors.ts';
import LoggingService, { withErrorLogging } from '../_shared/services/loggingService.ts';

const FUNCTION_NAME = 'validate-quantity';
const FUNCTION_VERSION = 'v1.0';
const UUID_REGEXP = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function mainHandler(
  req: Request,
  logger: LoggingService,
  correlationId: string
): Promise<Response> {
  const { variantId, requestedQuantity } = await req.json().catch(() => ({}));

  // 1. 輸入驗證
  if (!variantId || typeof variantId !== 'string' || !UUID_REGEXP.test(variantId) ||
      !Number.isInteger(requestedQuantity) || requestedQuantity <= 0) {
    return new Response(JSON.stringify({ success: false, error: { message: '無效的輸入參數。' } }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // 2. 建立 Admin Client 並呼叫 DB Function
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data, error } = await supabaseAdmin.rpc('get_public_stock_status', {
    variant_ids: [variantId],
  }).single();

  if (error) {
    logger.error('呼叫 DB 函式 get_public_stock_status 時發生錯誤', correlationId, error, { variantId });
    throw error;
  }

  if (!data) {
      return new Response(JSON.stringify({ success: false, error: { message: '找不到該商品。' } }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
  }

  // 3. 核心業務邏輯
  const isValid = requestedQuantity <= data.available_stock;

  // 4. 回傳結果
  if (isValid) {
    return new Response(JSON.stringify({ success: true, valid: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } else {
    return new Response(JSON.stringify({
      success: true, // API 呼叫本身是成功的
      valid: false,
      message: `庫存不足，此商品最多只能購買 ${data.available_stock} 件。`,
      available_stock: data.available_stock,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  const logger = new LoggingService(FUNCTION_NAME, FUNCTION_VERSION);
  const wrappedHandler = withErrorLogging(mainHandler, logger);
  return await wrappedHandler(req);
});```

---
**【執行進度：2/2 (前端最終實現)】**

接下來，是本次專案的最後一個檔案：`product-detail.js` 的最終版本。

##### storefront-module/js/modules/product/product-detail.js
```javascript
// 檔案路徑: storefront-module/js/modules/product/product-detail.js
/**
 * 檔案名稱：product-detail.js
 * 檔案職責：實現「無聲守護者 v2.0」，將數量驗證的權力完全交還給後端。
 * 版本：35.0 (後端權威驗證最終版)
 * SOP 條款對應：
 * - [專案憲章 ECOMMERCE-V1, 1.1] 交易數據絕對準確性原則
 * AI 註記：
 * - [核心重構]: 此版本為最終交付版，實現了最安全的「無聲守護者 v2.0」模式。
 *   - `handleQuantityChange` 函數不再進行任何前端的庫存比較。
 *   - 新增 `debouncedValidateQuantity` 函數。當使用者停止輸入 300ms 後，
 *     此函數會自動觸發，向新的 `validate-quantity` 後端端點發送預檢請求。
 *   - 只有當後端返回驗證失敗時，前端才會顯示錯誤提示並自動校正數量。
 * - [操作指示]: 請完整覆蓋原檔案。
 * 更新日誌 (Changelog)：
 * - v35.0 (2025-09-10)：[SECURITY REFACTOR] 移除所有前端庫存判斷，改用後端即時預檢。
 */

import { supabase } from '../../core/supabaseClient.js';
import { TABLE_NAMES } from '../../core/constants.js';
import { CartService } from '../../services/CartService.js';
import { formatPrice, showNotification } from '../../core/utils.js';

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
const quantityWarningEl = document.getElementById('quantity-warning');

let currentProduct = null;
let debounceTimer;

async function fetchProductByHandle(handle) {
    try {
        const client = await supabase;
        const { data, error } = await client.from(TABLE_NAMES.PRODUCTS).select(`*, product_variants(*)`).eq('handle', handle).single();
        if (error) { console.error('讀取商品詳細資料時發生錯誤:', error); return null; }
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
    if (variantSelectorEl) { variantSelectorEl.addEventListener('change', updateVariantDisplay); }
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

    try {
        const client = await supabase;
        const { data, error } = await client.functions.invoke('get-product-stock-status', { body: { variantIds: [variantId] } });
        if (error) throw new Error(`API 呼叫失敗: ${error.message}`);
        if (!data.success || !data.data || data.data.length === 0) { throw new Error(data.error?.message || '從 API 獲取庫存狀態失敗'); }

        const stockInfo = data.data[0];
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
                statusHtml = '庫存緊張';
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
            default: statusHtml = '狀態未知'; break;
        }
        stockStatusContainerEl.innerHTML = `<span class="${statusClass}">${statusHtml}</span>`;
    } catch (error) {
        console.error("更新庫存狀態時發生錯誤:", error);
        stockStatusContainerEl.innerHTML = `<span class="status-out-of-stock">無法獲取庫存</span>`;
    }
}

function debouncedValidateQuantity() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
        if (!quantityInput || !variantSelectorEl || quantityWarningEl === null) return;
        
        // 先清除舊的警告，提供即時反饋
        quantityWarningEl.classList.add('hidden');

        const variantId = variantSelectorEl.value;
        const requestedQuantity = parseInt(quantityInput.value, 10);
        
        if (isNaN(requestedQuantity) || requestedQuantity < 1) {
            quantityInput.value = 1;
            return;
        }

        try {
            const client = await supabase;
            const { data, error } = await client.functions.invoke('validate-quantity', {
                body: { variantId, requestedQuantity }
            });

            if (error) throw error;
            if (!data.success) throw new Error(data.error?.message || '驗證失敗');

            if (data.valid) {
                // 驗證通過，確保警告是隱藏的
                quantityWarningEl.classList.add('hidden');
            } else {
                // 驗證失敗，自動校正並顯示後端提供的權威訊息
                quantityInput.value = data.available_stock;
                quantityWarningEl.textContent = data.message;
                quantityWarningEl.classList.remove('hidden');
            }
        } catch (err) {
            console.error('數量預檢請求失敗:', err);
            quantityWarningEl.textContent = '無法驗證庫存，請稍後再試。';
            quantityWarningEl.classList.remove('hidden');
        }

    }, 300);
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

    if (addToCartForm) { addToCartForm.addEventListener('submit', handleAddToCart); }
    if (requestNotificationBtn) { requestNotificationBtn.addEventListener('click', handleRequestNotification); }
    if (quantityInput) { quantityInput.addEventListener('input', debouncedValidateQuantity); }
}