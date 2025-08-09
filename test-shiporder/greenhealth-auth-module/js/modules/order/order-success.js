// 檔案路徑: js/modules/order/order-success.js (Final Table Display Version)

import { requireLogin } from '../../core/session.js';
import { formatPrice } from '../../core/utils.js';

export async function init() {
    await requireLogin();
    
    const orderNumberEl = document.getElementById('order-number');
    const orderDetailsContainerEl = document.getElementById('order-details-container');
    const shippingDetailsEl = document.getElementById('shipping-details');
    const productListEl = document.getElementById('product-list');
    const methodDetailsEl = document.getElementById('method-details');
    const summarySubtotalEl = document.getElementById('summary-subtotal');
    const summaryCouponRowEl = document.getElementById('summary-coupon-row');
    const summaryCouponEl = document.getElementById('summary-coupon-discount');
    const summaryShippingEl = document.getElementById('summary-shipping-fee');
    const summaryTotalEl = document.getElementById('summary-total-price');
    
    const orderDetailsString = sessionStorage.getItem('latestOrderDetails');
    if (!orderDetailsString) {
        const params = new URLSearchParams(window.location.search);
        const orderNumber = params.get('order_number');
        if (orderNumberEl) orderNumberEl.textContent = orderNumber || '無法獲取訂單資訊。';
        return;
    }
    sessionStorage.removeItem('latestOrderDetails');
    const { order, items, address, shippingMethod, paymentMethod } = JSON.parse(orderDetailsString);

    if (orderNumberEl) orderNumberEl.textContent = order.order_number;

    if (shippingDetailsEl && address) {
        shippingDetailsEl.innerHTML = `
            <div class="detail-item"><strong>姓名:</strong> <span>${address.recipient_name}</span></div>
            <div class="detail-item"><strong>電話:</strong> <span>${address.phone_number}</span></div>
            <div class="detail-item"><strong>地址:</strong> <span>${address.postal_code} ${address.city}${address.district}${address.street_address}</span></div>
        `;
    }

    if (productListEl && Array.isArray(items)) {
        const itemsHtml = items.map(item => {
            const priceAtOrder = parseFloat(item.price_at_order);
            const quantity = parseInt(item.quantity, 10);
            const variantName = item.product_variants?.name || '未知規格';
            if (isNaN(priceAtOrder) || isNaN(quantity)) {
                return `<tr><td colspan="4" style="color: red;">⚠️ ${variantName} 的資料異常</td></tr>`;
            }
            const itemTotal = priceAtOrder * quantity;
            return `
                <tr>
                    <td>${variantName}</td>
                    <td style="text-align: center;">${quantity}</td>
                    <td style="text-align: right;">${formatPrice(priceAtOrder)}</td>
                    <td style="text-align: right; font-weight: 500;">${formatPrice(itemTotal)}</td>
                </tr>
            `;
        }).join('');
        
        productListEl.innerHTML = `
            <table class="product-table" style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="border-bottom: 1px solid #ccc;">
                        <th style="text-align: left; padding: 8px 0; font-weight: normal; color: #666;">品名</th>
                        <th style="text-align: center; padding: 8px 0; font-weight: normal; color: #666;">數量</th>
                        <th style="text-align: right; padding: 8px 0; font-weight: normal; color: #666;">單價</th>
                        <th style="text-align: right; padding: 8px 0; font-weight: normal; color: #666;">小計</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHtml}
                </tbody>
            </table>
        `;
    }

    if (summarySubtotalEl) summarySubtotalEl.textContent = formatPrice(order.subtotal_amount || 0);
    if (summaryCouponEl) summaryCouponEl.textContent = `- ${formatPrice(order.coupon_discount || 0)}`;
    if (summaryCouponRowEl) summaryCouponRowEl.style.display = (order.coupon_discount || 0) > 0 ? 'flex' : 'none';
    if (summaryShippingEl) summaryShippingEl.textContent = formatPrice(order.shipping_fee || 0);
    if (summaryTotalEl) summaryTotalEl.textContent = formatPrice(order.total_amount || 0);

    if (methodDetailsEl) {
        methodDetailsEl.innerHTML = `
            <div class="detail-item"><strong>運送方式:</strong> <span>${shippingMethod?.method_name || '未指定'}</span></div>
            <div class="detail-item"><strong>付款方式:</strong> <span>${order.payment_method || '未指定'}</span></div>
        `;
        if (paymentMethod?.instructions) {
            methodDetailsEl.innerHTML += `<div class="detail-item" style="margin-top:1rem; display: block;"><strong>付款資訊:</strong><br/><span>${paymentMethod.instructions.replace(/\n/g, '<br>')}</span></div>`;
        }
    }
    
    if (orderDetailsContainerEl) {
        orderDetailsContainerEl.style.display = 'block';
    }
}