// ==============================================================================
// 檔案路徑: test-shiporder/_shared/js/utils.js
// 版本: v29.1 - 鏡像 warehouse-panel
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Shared Utility Functions
 * @description 提供所有後台面板共用的通用工具函式。
 */

/**
 * 在一個標準化的 HTML 元素中向使用者顯示訊息。
 * @param {string} text - 要顯示的訊息內容。
 * @param {'error' | 'success' | 'info'} type - 訊息的類型，用於設定樣式。
 * @param {string} elementId - 用來顯示訊息的 HTML 元素的 ID (預設為 'notification-message')。
 */
export function showNotification(text, type = 'error', elementId = 'notification-message') {
    const messageElement = document.getElementById(elementId);
    if (!messageElement) {
        console.warn(`[showNotification] 找不到 ID 為 "${elementId}" 的通知元素。`);
        return;
    }

    // 重設 class 以確保舊的樣式被移除
    messageElement.className = '';
    messageElement.style.display = text ? 'block' : 'none';

    if (text) {
        messageElement.textContent = text;
        messageElement.classList.add(type);
    }
}

/**
 * 設定表單或按鈕的提交狀態，用以防止重複點擊，並提供視覺回饋。
 * @param {HTMLFormElement | HTMLButtonElement} element - 表單或按鈕的 HTML 元素。
 * @param {boolean} isSubmitting - 是否正在提交中。
 * @param {string} submittingText - 提交中的文字 (例如 '處理中...')。
 */
export function setFormSubmitting(element, isSubmitting, submittingText = '處理中...') {
    if (!element) {
        console.warn('[setFormSubmitting] 提供的元素無效。');
        return;
    }

    const button = element.tagName === 'BUTTON' ? element : element.querySelector('button[type="submit"]');
    
    if (button) {
        if (isSubmitting) {
            // 儲存原始文字 (如果尚未儲存)
            if (!button.dataset.defaultText) {
                button.dataset.defaultText = button.textContent;
            }
            button.disabled = true;
            button.textContent = submittingText;
        } else {
            button.disabled = false;
            // 恢復原始文字
            button.textContent = button.dataset.defaultText || '確認';
        }
    }
}

/**
 * 將數字或字串格式化為台灣的貨幣字串 (新台幣)，確保結果為整數。
 * @param {number | string} price - 價格數字或字串。
 * @returns {string} 格式化後的貨幣字串 (例如: NT$ 1,280)。
 */
export function formatPrice(price) {
    const numberValue = parseFloat(price);
    if (isNaN(numberValue)) return 'N/A';
    
    return new Intl.NumberFormat('zh-TW', {
        style: 'currency',
        currency: 'TWD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(Math.round(numberValue)); // 四捨五入確保整數
}