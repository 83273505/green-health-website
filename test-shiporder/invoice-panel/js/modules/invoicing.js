// ==============================================================================
// 檔案路徑: invoice-panel/js/modules/invoicing.js
// 版本: v47.1 - 功能閉環 (勝利收官版)
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Invoicing Module (發票管理模組)
 * @description 處理發票管理後台的完整業務邏輯，實現「待辦發票工作台」及
 *              具備審核、修正、品項校對、開立與作廢功能於一體的作業中心。
 * @version v47.1
 * 
 * @update v47.1 - [FEATURE COMPLETE & FINALIZATION]
 * 1. [功能閉環] `handleSaveChanges` 函式已完整實作。現在它能夠正確地從
 *          彈窗表單中收集修改後的資料，並呼叫新建的 `update-invoice-details`
 *          後端函式，將變更安全地儲存至資料庫。
 * 2. [體驗優化] 儲存成功後，會更新本地快取 (`invoicesCache`) 並重新渲染
 *          彈窗內的「原始資訊」區塊，讓操作員能立刻看到變更後的結果。
 * 3. [流程整合] 至此，後台改善藍圖中的所有核心功能均已完成並整合，
 *          實現了完整的「審核-修正-儲存-開立」作業流程。
 */

import { supabase } from '/_shared/js/supabaseClient.js';
import { formatPrice, showNotification, setFormSubmitting } from '/_shared/js/utils.js';
import { requireInvoiceLogin, handleInvoiceLogout } from '/invoice-panel/js/core/invoiceAuth.js';
import { FUNCTION_NAMES } from '/invoice-panel/js/core/constants.js';

// --- 狀態管理 ---
let currentUser = null;
let invoicesCache = new Map();
let currentTab = 'pending';

// --- v47.0 DOM 元素全面更新 ---
const mainContent = document.getElementById('main-content');
const authCheckView = document.getElementById('auth-check-view');
const currentUserEmailEl = document.getElementById('current-user-email');
const logoutBtn = document.getElementById('logout-btn');
const tabs = document.querySelectorAll('.tab-link');
const notificationMessageEl = document.getElementById('notification-message');
const pendingInvoiceTbody = document.getElementById('pending-invoice-tbody');
const searchResultsTbody = document.getElementById('search-results-tbody');
const searchForm = document.getElementById('invoice-search-form');
const searchTermInput = document.getElementById('search-term');
const searchStatusSelect = document.getElementById('search-status');
const searchDateFromInput = document.getElementById('search-date-from');
const searchDateToInput = document.getElementById('search-date-to');
const modalOverlay = document.getElementById('details-modal');
const modalTitle = document.getElementById('modal-title');
const modalNotification = document.getElementById('modal-notification');
const modalCloseBtn = document.getElementById('modal-close-btn');
const modalCancelBtn = document.getElementById('modal-cancel-btn');
const originalInvoiceTypeEl = document.getElementById('original-invoice-type');
const originalRecipientEmailEl = document.getElementById('original-recipient-email');
const originalKeyInfoEl = document.getElementById('original-key-info');
const originalCompanyNameEl = document.getElementById('original-company-name');
const invoiceEditForm = document.getElementById('invoice-edit-form');
const editInvoiceIdInput = document.getElementById('edit-invoice-id');
const editInvoiceTypeDisplay = document.getElementById('edit-invoice-type-display');
const businessFormFields = document.getElementById('edit-form-business');
const cloudFormFields = document.getElementById('edit-form-cloud');
const donationFormFields = document.getElementById('edit-form-donation');
const editVatNumberInput = document.getElementById('edit-vat-number');
const editCompanyNameInput = document.getElementById('edit-company-name');
const editCarrierTypeInput = document.getElementById('edit-carrier-type');
const editCarrierNumberInput = document.getElementById('edit-carrier-number');
const editDonationCodeInput = document.getElementById('edit-donation-code');
const modalItemsTbody = document.getElementById('modal-items-tbody');
const modalTotalAmountEl = document.getElementById('modal-total-amount');
const modalFooter = document.getElementById('modal-footer');
const btnSaveChanges = document.getElementById('btn-save-changes');
const btnIssueInvoice = document.getElementById('btn-issue-invoice');
const btnVoidInvoice = document.getElementById('btn-void-invoice');

