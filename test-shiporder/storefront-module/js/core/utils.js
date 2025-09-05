// 檔案路徑: storefront-module/js/core/utils.js
/**
 * 檔案名稱：utils.js
 * 檔案職責：集中存放商店前端可重複使用的工具函式。
 * 版本：32.1
 * SOP 條款對應：
 * - [2.1.4.1] 內容規範與來源鐵律 (🔴L1)
 * - [2.1.4.3] 絕對路徑錨定原則 (🔴L1)
 * - [5.3] 共享前端工具
 * 依賴清單 (Dependencies)：
 * - (無)
 * AI 註記：
 * - 此檔案已根據 SOP v7.1 進行標頭合規性更新。
 * 更新日誌 (Changelog)：
 * - v32.1 (2025-09-06)：[SOP v7.1 合規] 新增標準化檔案標頭與絕對路徑錨定。
 * - v32.0 (2025-08-20)：消費者端模組拆分後初版建立。
 */

export function showNotification(text, type = 'error', elementId = 'notification-message', duration = 5000) {
    const messageElement = document.getElementById(elementId);
    if (!messageElement) {
        console.warn(`找不到 ID 為 "${elementId}" 的通知元素。`);
        alert(text); // Fallback to a simple alert
        return;
    }
    messageElement.textContent = text;
    messageElement.className = 'notification-message'; // Reset classes
    messageElement.classList.add(type);
    messageElement.style.display = 'block';
    
    setTimeout(() => {
        if (messageElement.textContent === text) { // Only hide if the message hasn't changed
            messageElement.style.display = 'none';
        }
    }, duration);
}

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

export function formatPrice(price) {
    if (typeof price !== 'number') return 'N/A';
    
    return new Intl.NumberFormat('zh-TW', {
        style: 'currency',
        currency: 'TWD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(price);
}