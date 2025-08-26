// ==============================================================================
// 檔案路徑: storefront-module/js/modules/order/order-success.js
// 版本: v44.1 - 智慧型註冊引導
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Order Success Module (訂單成功頁模組)
 * @description 處理訂單成功頁面的資料渲染，並根據使用者身份提供智慧型註冊引導。
 * @version v44.1
 * 
 * @update v44.1 - [INTELLIGENT SIGNUP INVITATION]
 * 1. [核心流程修正] 移除了舊的「無感註冊」密碼輸入表單，改為引導式註冊按鈕。
 * 2. [智慧判斷] 新增了對使用者身份的判斷 (`user.is_anonymous`)，只有當顧客是
 *          匿名訪客時，才會顯示註冊邀請區塊，避免對已登入會員造成干擾。
 * 3. [體驗優化] 註冊按鈕的連結會動態帶上顧客的 Email 作為 URL 參數，以便在
 *          註冊頁面進行預填，簡化流程。
 * 4. [正體化] 對檔案內所有註解及字串進行了標準正體中文校訂。
 */

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
    const params = new URLSearchParams(window.location.search);
    const orderNumberFromURL = params.get('order_number');
    
    if (!orderDetailsString) {
        if (orderNumberEl) {
            orderNumberEl.textContent = orderNumberFromURL || '無法獲取訂單資訊。';
        }
        console.warn('在 sessionStorage 中找不到 latestOrderDetails，僅顯示來自 URL 的訂單號。');
        // 即使沒有 session storage，也需要檢查是否要顯示註冊區塊
        handleSignupInvitation(null); 
        return;
    }
    
    // 清除快照，避免重新整理時重複顯示
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
            <div class="detail-item"><strong>付款方式:</strong> <span>${paymentMethod?.method_name || order.payment_method || '未指定'}</span></div>
        `;
        if (paymentMethod?.instructions) {
            methodDetailsEl.innerHTML += `<div class="detail-item" style="margin-top:1rem; display: block;"><strong>付款資訊:</strong><br/><span>${paymentMethod.instructions.replace(/\n/g, '<br>')}</span></div>`;
        }
    }
    
    if (orderDetailsContainerEl) {
        orderDetailsContainerEl.style.display = 'block';
    }

    // 呼叫獨立的函式來處理註冊邀請的顯示邏輯
    handleSignupInvitation(order);
}

/**
 * [v44.1 核心修正] 處理對匿名訪客的註冊邀請
 * @param {object | null} order - 從 sessionStorage 解析出的訂單物件
 */
async function handleSignupInvitation(order) {
    const signupSection = document.getElementById('seamless-signup-section');
    if (!signupSection) return;

    try {
        const client = await supabase;
        const { data: { user } } = await client.auth.getUser();

        // 只有當使用者是匿名訪客時，才顯示註冊邀請
        if (user && user.is_anonymous) {
            const signupButton = document.getElementById('signup-cta-button');
            const customerEmail = order?.customer_email || new URLSearchParams(window.location.search).get('email');
            
            if (signupButton && customerEmail) {
                // 將註冊按鈕的連結動態指向會員中心的登入/註冊頁，並預填 Email
                signupButton.href = `/account-module/index.html?email=${encodeURIComponent(customerEmail)}`;
                signupSection.classList.remove('hidden');
            }
        }
    } catch (error) {
        console.warn("檢查使用者身份以顯示註冊邀請時發生錯誤:", error);
    }
}