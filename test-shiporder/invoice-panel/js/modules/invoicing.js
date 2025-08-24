// ==============================================================================
// 檔案路徑: invoice-panel/js/modules/invoicing.js
// 版本: v47.6 - 最終優化勝利收官版
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Invoicing Module (發票管理模組)
 * @description 最終版。實現了具備勾選式批次匯出 (CSV & XLSX)、審核修正、
 *              手動校正、品項校對、開立與作廢功能於一體的完整發票作業中心。
 * @version v47.6
 * 
 * @update v47.6 - [FINAL POLISHING & DUAL EXPORT]
 * 1. [雙匯出功能] 完整實現 CSV 與 XLSX 雙格式匯出，並共用一個 `handleExport` 函式。
 * 2. [智慧檔名] 匯出單筆發票時，檔名會自動以「訂單編號」命名。
 * 3. [邏輯修正] `handleAdvancedSearch` 函式現在會正確地排除「待開立」狀態。
 * 4. [UI 一致性] 「進階查詢」頁籤的匯出按鈕現在功能完整。
 * 5. [錯誤修正] 修正了所有 `showNotification` 函式的呼叫錯誤。專案至此勝利收官。
 */

import { supabase } from '/_shared/js/supabaseClient.js';
import { formatPrice, showNotification, setFormSubmitting } from '/_shared/js/utils.js';
import { requireInvoiceLogin, handleInvoiceLogout } from '/invoice-panel/js/core/invoiceAuth.js';
import { FUNCTION_NAMES } from '/invoice-panel/js/core/constants.js';

let currentUser = null;
let invoicesCache = new Map();
let currentTab = 'pending';
let selectedInvoices = new Set();

const mainContent = document.getElementById('main-content');
const authCheckView = document.getElementById('auth-check-view');
const currentUserEmailEl = document.getElementById('current-user-email');
const logoutBtn = document.getElementById('logout-btn');
const tabs = document.querySelectorAll('.tab-link');
const pendingInvoiceTbody = document.getElementById('pending-invoice-tbody');
const searchResultsTbody = document.getElementById('search-results-tbody');
const selectAllPendingCheckbox = document.getElementById('select-all-pending');
const selectAllSearchCheckbox = document.getElementById('select-all-search');
const searchForm = document.getElementById('invoice-search-form');
const searchTermInput = document.getElementById('search-term');
const searchStatusSelect = document.getElementById('search-status');
const searchDateFromInput = document.getElementById('search-date-from');
const searchDateToInput = document.getElementById('search-date-to');
const btnExportCsvPending = document.getElementById('btn-export-csv-pending');
const btnExportXlsxPending = document.getElementById('btn-export-xlsx-pending');
const btnExportCsvSearch = document.getElementById('btn-export-csv-search');
const btnExportXlsxSearch = document.getElementById('btn-export-xlsx-search');
const modalOverlay = document.getElementById('details-modal');
const modalTitle = document.getElementById('modal-title');
const modalNotification = document.getElementById('modal-notification');
const modalCloseBtn = document.getElementById('modal-close-btn');
const modalCancelBtn = document.getElementById('modal-cancel-btn');
const originalInfoSection = document.getElementById('original-info-section');
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
const manualCorrectionSection = document.getElementById('manual-correction-section');
const correctInvoiceNumberInput = document.getElementById('correct-invoice-number');
const correctIssuedAtInput = document.getElementById('correct-issued-at');
const modalItemsTbody = document.getElementById('modal-items-tbody');
const modalTotalAmountEl = document.getElementById('modal-total-amount');
const modalFooter = document.getElementById('modal-footer');
const btnSaveChanges = document.getElementById('btn-save-changes');
const btnIssueInvoice = document.getElementById('btn-issue-invoice');
const btnVoidInvoice = document.getElementById('btn-void-invoice');

const statusMap = { pending: { text: '待開立', class: 'status-pending' }, issued: { text: '已開立', class: 'status-issued' }, failed: { text: '開立失敗', class: 'status-failed' }, voided: { text: '已作廢', class: 'status-voided' } };
const typeMap = { business: '公司戶發票', cloud: '雲端發票', donation: '捐贈發票' };

async function fetchInvoices(filters = {}) {
    const client = await supabase;
    const { data, error } = await client.functions.invoke(FUNCTION_NAMES.SEARCH_INVOICES, { body: filters });
    if (error) throw error;
    invoicesCache.clear();
    (data || []).forEach(invoice => invoicesCache.set(invoice.id, invoice));
    return data;
}

