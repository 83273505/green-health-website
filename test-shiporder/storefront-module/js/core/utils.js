// ==============================================================================
// 檔案路徑: storefront-module/js/core/utils.js
// 版本: v32.0 - 消費者端模組拆分
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Utility Module (商店前端通用工具模組)
 * @description 集中存放商店前端可重複使用的工具函式。
 */

/**
 * 在一個標準化的 HTML 元素中向使用者顯示訊息。
 */
export function showNotification(text, type = 'error', elementId = 'notification-message') {
    const messageElement = document.getElementById(elementId);
    if (!messageElement) {
        return;
    }
    messageElement.textContent = text;
    messageElement.className = '';
    messageElement.id = elementId;
    messageElement.style.display = text ? 'block' : 'none';
    if (text) {
        messageElement.classList.add(type);
    }
}

/**
 * 設定表單的提交狀態，用以防止重複點擊。
 */
export function setFormSubmitting(formElementOrSelector, isSubmitting, defaultText = '儲存') {
    const form = typeof formElementOrSelector === 'string' 
        ? document.querySelector(formElementOrSelector) 
        : formElementOrSelector;
    if (!form) {
        console.warn('在 setFormSubmitting 中找不到指定的表單元素:', formElementOrSelector);
        return;
    }
    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) {
        submitButton.disabled = isSubmitting;
        submitButton.textContent = isSubmitting ? '處理中...' : defaultText;
    }
}

/**
 * 將數字格式化為台灣的貨幣字串，並確保沒有小數點。
 */
export function formatPrice(price) {
    if (typeof price !== 'number') return 'N/A';
    
    return new Intl.NumberFormat('zh-TW', {
        style: 'currency',
        currency: 'TWD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(price);
}