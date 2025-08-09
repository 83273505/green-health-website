// 檔案路徑: warehouse-panel/js/core/utils.js

/**
 * @file Utility Module (通用工具模組)
 * @description 集中存放整個應用程式可重複使用的工具函式。
 */

export function showNotification(text, type = 'error', elementId = 'notification-message') {
    const messageElement = document.getElementById(elementId);
    if (!messageElement) return;
    messageElement.textContent = text;
    messageElement.className = '';
    messageElement.id = elementId;
    messageElement.style.display = text ? 'block' : 'none';
    if (text) {
        messageElement.classList.add(type);
    }
}

export function setFormSubmitting(formElementOrSelector, isSubmitting, defaultText = '提交') {
    const form = typeof formElementOrSelector === 'string' 
        ? document.querySelector(formElementOrSelector) 
        : formElementOrSelector;
    if (!form) return;
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