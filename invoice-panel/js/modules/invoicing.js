// ==============================================================================
// 檔案路徑: invoice-panel/js/modules/invoicing.js
// ------------------------------------------------------------------------------
// 【發票管理儀表板 - 核心邏輯 (完整版)】
// ==============================================================================

import { supabase } from '../../core/invoiceSupabaseClient.js';
import { requireInvoiceLogin, handleInvoiceLogout } from '../../core/invoiceAuth.js';
import { formatPrice, showNotification, setSubmittingState } from '../../core/utils.js';
import { FUNCTION_NAMES } from '../../core/constants.js';

// --- 狀態管理 ---
let currentUser = null;
let invoicesCache = [];

// --- DOM 元素獲取 ---
const logoutBtn = document.getElementById('logout-btn');
const currentUserEmailEl = document.getElementById('current-user-email');
const authCheckView = document.getElementById('auth-check-view');
const mainContent = document.getElementById('main-content');
const statusFilter = document.getElementById('status-filter');
const dateFromInput = document.getElementById('date-from');
const dateToInput = document.getElementById('date-to');
const searchTermInput = document.getElementById('search-term');
const searchBtn = document.getElementById('search-btn');
const resetBtn = document.getElementById('reset-btn');
const invoiceListBody = document.getElementById('invoice-list-body');
const modalOverlay = document.getElementById('details-modal');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');
const modalFooter = document.getElementById('modal-footer');
const modalCloseBtn = document.getElementById('modal-close-btn');

// --- 輔助資料 ---
const statusMap = {
    pending: { text: '待開立', class: 'status-pending' },
    issued: { text: '已開立', class: 'status-issued' },
    failed: { text: '開立失敗', class: 'status-failed' },
    voided: { text: '已作廢', class: 'status-voided' },
};

// --- 核心函式 ---

/**
 * 根據快取的資料渲染發票列表
 */