// --- 輔助資料 ---
const statusMap = {
    pending: { text: '待開立', class: 'status-pending' },
    issued: { text: '已開立', class: 'status-issued' },
    failed: { text: '開立失敗', class: 'status-failed' },
    voided: { text: '已作廢', class: 'status-voided' },
};
const typeMap = {
    business: '公司戶發票',
    cloud: '雲端發票',
    donation: '捐贈發票',
};

// --- 資料獲取 ---
async function fetchInvoices(filters = {}) {
    const client = await supabase;
    const { data, error } = await client.functions.invoke(FUNCTION_NAMES.SEARCH_INVOICES, { body: filters });
    if (error) throw error;
    invoicesCache.clear();
    (data || []).forEach(invoice => invoicesCache.set(invoice.id, invoice));
    return data;
}

async function fetchPendingInvoices() {
    pendingInvoiceTbody.innerHTML = `<tr><td colspan="7" class="loading-text">正在載入待開發票列表...</td></tr>`;
    try {
        const pendingInvoices = await fetchInvoices({ status: 'pending', orderStatus: 'shipped' });
        renderInvoiceTable(pendingInvoiceTbody, pendingInvoices, 'pending');
    } catch (err) {
        console.error('獲取待開發票時發生錯誤:', err);
        pendingInvoiceTbody.innerHTML = `<tr><td colspan="7" class="error-message">載入列表失敗，請稍後再試。</td></tr>`;
    }
}

async function handleAdvancedSearch(event) {
    if (event) event.preventDefault();
    const searchBtn = searchForm.querySelector('button[type="submit"]');
    setFormSubmitting(searchBtn, true, '查詢中...');
    searchResultsTbody.innerHTML = `<tr><td colspan="7" class="loading-text">正在查詢中...</td></tr>`;
    try {
        const searchResults = await fetchInvoices({
            searchTerm: searchTermInput.value.trim() || null,
            status: searchStatusSelect.value || null,
            dateFrom: searchDateFromInput.value || null,
            dateTo: searchDateToInput.value || null,
        });
        renderInvoiceTable(searchResultsTbody, searchResults, 'search');
    } catch (err) {
        console.error('查詢發票時發生錯誤:', err);
        searchResultsTbody.innerHTML = `<tr><td colspan="7" class="error-message">查詢時發生錯誤: ${err.message}</td></tr>`;
    } finally {
        setFormSubmitting(searchBtn, false, '查詢');
    }
}

// --- 渲染邏輯 ---
function renderInvoiceTable(tbody, invoices, mode) {
    if (!invoices || invoices.length === 0) {
        const colspan = 7;
        tbody.innerHTML = `<tr><td colspan="${colspan}" class="initial-message">${mode === 'pending' ? '目前沒有已出貨且待開立的發票。' : '找不到符合條件的發票記錄。'}</td></tr>`;
        return;
    }
    tbody.innerHTML = invoices.map(invoice => {
        const statusInfo = statusMap[invoice.status] || { text: invoice.status, class: '' };
        const createdDate = new Date(invoice.created_at).toLocaleDateString();
        const issuedDate = invoice.issued_at ? new Date(invoice.issued_at).toLocaleDateString() : '---';
        const recipient = invoice.company_name || invoice.recipient_name || 'N/A';
        let keyInfo = '---';
        if (invoice.type === 'business') keyInfo = invoice.vat_number;
        else if (invoice.type === 'donation') keyInfo = `愛心碼: ${invoice.donation_code}`;
        else if (invoice.type === 'cloud') keyInfo = `載具: ${invoice.carrier_type}`;

        if (mode === 'pending') {
            return `<tr data-invoice-id="${invoice.id}" class="invoice-row">
                    <td><span class="tag-${invoice.type}">${typeMap[invoice.type] || invoice.type}</span></td>
                    <td>${keyInfo}</td><td>${invoice.order_number}</td><td>${recipient}</td>
                    <td>${formatPrice(invoice.total_amount)}</td><td>${createdDate}</td>
                    <td><button class="btn-primary btn-details">檢視與開立</button></td></tr>`;
        } else {
            return `<tr data-invoice-id="${invoice.id}" class="invoice-row">
                    <td><span class="status-tag ${statusInfo.class}">${statusInfo.text}</span></td>
                    <td>${invoice.invoice_number || '---'}</td><td>${invoice.order_number}</td>
                    <td>${recipient}</td><td>${formatPrice(invoice.total_amount)}</td>
                    <td>${issuedDate}</td><td><button class="btn-secondary btn-details">詳情</button></td></tr>`;
        }
    }).join('');
}

