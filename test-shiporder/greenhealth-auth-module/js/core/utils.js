// 檔案路徑: js/core/utils.js

/**
 * @file Utility Module (通用工具模組)
 * @description 集中存放整個應用程式可重複使用的工具函式。
 */

/**
 * 在一個標準化的 HTML 元素中向使用者顯示訊息。
 * @param {string} text - 要顯示的訊息內容。
 * @param {'error' | 'success' | 'info'} type - 訊息的類型，用於設定樣式。
 * @param {string} elementId - 用來顯示訊息的 HTML 元素的 ID。
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
 * @param {HTMLFormElement | string} formElementOrSelector - 表單的 HTML 元素或其 CSS 選擇器。
 * @param {boolean} isSubmitting - 表單是否正在提交中。
 * @param {string} defaultText - 按鈕在非提交狀態下的預設文字。
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
 * @param {number} price - 價格數字
 * @returns {string} 格式化後的貨幣字串 (例如: NT$1,280)
 */
export function formatPrice(price) {
    if (typeof price !== 'number') return 'N/A';
    
    // ✅ 【關鍵修正】
    // minimumFractionDigits: 0 告訴格式化工具最少顯示 0 位小數。
    // maximumFractionDigits: 0 告訴格式化工具最多顯示 0 位小數。
    // 這兩個選項組合起來，就能確保結果永遠是整數形式的台幣金額。
    return new Intl.NumberFormat('zh-TW', {
        style: 'currency',
        currency: 'TWD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(price);
}