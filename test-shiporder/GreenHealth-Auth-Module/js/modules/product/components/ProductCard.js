// 檔案路徑: js/modules/product/components/ProductCard.js

// 為了讓價格格式化正常運作，我們需要從核心 utils 模組中引入 formatPrice 函式
import { formatPrice } from '../../../core/utils.js';

/**
 * @file ProductCard Component (商品卡片元件)
 * @description 一個無狀態元件，根據傳入的商品物件產生商品卡片的 HTML。
 */
export function ProductCard(product) {
    // 從傳入的 product 物件中解構出所有需要的欄位
    // ✅ 【關鍵修正】直接從 product 主物件中解構出 image_url
    const { name, handle, product_variants, image_url } = product;

    // 找到一個有效的規格來顯示其價格
    // 優先找尋已啟用的規格，如果都未啟用，則使用第一個
    const primaryVariant = product_variants?.find(v => v.is_active) || product_variants?.[0] || { price: 0, sale_price: null };

    // 判斷要顯示的價格（優先使用特價）
    const displayPrice = (primaryVariant.sale_price && primaryVariant.sale_price > 0) 
        ? primaryVariant.sale_price 
        : primaryVariant.price;

    // 格式化價格為台幣字串
    const formattedPrice = formatPrice(displayPrice);

    // ✅ 【關鍵修正】直接使用從 `products` 表中獲取的 `image_url`
    // 如果 `image_url` 不存在，則顯示一個預設的佔位圖
    const finalImageUrl = image_url || 'https://placehold.co/400x400/eeeeee/cccccc?text=無圖片';

    // 產生指向商品詳情頁的動態 URL
    const productUrl = `./product-detail.html?handle=${handle}`;

    // 回傳最終的 HTML 結構字串
    return `
        <div class="product-card">
            <a href="${productUrl}">
                <div class="product-image" style="background-image: url('${finalImageUrl}');"></div>
                <div class="product-info">
                    <h3 class="product-name">${name}</h3>
                    <p class="product-price">${formattedPrice}</p>
                </div>
            </a>
        </div>
    `;
}