function showDetailsModal(invoice) {
    modalTitle.textContent = `發票作業中心 (訂單 #${invoice.order_number})`;
    originalInvoiceTypeEl.textContent = typeMap[invoice.type] || invoice.type;
    originalRecipientEmailEl.textContent = invoice.recipient_email || '無';
    originalCompanyNameEl.textContent = invoice.company_name || '無';
    let originalKey = '---';
    if (invoice.type === 'business') originalKey = `統編: ${invoice.vat_number}`;
    else if (invoice.type === 'donation') originalKey = `愛心碼: ${invoice.donation_code}`;
    else if (invoice.type === 'cloud') originalKey = `${invoice.carrier_type}: ${invoice.carrier_number || invoice.recipient_email}`;
    originalKeyInfoEl.textContent = originalKey;

    invoiceEditForm.reset();
    editInvoiceIdInput.value = invoice.id;
    editInvoiceTypeDisplay.value = typeMap[invoice.type] || invoice.type;
    [businessFormFields, cloudFormFields, donationFormFields].forEach(f => f.classList.add('hidden'));
    switch(invoice.type) {
        case 'business':
            businessFormFields.classList.remove('hidden');
            editVatNumberInput.value = invoice.vat_number || '';
            editCompanyNameInput.value = invoice.company_name || '';
            break;
        case 'cloud':
            cloudFormFields.classList.remove('hidden');
            editCarrierTypeInput.value = invoice.carrier_type || '';
            editCarrierNumberInput.value = invoice.carrier_number || '';
            break;
        case 'donation':
            donationFormFields.classList.remove('hidden');
            editDonationCodeInput.value = invoice.donation_code || '';
            break;
    }
    
    modalItemsTbody.innerHTML = (invoice.order_items || []).map(item => `<tr><td>${item.variant_name}</td>
        <td>${item.quantity}</td><td>${formatPrice(item.price_at_order)}</td>
        <td>${formatPrice(item.quantity * item.price_at_order)}</td></tr>`).join('');
    modalTotalAmountEl.textContent = formatPrice(invoice.total_amount);

    [btnSaveChanges, btnIssueInvoice, btnVoidInvoice].forEach(btn => btn.classList.add('hidden'));
    if (invoice.status === 'pending' || invoice.status === 'failed') {
        btnSaveChanges.classList.remove('hidden');
        btnIssueInvoice.classList.remove('hidden');
    }
    if (invoice.status === 'issued') {
        btnVoidInvoice.classList.remove('hidden');
    }
    modalOverlay.classList.remove('hidden');
}

// --- 事件處理 ---
function closeModal() {
    modalOverlay.classList.add('hidden');
}

function handleTabClick(event) {
    const clickedTab = event.target.closest('.tab-link');
    if (!clickedTab || clickedTab.classList.contains('active')) return;
    currentTab = clickedTab.dataset.tab;
    tabs.forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.add('hidden'));
    clickedTab.classList.add('active');
    document.getElementById(`${currentTab}-invoices-view`).classList.remove('hidden');
    if (currentTab === 'pending') fetchPendingInvoices();
    else searchResultsTbody.innerHTML = `<tr><td colspan="7" class="initial-message">請輸入條件以開始查詢。</td></tr>`;
}

async function handleSaveChanges() {
    const invoiceId = editInvoiceIdInput.value;
    const invoice = invoicesCache.get(invoiceId);
    if (!invoice) return;

    const updates = {};
    switch (invoice.type) {
        case 'business':
            updates.vat_number = editVatNumberInput.value.trim();
            updates.company_name = editCompanyNameInput.value.trim();
            break;
        case 'cloud':
            updates.carrier_type = editCarrierTypeInput.value.trim();
            updates.carrier_number = editCarrierNumberInput.value.trim();
            break;
        case 'donation':
            updates.donation_code = editDonationCodeInput.value.trim();
            break;
    }
    
    setFormSubmitting(btnSaveChanges, true, '儲存中...');
    try {
        const client = await supabase;
        const { data, error } = await client.functions.invoke(FUNCTION_NAMES.UPDATE_INVOICE_DETAILS, { 
            body: { invoiceId, updates } 
        });
        if (error) throw error;
        if (data.error) throw new Error(data.error);

        // 更新本地快取並重新渲染彈窗
        const updatedInvoice = { ...invoice, ...updates };
        invoicesCache.set(invoiceId, updatedInvoice);
        showDetailsModal(updatedInvoice); // 用更新後的資料重新渲染
        showNotification(data.message || '發票資料已成功更新。', 'success', 'modal-notification');

    } catch (err) {
        console.error("儲存修改失敗:", err);
        showNotification(`儲存失敗: ${err.message}`, 'error', 'modal-notification');
    } finally {
        setFormSubmitting(btnSaveChanges, false, '僅儲存修改');
    }
}

