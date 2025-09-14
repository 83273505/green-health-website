// 檔案路徑: storefront-module/js/modules/product/components/ProductCard.js
import { formatPrice } from '../../../core/utils.js';

export function ProductCard(product) {
    const { name, handle, product_variants, image_url } = product;
    const primaryVariant = product_variants?.find(v => v.is_active) || product_variants?.[0] || { price: 0, sale_price: null };
    const displayPrice = (primaryVariant.sale_price && primaryVariant.sale_price > 0) 
        ? primaryVariant.sale_price 
        : primaryVariant.price;
    const formattedPrice = formatPrice(displayPrice);
    const finalImageUrl = image_url || 'https://placehold.co/400x400/eeeeee/cccccc?text=無圖片';
    const productUrl = `/storefront-module/product-detail.html?handle=${handle}`;

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