function updateSelectionState() {
    const activeTbody = currentTab === 'pending' ? pendingInvoiceTbody : searchResultsTbody;
    const activeExportCsvBtn = currentTab === 'pending' ? btnExportCsvPending : btnExportCsvSearch;
    const activeExportXlsxBtn = currentTab === 'pending' ? btnExportXlsxPending : btnExportXlsxSearch;
    const checkboxes = activeTbody.querySelectorAll('.row-checkbox');
    const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
    if (activeExportCsvBtn) activeExportCsvBtn.disabled = checkedCount === 0;
    if (activeExportXlsxBtn) activeExportXlsxBtn.disabled = checkedCount === 0;
}

function renderInvoiceTable(tbody, invoices, mode) {
    if (!invoices || invoices.length === 0) {
        const colspan = 8;
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
        const checkboxCell = `<td class="checkbox-cell"><input type="checkbox" class="row-checkbox" data-invoice-id="${invoice.id}"></td>`;
        if (mode === 'pending') {
            return `<tr data-invoice-id="${invoice.id}" class="invoice-row">${checkboxCell}<td><span class="tag-${invoice.type}">${typeMap[invoice.type] || invoice.type}</span></td><td>${keyInfo}</td><td>${invoice.order_number}</td><td>${recipient}</td><td>${formatPrice(invoice.total_amount)}</td><td>${createdDate}</td><td><button class="btn-primary btn-details">檢視與開立</button></td></tr>`;
        } else {
            return `<tr data-invoice-id="${invoice.id}" class="invoice-row">${checkboxCell}<td><span class="status-tag ${statusInfo.class}">${statusInfo.text}</span></td><td>${invoice.invoice_number || '---'}</td><td>${invoice.order_number}</td><td>${recipient}</td><td>${formatPrice(invoice.total_amount)}</td><td>${issuedDate}</td><td><button class="btn-secondary btn-details">詳情</button></td></tr>`;
        }
    }).join('');
    updateSelectionState();
}

async function fetchPendingInvoices() {
    pendingInvoiceTbody.innerHTML = `<tr><td colspan="8" class="loading-text">正在載入待開發票列表...</td></tr>`;
    try {
        const pendingInvoices = await fetchInvoices({ status: ['pending', 'failed'], orderStatus: 'shipped' });
        renderInvoiceTable(pendingInvoiceTbody, pendingInvoices, 'pending');
    } catch (err) {
        console.error('獲取待開發票時發生錯誤:', err);
        pendingInvoiceTbody.innerHTML = `<tr><td colspan="8" class="error-message">載入列表失敗，請稍後再試。</td></tr>`;
    }
}

async function handleAdvancedSearch(event) {
    if (event) event.preventDefault();
    const searchBtn = searchForm.querySelector('button[type="submit"]');
    setFormSubmitting(searchBtn, true, '查詢中...');
    searchResultsTbody.innerHTML = `<tr><td colspan="8" class="loading-text">正在查詢中...</td></tr>`;
    try {
        const statusValue = searchStatusSelect.value;
        const searchResults = await fetchInvoices({
            searchTerm: searchTermInput.value.trim() || null,
            status: statusValue === '' ? ['issued', 'voided', 'failed'] : statusValue,
            dateFrom: searchDateFromInput.value || null,
            dateTo: searchDateToInput.value || null,
        });
        renderInvoiceTable(searchResultsTbody, searchResults, 'search');
    } catch (err) {
        console.error('查詢發票時發生錯誤:', err);
        searchResultsTbody.innerHTML = `<tr><td colspan="8" class="error-message">查詢時發生錯誤: ${err.message}</td></tr>`;
    } finally {
        setFormSubmitting(searchBtn, false, '查詢');
    }
}