async function handleIssueInvoice() {
    const invoiceId = editInvoiceIdInput.value;
    const invoice = invoicesCache.get(invoiceId);
    if (!invoice) return;
    if (!confirm(`即將為訂單 #${invoice.order_number} 正式開立發票，此操作無法復原。是否確認？`)) return;

    setFormSubmitting(btnIssueInvoice, true, '開立中...');
    try {
        const client = await supabase;
        const { data, error } = await client.functions.invoke(FUNCTION_NAMES.ISSUE_INVOICE_MANUALLY, { body: { invoiceId } });
        if (error) throw error;
        if (data.error) throw new Error(data.error);
        showNotification(data.message || '手動開立請求已成功送出。', 'success', notificationMessageEl);
        closeModal();
        setTimeout(() => currentTab === 'pending' ? fetchPendingInvoices() : handleAdvancedSearch(), 1000);
    } catch (err) {
        console.error("手動開立失敗:", err);
        showNotification(`手動開立失敗: ${err.message}`, 'error', 'modal-notification');
    } finally {
        setFormSubmitting(btnIssueInvoice, false, '確認並開立發票');
    }
}

async function handleVoidInvoice() {
    const invoiceId = editInvoiceIdInput.value;
    const reason = prompt('請輸入作廢原因 (此原因將提交給財政部，20字以內)：');
    if (!reason || reason.trim() === '') return;

    setFormSubmitting(btnVoidInvoice, true, '作廢中...');
    try {
        const client = await supabase;
        const { data, error } = await client.functions.invoke(FUNCTION_NAMES.VOID_INVOICE, { body: { invoiceId, reason: reason.trim() } });
        if (error) throw error;
        if (data.error) throw new Error(data.error);
        showNotification(data.message || '作廢請求已成功送出。', 'success', notificationMessageEl);
        closeModal();
        setTimeout(() => handleAdvancedSearch(), 1000);
    } catch (err) {
        console.error("作廢失敗:", err);
        showNotification(`作廢失敗: ${err.message}`, 'error', 'modal-notification');
    } finally {
        setFormSubmitting(btnVoidInvoice, false, '作廢此發票');
    }
}

function bindEvents() {
    logoutBtn.addEventListener('click', handleInvoiceLogout);
    tabs.forEach(tab => tab.addEventListener('click', handleTabClick));
    searchForm.addEventListener('submit', handleAdvancedSearch);
    searchForm.addEventListener('reset', () => {
        setTimeout(() => searchResultsTbody.innerHTML = `<tr><td colspan="7" class="initial-message">請輸入條件以開始查詢。</td></tr>`, 0);
    });
    document.getElementById('main-content').addEventListener('click', (event) => {
        const row = event.target.closest('.invoice-row');
        if (row && row.dataset.invoiceId) {
            const invoice = invoicesCache.get(row.dataset.invoiceId);
            if (invoice) showDetailsModal(invoice);
        }
    });
    modalCloseBtn.addEventListener('click', closeModal);
    modalCancelBtn.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (event) => { if (event.target === modalOverlay) closeModal(); });
    btnSaveChanges.addEventListener('click', handleSaveChanges);
    btnIssueInvoice.addEventListener('click', handleIssueInvoice);
    btnVoidInvoice.addEventListener('click', handleVoidInvoice);
}

export async function init() {
    currentUser = await requireInvoiceLogin();
    if (!currentUser) return;
    currentUserEmailEl.textContent = currentUser.email;
    authCheckView.classList.add('hidden');
    mainContent.classList.remove('hidden');
    bindEvents();
    await fetchPendingInvoices();
}