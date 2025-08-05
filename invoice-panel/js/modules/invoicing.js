// ==============================================================================
// 檔案路徑: invoice-panel/js/modules/invoicing.js
// ------------------------------------------------------------------------------
// 【發票管理儀表板 - 核心邏輯】
// ==============================================================================

// 假設 invoice-panel 會有自己的一套核心檔案
import { supabase } from '../../core/invoiceSupabaseClient.js';
import { requireInvoiceLogin, handleInvoiceLogout } from '../../core/invoiceAuth.js';
import { formatPrice, showNotification } from '../../core/utils.js';
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
const invoiceListBody = document.getElementById('invoice-list-body');

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
            <tr>
                <td><span class="status-tag ${statusInfo.class}">${statusInfo.text}</span></td>
                <td>${invoice.orders.order_number || 'N/A'}</td>
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
    searchBtn.disabled = true;
    searchBtn.textContent = '查詢中...';
    invoiceListBody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 2rem;">正在查詢中...</td></tr>`;
    showNotification('', 'info');

    // 收集所有篩選條件
    const filters = {
        status: statusFilter.value,
        dateFrom: dateFromInput.value,
        dateTo: dateToInput.value,
        searchTerm: searchTermInput.value.trim(),
    };

    // 移除空的篩選條件
    const activeFilters = Object.fromEntries(Object.entries(filters).filter(([_, v]) => v));

    try {
        const { data, error } = await supabase.functions.invoke(FUNCTION_NAMES.SEARCH_INVOICES, {
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
        searchBtn.disabled = false;
        searchBtn.textContent = '查詢';
    }
}

/**
 * 綁定事件監聽器
 */
function bindEvents() {
    if (logoutBtn) logoutBtn.addEventListener('click', handleInvoiceLogout);
    if (searchBtn) searchBtn.addEventListener('click', handleSearch);
    
    // TODO: 為詳情按鈕綁定事件，打開 Modal 顯示詳細資訊
    invoiceListBody.addEventListener('click', (event) => {
        if (event.target.classList.contains('btn-details')) {
            const invoiceId = event.target.dataset.invoiceId;
            alert(`您點擊了發票 ID: ${invoiceId} 的詳情按鈕。\n(此處應打開一個顯示詳細資訊的 Modal 彈窗)`);
            // const invoice = invoicesCache.find(inv => inv.id === invoiceId);
            // if (invoice) { showDetailsModal(invoice); }
        }
    });
}

/**
 * 由 app.js 呼叫的主初始化函式
 */
export async function init() {
    currentUser = await requireInvoiceLogin(); // 假設有專屬的登入驗證
    if (!currentUser) return;

    if (currentUserEmailEl) {
        currentUserEmailEl.textContent = currentUser.email;
    }

    // 【核心權限檢查】
    const userRoles = currentUser.app_metadata?.roles || [];
    if (userRoles.includes('accounting_staff') || userRoles.includes('super_admin')) {
        // 權限驗證通過
        authCheckView.classList.add('hidden');
        mainContent.classList.remove('hidden');
        bindEvents();
        handleSearch(); // 頁面載入時，執行一次預設查詢
    } else {
        // 權限不足
        authCheckView.innerHTML = '<p class="error-message">權限不足。只有會計人員或超級管理員才能存取此頁面。</p>';
    }
}