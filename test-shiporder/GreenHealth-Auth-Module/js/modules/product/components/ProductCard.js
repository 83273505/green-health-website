// 档案路径: js/modules/product/components/ProductCard.js

/**
 * @file ProductCard Component (商品卡片元件)
 * @description 這是一個用於生成單個商品卡片 HTML 的無狀態元件 (Stateless Component)。
 *              它只負責根據傳入的資料來渲染 UI，不包含任何複雜的內部狀態。
 * 
 * 【架构说明】
 *   - 此元件位于其所属业务模组 (product) 内部，专门为商品列表服务。
 *   - 它的引用路径是相对于 product.js 的 './components/ProductCard.js'。
 */
export function ProductCard(product) {
    // 【未修改部分】函式的核心逻辑维持不变
    const { name, handle, product_variants } = product;

    const primaryVariant = product_variants && product_variants.length > 0 
        ? product_variants[0] 
        : { price: 'N/A', image_url: '', sale_price: null };

    const displayPrice = primaryVariant.sale_price || primaryVariant.price;

    const formattedPrice = new Intl.NumberFormat('zh-TW', {
        style: 'currency',
        currency: 'TWD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(displayPrice);

    const imageUrl = primaryVariant.image_url || 'https://placehold.co/400x400/eeeeee/cccccc?text=無圖片';

    // ROUTES.PRODUCT_DETAIL 在此不适用，因为 handle 是动态的
    const productUrl = `./product-detail.html?handle=${handle}`;

    return `
        <div class="product-card">
            <a href="${productUrl}">
                <div class="product-image" style="background-image: url('${imageUrl}');"></div>
                <div class="product-info">
                    <h3 class="product-name">${name}</h3>
                    <p class="product-price">${formattedPrice}</p>
                </div>
            </a>
        </div>
    `;
}