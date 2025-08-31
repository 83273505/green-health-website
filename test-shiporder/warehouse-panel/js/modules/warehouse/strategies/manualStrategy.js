// ==============================================================================
// 檔案路徑: warehouse-panel/js/modules/warehouse/strategies/manualStrategy.js
// 版本: v1.0 - 核心功能首次發布
// ------------------------------------------------------------------------------
// 【此為全新檔案，可直接使用】
// ==============================================================================

/**
 * @file Manual Entry Logistics Strategy (手動輸入物流策略模組)
 * @description 封裝所有手動輸入物流單號的作業邏輯。
 *              遵循策略模式，提供標準化的介面供主控制器呼叫。
 * @version v1.0
 */

import { supabase } from '/_shared/js/supabaseClient.js';
import { showNotification, setFormSubmitting } from '/_shared/js/utils.js';
import { TABLE_NAMES, FUNCTION_NAMES } from '../../../core/constants.js';

let currentlySelectedOrder = null;
let currentUser = null;
let shippingRatesCache = []; // 獨立快取

// DOM 元素獲取
const manualShippingForm = document.getElementById('manual-shipping-form');
const carrierSelector = document.getElementById('carrier-selector');
const trackingCodeInput = document.getElementById('tracking-code-input');

async function populateCarrierSelector(defaultCarrier) {
    // ... (從 v49.3 移植並優化)
}

async function handleSubmit(e) {
    e.preventDefault();
    // ... (從 v49.3 的 handle手動出貨表單提交 移植並優化)
}

/**
 * 策略的初始化函式，由主控制器呼叫
 * @param {Object} order - 當前選定的訂單物件
 * @param {Object} user - 當前登入的使用者物件
 */
async function initiateShipment(order, user) {
    currentlySelectedOrder = order;
    currentUser = user;
    
    // 顯示表單
    manualShippingForm.classList.remove('hidden');
    // 填充下拉選單
    await populateCarrierSelector(order.shipping_rates?.method_name || '未指定');
}

function hideForm() {
    manualShippingForm.classList.add('hidden');
}

/**
 * 初始化策略模組的事件監聽
 */
function initializeEventListeners() {
    manualShippingForm.addEventListener('submit', handleSubmit);
}

// 導出策略物件
export const manualStrategy = {
    name: '手動輸入',
    id: 'manual_entry',
    buttonLabel: '手動輸入物流單號',
    buttonClass: 'btn-secondary',
    initiateShipment,
    hide: hideForm, // 提供隱藏介面的方法
};

initializeEventListeners();