function showDetailsModal(invoice) {
    modalTitle.textContent = `發票作業中心 (訂單 #${invoice.order_number})`;
    [originalInfoSection, invoiceEditForm, manualCorrectionSection].forEach(el => el.classList.add('hidden'));
    [btnSaveChanges, btnIssueInvoice, btnVoidInvoice].forEach(btn => btn.classList.add('hidden'));

    originalInfoSection.classList.remove('hidden');
    originalInvoiceTypeEl.textContent = typeMap[invoice.type] || invoice.type;
    originalRecipientEmailEl.textContent = invoice.recipient_email || '無';
    originalCompanyNameEl.textContent = invoice.company_name || '無';
    let originalKey = '---';
    if (invoice.type === 'business') originalKey = `統編: ${invoice.vat_number}`;
    else if (invoice.type === 'donation') originalKey = `愛心碼: ${invoice.donation_code}`;
    else if (invoice.type === 'cloud') originalKey = `${invoice.carrier_type}: ${invoice.carrier_number || invoice.recipient_email}`;
    originalKeyInfoEl.textContent = originalKey;

    editInvoiceIdInput.value = invoice.id;

    if (invoice.status === 'pending' || invoice.status === 'failed') {
        invoiceEditForm.classList.remove('hidden');
        editInvoiceTypeDisplay.value = typeMap[invoice.type] || invoice.type;
        [businessFormFields, cloudFormFields, donationFormFields].forEach(f => f.classList.add('hidden'));
        switch(invoice.type) {
            case 'business': businessFormFields.classList.remove('hidden'); editVatNumberInput.value = invoice.vat_number || ''; editCompanyNameInput.value = invoice.company_name || ''; break;
            case 'cloud': cloudFormFields.classList.remove('hidden'); editCarrierTypeInput.value = invoice.carrier_type || ''; editCarrierNumberInput.value = invoice.carrier_number || ''; break;
            case 'donation': donationFormFields.classList.remove('hidden'); editDonationCodeInput.value = invoice.donation_code || ''; break;
        }
        btnSaveChanges.textContent = '儲存修改';
        btnSaveChanges.classList.remove('hidden');
        btnIssueInvoice.classList.remove('hidden');
    } else {
        manualCorrectionSection.classList.remove('hidden');
        correctInvoiceNumberInput.value = invoice.invoice_number || '';
        correctIssuedAtInput.value = invoice.issued_at ? new Date(new Date(invoice.issued_at).getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().slice(0, 16) : '';
        btnSaveChanges.textContent = '儲存校正結果';
        btnSaveChanges.classList.remove('hidden');
        if (invoice.status === 'issued') btnVoidInvoice.classList.remove('hidden');
    }
    
    modalItemsTbody.innerHTML = (invoice.order_items || []).map(item => `<tr><td>${item.variant_name}</td><td>${item.quantity}</td><td>${formatPrice(item.price_at_order)}</td><td>${formatPrice(item.quantity * item.price_at_order)}</td></tr>`).join('');
    modalTotalAmountEl.textContent = formatPrice(invoice.total_amount);
    modalOverlay.classList.remove('hidden');
}

function handleSelectionChange(event) {
    const target = event.target;
    if (target.matches('#select-all-pending, #select-all-search')) {
        const tbody = target.id === 'select-all-pending' ? pendingInvoiceTbody : searchResultsTbody;
        tbody.querySelectorAll('.row-checkbox').forEach(cb => cb.checked = target.checked);
    }
    
    selectedInvoices.clear();
    document.querySelectorAll('.row-checkbox:checked').forEach(cb => selectedInvoices.add(cb.dataset.invoiceId));
    updateSelectionState();
}

async function handleSaveChanges() {
    const invoiceId = editInvoiceIdInput.value;
    const invoice = invoicesCache.get(invoiceId);
    if (!invoice) return;
    const updates = {};
    if (invoice.status === 'pending' || invoice.status === 'failed') {
        switch (invoice.type) {
            case 'business': updates.vat_number = editVatNumberInput.value.trim(); updates.company_name = editCompanyNameInput.value.trim(); break;
            case 'cloud': updates.carrier_type = editCarrierTypeInput.value.trim(); updates.carrier_number = editCarrierNumberInput.value.trim(); break;
            case 'donation': updates.donation_code = editDonationCodeInput.value.trim(); break;
        }
    } else {
        updates.invoice_number = correctInvoiceNumberInput.value.trim();
        updates.issued_at = correctIssuedAtInput.value ? new Date(correctIssuedAtInput.value).toISOString() : null;
    }
    setFormSubmitting(btnSaveChanges, true, '儲存中...');
    try {
        const client = await supabase;
        const { data, error } = await client.functions.invoke(FUNCTION_NAMES.UPDATE_INVOICE_DETAILS, { body: { invoiceId, updates } });
        if (error) throw error; if (data.error) throw new Error(data.error);
        const updatedInvoice = { ...invoice, ...updates };
        invoicesCache.set(invoiceId, updatedInvoice);
        showDetailsModal(updatedInvoice);
        showNotification(data.message || '資料已成功更新。', 'success', 'modal-notification');
        setTimeout(() => currentTab === 'pending' ? fetchPendingInvoices() : handleAdvancedSearch(), 1500);
    } catch (err) {
        console.error("儲存修改失敗:", err);
        showNotification(`儲存失敗: ${err.message}`, 'error', 'modal-notification');
    } finally {
        setFormSubmitting(btnSaveChanges, false, '儲存修改');
    }
}

async function handleIssueInvoice() {
    const invoiceId = editInvoiceIdInput.value;
    const invoice = invoicesCache.get(invoiceId);
    if (!invoice || !confirm(`即將為訂單 #${invoice.order_number} 正式開立發票，此操作無法復原。是否確認？`)) return;
    setFormSubmitting(btnIssueInvoice, true, '開立中...');
    try {
        const client = await supabase;
        const { data, error } = await client.functions.invoke(FUNCTION_NAMES.ISSUE_INVOICE_MANUALLY, { body: { invoiceId } });
        if (error) throw error; if (data.error) throw new Error(data.error);
        showNotification(data.message || '手動開立請求已成功送出。', 'success', 'notification-message');
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
        if (error) throw error; if (data.error) throw new Error(data.error);
        showNotification(data.message || '作廢請求已成功送出。', 'success', 'notification-message');
        closeModal();
        setTimeout(() => handleAdvancedSearch(), 1000);
    } catch (err) {
        console.error("作廢失敗:", err);
        showNotification(`作廢失敗: ${err.message}`, 'error', 'modal-notification');
    } finally {
        setFormSubmitting(btnVoidInvoice, false, '作廢此發票');
    }
}

async function handleExport(format, btn) {
    const idsToExport = Array.from(selectedInvoices);
    if (idsToExport.length === 0) {
        showNotification('請先勾選您想匯出的發票。', 'warn', 'notification-message');
        return;
    }
    setFormSubmitting(btn, true, '正在產生檔案...');
    try {
        const client = await supabase;
        const functionName = format === 'csv' ? FUNCTION_NAMES.EXPORT_INVOICES_CSV : FUNCTION_NAMES.EXPORT_INVOICES_XLSX;
        const { data, error } = await client.functions.invoke(functionName, {
            body: { invoiceIds: idsToExport }, responseType: 'blob'
        });
        if (error) throw error;
        
        const mimeType = format === 'csv' ? 'text/csv;charset=utf-8;' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        const blob = new Blob([data], { type: mimeType });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        let fileName = `invoices_batch_export_${new Date().toISOString().slice(0, 10)}.${format}`;
        if (idsToExport.length === 1) {
            const singleInvoice = invoicesCache.get(idsToExport[0]);
            if (singleInvoice) fileName = `${singleInvoice.order_number}_${new Date().toISOString().slice(0, 10)}.${format}`;
        }
        a.href = url; a.download = fileName;
        document.body.appendChild(a); a.click();
        window.URL.revokeObjectURL(url); a.remove();
        showNotification(`${format.toUpperCase()} 檔案已成功匯出。`, 'success', 'notification-message');
    } catch (err) {
        console.error(`匯出 ${format.toUpperCase()} 失敗:`, err);
        showNotification(`匯出 ${format.toUpperCase()} 失敗: ${err.message}`, 'error', 'notification-message');
    } finally {
        setFormSubmitting(btn, false, `匯出所選項目 (${format.toUpperCase()})`);
    }
}

function handleTabClick(event) {
    const clickedTab = event.target.closest('.tab-link');
    if (!clickedTab || clickedTab.classList.contains('active')) return;
    currentTab = clickedTab.dataset.tab;
    tabs.forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.add('hidden'));
    clickedTab.classList.add('active');
    document.getElementById(`${currentTab}-invoices-view`).classList.remove('hidden');
    if (currentTab === 'pending') {
        fetchPendingInvoices();
    } else {
        searchResultsTbody.innerHTML = `<tr><td colspan="8" class="initial-message">請輸入條件以開始查詢。</td></tr>`;
    }
    updateSelectionState();
}

