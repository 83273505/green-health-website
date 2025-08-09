// ==============================================================================
// 档案路径: test-shiporder/_shared/js/utils.js
// 版本: v25.3 - 诊断版
// ------------------------------------------------------------------------------
// 【此为完整档案，可直接覆盖】
// ==============================================================================

// 【诊断日誌 - 探针 3A】
console.log('[utils.js] 档案开始解析...');

/**
 * @file Shared Utility Functions
 * @description 提供所有后台面板共用的通用工具函式。
 */

/**
 * 在一个标准化的 HTML 元素中向使用者显示讯息。
 * @param {string} text - 要显示的讯息内容。
 * @param {'error' | 'success' | 'info'} type - 讯息的类型，用於设定样式。
 * @param {string} elementId - 用来显示讯息的 HTML 元素的 ID (预设为 'notification-message')。
 */
export function showNotification(text, type = 'error', elementId = 'notification-message') {
    const messageElement = document.getElementById(elementId);
    if (!messageElement) {
        console.warn(`[showNotification] 找不到 ID 為 "${elementId}" 的通知元素。`);
        return;
    }

    // 重设 class 以确保旧的样式被移除
    messageElement.className = '';
    messageElement.style.display = text ? 'block' : 'none';

    if (text) {
        messageElement.textContent = text;
        messageElement.classList.add(type);
    }
}

/**
 * 设定表单或按钮的提交状态，用以防止重复点击，并提供视觉回馈。
 * @param {HTMLFormElement | HTMLButtonElement} element - 表单或按钮的 HTML 元素。
 * @param {boolean} isSubmitting - 是否正在提交中。
 * @param {string} submittingText - 提交中的文字 (例如 '处理中...')。
 */
export function setFormSubmitting(element, isSubmitting, submittingText = '处理中...') {
    if (!element) {
        console.warn('[setFormSubmitting] 提供的元素无效。');
        return;
    }

    const button = element.tagName === 'BUTTON' ? element : element.querySelector('button[type="submit"]');
    
    if (button) {
        if (isSubmitting) {
            // 储存原始文字 (如果尚未储存)
            if (!button.dataset.defaultText) {
                button.dataset.defaultText = button.textContent;
            }
            button.disabled = true;
            button.textContent = submittingText;
        } else {
            button.disabled = false;
            // 恢复原始文字
            button.textContent = button.dataset.defaultText || '确认';
        }
    }
}

/**
 * 将数字或字串格式化为台湾的货币字串 (新台币)，确保结果为整数。
 * @param {number | string} price - 价格数字或字串。
 * @returns {string} 格式化后的货币字串 (例如: NT$ 1,280)。
 */
export function formatPrice(price) {
    const numberValue = parseFloat(price);
    if (isNaN(numberValue)) return 'N/A';
    
    return new Intl.NumberFormat('zh-TW', {
        style: 'currency',
        currency: 'TWD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(Math.round(numberValue)); // 四捨五入确保整数
}


// 【诊断日誌 - 探针 3B】
console.log('[utils.js] 档案解析完成。');