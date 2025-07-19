// 檔案路徑: GreenHealth-Auth-Module/js/utils.js

/**
 * @file Utility Module
 * @description A collection of reusable utility functions for the application,
 * such as displaying notifications, formatting data, and validating forms.
 */

/**
 * Displays a message to the user in a standardized element.
 * This function can be expanded to create more complex notifications or toasts.
 * 
 * @param {string} text - The message to display.
 * @param {'error' | 'success' | 'info'} type - The type of message for styling. Defaults to 'error'.
 * @param {string} elementId - The ID of the HTML element to display the message in. Defaults to 'auth-message'.
 */
export function showNotification(text, type = 'error', elementId = 'auth-message') {
    const messageElement = document.getElementById(elementId);
    if (!messageElement) {
        console.warn(`Notification element with ID "${elementId}" not found.`);
        return;
    }

    messageElement.textContent = text;
    
    // Reset classes
    messageElement.classList.remove('success', 'error', 'info');

    switch (type) {
        case 'success':
            messageElement.style.color = '#4CAF50';
            messageElement.classList.add('success');
            break;
        case 'info':
            messageElement.style.color = '#2196F3';
            messageElement.classList.add('info');
            break;
        case 'error':
        default:
            messageElement.style.color = '#d9534f';
            messageElement.classList.add('error');
            break;
    }
}

/**
 * Disables a form's submit button to prevent multiple submissions.
 * @param {HTMLFormElement} formElement - The form element.
 * @param {boolean} disabled - Whether to disable or enable the button.
 */
export function setFormSubmitting(formElement, disabled) {
    if (!formElement) return;
    const submitButton = formElement.querySelector('button[type="submit"]');
    if (submitButton) {
        submitButton.disabled = disabled;
        submitButton.textContent = disabled ? '處理中...' : '提交'; // Example text change
    }
}

// You can add more utility functions here in the future, for example:
/*
export function formatDate(dateString) {
    // ... date formatting logic ...
}

export function isValidEmail(email) {
    // ... email validation regex ...
}
*/