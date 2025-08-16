// ==============================================================================
// 檔案路徑: storefront-module/js/modules/order/order-success.js
// 版本: v32.4 - 後端驅動體驗
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Order Success Module (订单成功页模组)
 * @description 处理订单成功页面的资料渲染，并提供「无感注册」功能。
 */

// 【核心修正】引入 getCurrentUser 和 supabase，不再强制登入
import { getCurrentUser } from '../../core/session.js';
import { supabase } from '../../core/supabaseClient.js';
import { formatPrice, showNotification } from '../../core/utils.js';

export async function init() {
    // --- DOM 元素獲取 ---
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
        if (orderNumberEl) {
            orderNumberEl.textContent = orderNumber || '無法獲取訂單資訊。';
        }
        console.warn('在 sessionStorage 中找不到 latestOrderDetails，仅显示订单号。');
        return;
    }
    
    // 清除快照，避免重新整理时重复显示
    sessionStorage.removeItem('latestOrderDetails');
    
    const { order, items, address, shippingMethod, paymentMethod } = JSON.parse(orderDetailsString);

    if (orderNumberEl) orderNumberEl.textContent = order.order_number;

    if (shippingDetailsEl && address) {
        shippingDetailsEl.innerHTML = `
            <div class="detail-item"><strong>姓名:</strong> <span>${address.recipient_name}</span></div>
            <div class="detail-item"><strong>電話:</strong> <span>${address.phone_number}</span></div>
            <div class="detail-item"><strong>地址:</strong> <span>${address.postal_code || ''} ${address.city || ''}${address.district || ''}${address.street_address || ''}</span></div>
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

    // 【核心新增】處理無感註冊的邏輯
    const seamlessSignupSection = document.getElementById('seamless-signup-section');
    const user = await getCurrentUser();
    if (user && user.is_anonymous && seamlessSignupSection) {
        seamlessSignupSection.classList.remove('hidden');
        const signupForm = document.getElementById('seamless-signup-form');
        const passwordInput = document.getElementById('signup-password');
        const notificationEl = document.getElementById('signup-notification');

        signupForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const newPassword = passwordInput.value;
            if (newPassword.length < 6) {
                showNotification('密碼長度至少需要6位數。', 'error', notificationEl.id);
                return;
            }

            try {
                const client = await supabase;
                const { data, error } = await client.functions.invoke('convert-anonymous-user', {
                    body: { newPassword }
                });

                if (error) throw error;
                if (data.error) throw new Error(data.error);

                showNotification('註冊成功！您現在已是我們的正式會員。', 'success', notificationEl.id);
                signupForm.style.display = 'none'; // 隱藏表單
            } catch (error) {
                console.error('無感註冊時發生錯誤:', error);
                showNotification(`註冊失敗: ${error.message}`, 'error', notificationEl.id);
            }
        });
    }
}