function renderInvoiceList() {
    if (!invoicesCache || invoicesCache.length === 0) {
        invoiceListBody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 2rem;">找不到符合條件的發票記錄。</td></tr>`;
        return;
    }

    invoiceListBody.innerHTML = invoicesCache.map(invoice => {
        const statusInfo = statusMap[invoice.status] || { text: invoice.status, class: '' };
        const recipient = invoice.company_name || invoice.recipient_name || 'N/A';
        const issuedDate = invoice.issued_at ? new Date(invoice.issued_at).toLocaleDateString() : '---';

        return `
            <tr data-invoice-id="${invoice.id}" class="invoice-row">
                <td><span class="status-tag ${statusInfo.class}">${statusInfo.text}</span></td>
                <td>${invoice.orders?.order_number || 'N/A'}</td>
                <td>${invoice.invoice_number || '---'}</td>
                <td>${issuedDate}</td>
                <td>${recipient}</td>
                <td>${invoice.vat_number || '---'}</td>
                <td>${formatPrice(invoice.total_amount)}</td>
                <td>
                    <button class="btn-secondary btn-details" data-invoice-id="${invoice.id}">詳情</button>
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * 處理發票的搜尋與篩選
 */
async function handleSearch() {
    setSubmittingState(searchBtn, true, '查詢中...');
    invoiceListBody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 2rem;">正在查詢中...</td></tr>`;
    showNotification('', 'info');

    const filters = {
        status: statusFilter.value,
        dateFrom: dateFromInput.value,
        dateTo: dateToInput.value,
        searchTerm: searchTermInput.value.trim(),
    };
    const activeFilters = Object.fromEntries(Object.entries(filters).filter(([_, v]) => v));

    try {
        const client = await supabase;
        const { data, error } = await client.functions.invoke(FUNCTION_NAMES.SEARCH_INVOICES, {
            body: activeFilters
        });

        if (error) throw error;
        if (data.error) throw new Error(data.error);

        invoicesCache = data;
        renderInvoiceList();
    } catch (err) {
        console.error('查詢發票時發生錯誤:', err);
        showNotification(`查詢失敗：${err.message}`, 'error');
        invoiceListBody.innerHTML = `<tr><td colspan="8" class="error-message">查詢時發生錯誤，請稍後再試。</td></tr>`;
    } finally {
        setSubmittingState(searchBtn, false, '查詢');
    }
}

/**
 * 顯示發票詳情彈窗
 * @param {object} invoice - 要顯示的發票物件
 */
function showDetailsModal(invoice) {
    modalTitle.textContent = `發票詳情 (訂單 #${invoice.orders?.order_number})`;
    
    let modalHtml = `
        <div class="modal-section">
            <h4>顧客指定資訊</h4>
            <p><strong>發票類型:</strong> ${invoice.type}</p>
            ${invoice.vat_number ? `<p><strong>統一編號:</strong> ${invoice.vat_number}</p>` : ''}
            ${invoice.company_name ? `<p><strong>公司抬頭:</strong> ${invoice.company_name}</p>` : ''}
            ${invoice.carrier_type ? `<p><strong>載具類型:</strong> ${invoice.carrier_type}</p>` : ''}
            ${invoice.carrier_number ? `<p><strong>載具號碼:</strong> ${invoice.carrier_number}</p>` : ''}
            ${invoice.donation_code ? `<p><strong>愛心碼:</strong> ${invoice.donation_code}</p>` : ''}
        </div>
        <div class="modal-section">
            <h4>開立結果</h4>
            <p><strong>發票號碼:</strong> ${invoice.invoice_number || '尚未開立'}</p>
            <p><strong>開立狀態:</strong> ${statusMap[invoice.status]?.text || invoice.status}</p>
            <p><strong>開立時間:</strong> ${invoice.issued_at ? new Date(invoice.issued_at).toLocaleString() : '---'}</p>
            ${invoice.error_message ? `<p><strong>錯誤訊息:</strong> <span class="error-text">${invoice.error_message}</span></p>` : ''}
        </div>
    `;
    modalBody.innerHTML = modalHtml;

    renderModalActions(invoice);
    modalOverlay.classList.remove('hidden');
}

/**
 * 根據發票狀態，渲染 Modal 中的操作按鈕
 * @param {object} invoice - 發票物件
 */
function renderModalActions(invoice) {
    modalFooter.innerHTML = ''; // 清空舊按鈕
    
    if (invoice.status === 'failed' || invoice.status === 'pending') {
        const reissueBtn = document.createElement('button');
        reissueBtn.id = 'reissue-invoice-btn';
        reissueBtn.className = 'btn-submit';
        reissueBtn.textContent = '手動補開發票';
        reissueBtn.dataset.invoiceId = invoice.id;
        modalFooter.appendChild(reissueBtn);
    }

    if (invoice.status === 'issued') {
        const voidBtn = document.createElement('button');
        voidBtn.id = 'void-invoice-btn';
        voidBtn.className = 'btn-danger';
        voidBtn.textContent = '作廢此發票';
        voidBtn.dataset.invoiceId = invoice.id;
        modalFooter.appendChild(voidBtn);
    }
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn-secondary';
    closeBtn.textContent = '關閉';
    closeBtn.addEventListener('click', () => modalOverlay.classList.add('hidden'));
    modalFooter.appendChild(closeBtn);
}

/**
 * 綁定事件監聽器
 */
function bindEvents() {
    if (logoutBtn) logoutBtn.addEventListener('click', handleInvoiceLogout);
    if (searchBtn) searchBtn.addEventListener('click', handleSearch);
    
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            document.querySelector('.filters-and-search form')?.reset(); // 如果有 form 的話
            statusFilter.value = '';
            dateFromInput.value = '';
            dateToInput.value = '';
            searchTermInput.value = '';
            handleSearch();
        });
    }

    invoiceListBody.addEventListener('click', (event) => {
        const row = event.target.closest('.invoice-row');
        if (row) {
            const invoiceId = row.dataset.invoiceId;
            const invoice = invoicesCache.find(inv => inv.id === invoiceId);
            if (invoice) {
                showDetailsModal(invoice);
            }
        }
    });

    if (modalCloseBtn) modalCloseBtn.addEventListener('click', () => modalOverlay.classList.add('hidden'));
    if (modalOverlay) modalOverlay.addEventListener('click', (event) => {
        if (event.target === modalOverlay) {
            modalOverlay.classList.add('hidden');
        }
    });

    // 為 Modal Footer 的動態按鈕綁定事件
    modalFooter.addEventListener('click', async (event) => {
        const target = event.target;
        const invoiceId = target.dataset.invoiceId;
        if (!invoiceId) return;

        if (target.id === 'reissue-invoice-btn') {
            setSubmittingState(target, true, '開立中...');
            try {
                const client = await supabase;
                // TODO: 建立並呼叫 issue-invoice-manually function
                alert(`模擬呼叫「手動開立」API，Invoice ID: ${invoiceId}`);
                showNotification('手動開立請求已送出。', 'success');
            } catch (err) {
                showNotification(`手動開立失敗: ${err.message}`, 'error');
            } finally {
                setSubmittingState(target, false, '手動補開發票');
                modalOverlay.classList.add('hidden');
                handleSearch(); // 刷新列表
            }
        }

        if (target.id === 'void-invoice-btn') {
            const reason = prompt('請輸入作廢原因：');
            if (reason) {
                setSubmittingState(target, true, '作廢中...');
                try {
                    const client = await supabase;
                    // TODO: 建立並呼叫 void-invoice function
                    alert(`模擬呼叫「作廢發票」API，Invoice ID: ${invoiceId}, 原因: ${reason}`);
                    showNotification('作廢請求已送出。', 'success');
                } catch (err) {
                    showNotification(`作廢失敗: ${err.message}`, 'error');
                } finally {
                    setSubmittingState(target, false, '作廢此發票');
                    modalOverlay.classList.add('hidden');
                    handleSearch(); // 刷新列表
                }
            }
        }
    });
}

/**
 * 由 app.js 呼叫的主初始化函式
 */
export async function init() {
    currentUser = await requireInvoiceLogin();
    if (!currentUser) return;

    if (currentUserEmailEl) {
        currentUserEmailEl.textContent = currentUser.email;
    }

    authCheckView.classList.add('hidden');
    mainContent.classList.remove('hidden');
    bindEvents();
    await handleSearch(); // 頁面載入時，執行一次預設查詢
}