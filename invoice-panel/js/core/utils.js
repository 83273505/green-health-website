// ==============================================================================
// 檔案路徑: invoice-panel/js/core/utils.js
// ------------------------------------------------------------------------------
// 【發票管理後台 - 通用工具模組】
// ==============================================================================

/**
 * 在一個標準化的 HTML 元素中向使用者顯示訊息。
 * @param {string} text - 要顯示的訊息內容。
 * @param {'error' | 'success' | 'info'} type - 訊息的類型，用於設定樣式。
 * @param {string} elementId - 用來顯示訊息的 HTML 元素的 ID。
 */
export function showNotification(text, type = 'error', elementId = 'notification-message') {
    const messageElement = document.getElementById(elementId);
    if (!messageElement) {
        console.warn(`找不到 ID 為 "${elementId}" 的通知元素。`);
        return;
    }
    messageElement.textContent = text;
    // 重置 class 以確保舊的樣式被移除
    messageElement.className = '';
    messageElement.id = elementId; // 確保 ID 不變
    messageElement.style.display = text ? 'block' : 'none';
    if (text) {
        messageElement.classList.add(type);
    }
}

/**
 * 設定表單或按鈕的提交狀態，用以防止重複點擊，並提供視覺回饋。
 * @param {HTMLElement | string} elementOrSelector - 表單或按鈕的 HTML 元素或其 CSS 選擇器。
 * @param {boolean} isSubmitting - 是否正在提交中。
 * @param {string} submittingText - 提交中的文字。
 * @param {string} defaultText - 非提交狀態下的預設文字。
 */
export function setSubmittingState(elementOrSelector, isSubmitting, submittingText = '處理中...', defaultText = '確認') {
    const element = typeof elementOrSelector === 'string' 
        ? document.querySelector(elementOrSelector) 
        : elementOrSelector;
        
    if (!element) {
        console.warn('在 setSubmittingState 中找不到指定的元素:', elementOrSelector);
        return;
    }

    const button = element.tagName === 'BUTTON' ? element : element.querySelector('button[type="submit"]');
    
    if (button) {
        button.disabled = isSubmitting;
        // 如果提供了預設文字，則儲存它以便恢復
        if (defaultText && !button.dataset.defaultText) {
            button.dataset.defaultText = button.textContent;
        }
        button.textContent = isSubmitting ? submittingText : (defaultText || button.dataset.defaultText || '確認');
    }
}


/**
 * 將數字或字串格式化為台灣的貨幣字串 (新台幣)，確保結果為整數。
 * @param {number | string} price - 價格數字或字串
 * @returns {string} 格式化後的貨幣字串 (例如: NT$ 1,280)
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