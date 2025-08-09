// ==============================================================================
// 檔案路徑: test-shiporder/_shared/js/utils.js
// ------------------------------------------------------------------------------
// 【此為新檔案，可直接覆蓋】
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
        messa