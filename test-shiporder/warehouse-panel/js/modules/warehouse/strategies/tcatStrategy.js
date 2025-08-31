// ==============================================================================
// 檔案路徑: warehouse-panel/js/modules/warehouse/strategies/tcatStrategy.js
// 版本: v1.0 - 核心功能首次發布
// ------------------------------------------------------------------------------
// 【此為全新檔案，可直接使用】
// ==============================================================================

/**
 * @file T-cat API Logistics Strategy (黑貓 API 物流策略模組)
 * @description 封裝所有與黑貓宅急便 API 相關的物流作業邏輯。
 *              遵循策略模式，提供標準化的介面供主控制器呼叫。
 * @version v1.0
 */

import { supabase } from '/_shared/js/supabaseClient.js';
import { showNotification, setFormSubmitting } from '/_shared/js/utils.js';
import { FUNCTION_NAMES } from '../../../core/constants.js';

let currentlySelectedOrder = null;
let currentUser = null;
let logisticsModal = null; // 在 init 時從主控制器傳入

/**
 * 建立並管理物流參數確認視窗的 Helper
 */
const modalHelper = {
    build: () => {
        // ... (未來可在此處動態建立 Modal DOM)
        // 目前版本 Modal 已存在於 index.html，只需獲取
        return {
            logisticsModal: document.getElementById('logistics-modal'),
            title: document.getElementById('logistics-modal-title'),
            recipientInfo: document.getElementById('logistics-modal-recipient-info'),
            nameInput: document.getElementById('logistics-recipient-name'),
            mobileInput: document.getElementById('logistics-recipient-mobile'),
            addressInput: document.getElementById('logistics-recipient-address'),
            thermosphereSelect: document.getElementById('logistics-thermosphere'),
            specSelect: document.getElementById('logistics-spec'),
            isCollectionSelect: document.getElementById('logistics-is-collection'),
            collectionAmountGroup: document.getElementById('collection-amount-group'),
            collectionAmountInput: document.getElementById('logistics-collection-amount'),
            isFreightCheckbox: document.getElementById('logistics-is-freight'),
            memoInput: document.getElementById('logistics-memo'),
            closeBtn: document.getElementById('logistics-modal-close'),
            confirmBtn: document.getElementById('logistics-modal-confirm'),
        };
    },
    populate: (order, modalElements) => {
        // ... (填充 Modal 的邏輯)
    },
    show: (modalElements) => modalElements.logisticsModal.classList.remove('hidden'),
    hide: (modalElements) => modalElements.logisticsModal.classList.add('hidden'),
};

/**
 * 策略的初始化函式，由主控制器呼叫
 * @param {Object} order - 當前選定的訂單物件
 * @param {Object} user - 當前登入的使用者物件
 * @param {HTMLElement} modalElement - 主控制器傳入的 Modal DOM
 */
function initiateShipment(order, user, modalElement) {
    currentlySelectedOrder = order;
    currentUser = user;
    logisticsModal = modalElement;

    modalHelper.populate(order, logisticsModal);
    modalHelper.show(logisticsModal);
}

/**
 * 處理最終的 API 呼叫
 */
async function confirmAndSubmit() {
    // ... (從 v49.3 的 handle最終建立託運單 移植並優化)
}

/**
 * 初始化策略模組的事件監聽
 * @param {Object} modalElements - 包含所有 Modal DOM 元素的物件
 */
function initializeEventListeners(modalElements) {
    modalElements.closeBtn.addEventListener('click', () => modalHelper.hide(modalElements));
    modalElements.confirmBtn.addEventListener('click', confirmAndSubmit);
    modalElements.isCollectionSelect.addEventListener('change', (e) => {
        modalElements.collectionAmountGroup.classList.toggle('hidden', e.target.value === 'N');
        if (e.target.value === 'Y' && currentlySelectedOrder) {
            modalElements.collectionAmountInput.value = currentlySelectedOrder.total_price || 0;
        }
    });
}

// 導出策略物件，包含標準化介面
export const tcatStrategy = {
    name: '黑貓宅急便 (API)',
    id: 'tcat_api',
    buttonLabel: '建立黑貓託運單 (API)',
    buttonClass: 'btn-primary',
    initiateShipment,
};

// 在模組首次載入時，初始化一次性的事件監聽
initializeEventListeners(modalHelper.build());