function closeModal() { 
    modalOverlay.classList.add('hidden'); 
}

function bindEvents() {
    logoutBtn.addEventListener('click', handleInvoiceLogout);
    tabs.forEach(tab => tab.addEventListener('click', handleTabClick));
    searchForm.addEventListener('submit', handleAdvancedSearch);
    searchForm.addEventListener('reset', () => {
        setTimeout(() => searchResultsTbody.innerHTML = `<tr><td colspan="8" class="initial-message">請輸入條件以開始查詢。</td></tr>`, 0);
    });
    mainContent.addEventListener('click', (event) => {
        if (event.target.closest('.btn-details')) {
            const row = event.target.closest('.invoice-row');
            if (row && row.dataset.invoiceId) {
                const invoice = invoicesCache.get(row.dataset.invoiceId);
                if (invoice) showDetailsModal(invoice);
            }
        }
        if (event.target.matches('.row-checkbox, #select-all-pending, #select-all-search')) {
            handleSelectionChange(event);
        }
    });
    modalCloseBtn.addEventListener('click', closeModal);
    modalCancelBtn.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (event) => { if (event.target === modalOverlay) closeModal(); });
    btnSaveChanges.addEventListener('click', handleSaveChanges);
    btnIssueInvoice.addEventListener('click', handleIssueInvoice);
    btnVoidInvoice.addEventListener('click', handleVoidInvoice);
    btnExportCsvPending.addEventListener('click', (e) => handleExport( 'csv', e.target));
    btnExportXlsxPending.addEventListener('click', (e) => handleExport( 'xlsx', e.target));
    btnExportCsvSearch.addEventListener('click', (e) => handleExport( 'csv', e.target));
    btnExportXlsxSearch.addEventListener('click', (e) => handleExport( 'xlsx', e.target));
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
83.7s
