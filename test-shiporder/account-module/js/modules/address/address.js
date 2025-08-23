// ==============================================================================
// 檔案路徑: account-module/js/modules/address/address.js
// 版本: v32.0 - 消費者端模組拆分
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file Address Management Module (地址管理模組)
 * @description 處理使用者收貨地址的完整 CRUD (增刪查改) 功能。
 */

import { supabase } from '../../core/supabaseClient.js';
import { requireLogin } from '../../core/session.js';
import { showNotification, setFormSubmitting } from '../../core/utils.js';
import { TABLE_NAMES } from '../../core/constants.js';
import { taiwanZipcodes } from '../../core/taiwan_zipcodes.js';

// --- 常數定義 ---
const MAX_ADDRESSES = 5;

// --- 狀態管理 ---
let currentUser = null;
let addressesCache = [];

// --- DOM 元素獲取 ---
const loadingIndicator = document.getElementById('loading-indicator');
const addressListContainer = document.getElementById('address-list');
const formContainer = document.getElementById('address-form-container');
const addressForm = document.getElementById('address-form');
const formTitle = document.getElementById('form-title');
const addNewAddressBtn = document.getElementById('add-new-address-btn');
const cancelBtn = document.getElementById('cancel-btn');
const citySelector = document.getElementById('city-selector');
const districtSelector = document.getElementById('district-selector');
const postalCodeDisplay = document.getElementById('postal-code-display');
const postalCodeInput = document.getElementById('postal-code-input');
const addressLimitNotice = document.getElementById('address-limit-notice');
const notificationMessage = document.getElementById('notification-message');

// --- 郵遞區號聯動邏輯 ---
function initCitySelector() {
    if (!citySelector) return;
    const cities = Object.keys(taiwanZipcodes);
    cities.forEach(city => {
        const option = new Option(city, city);
        citySelector.add(option);
    });
}
function updateDistrictSelector() {
    const selectedCity = citySelector.value;
    districtSelector.innerHTML = '<option value="">請選擇鄉鎮市區</option>';
    postalCodeDisplay.textContent = '---';
    postalCodeInput.value = '';
    if (selectedCity && taiwanZipcodes[selectedCity]) {
        const districts = Object.keys(taiwanZipcodes[selectedCity]);
        districts.forEach(district => {
            const option = new Option(district, district);
            districtSelector.add(option);
        });
    }
}
function updatePostalCode() {
    const selectedCity = citySelector.value;
    const selectedDistrict = districtSelector.value;
    if (selectedCity && selectedDistrict && taiwanZipcodes[selectedCity]?.[selectedDistrict]) {
        const zipcode = taiwanZipcodes[selectedCity][selectedDistrict];
        postalCodeDisplay.textContent = zipcode;
        postalCodeInput.value = zipcode;
    } else {
        postalCodeDisplay.textContent = '---';
        postalCodeInput.value = '';
    }
}

// --- 核心 CRUD 函式 ---
async function fetchAddresses() {
    if (loadingIndicator) loadingIndicator.classList.remove('hidden');
    if (addressListContainer) addressListContainer.classList.add('hidden');
    
    try {
        const client = await supabase;
        const { data, error } = await client
            .from(TABLE_NAMES.ADDRESSES)
            .select('*')
            .eq('user_id', currentUser.id)
            .order('is_default', { ascending: false })
            .order('created_at', { ascending: false });

        if (error) throw error;

        addressesCache = data;
        renderAddressList();
    } catch (error) {
        console.error('讀取地址時發生錯誤:', error);
        if (loadingIndicator) loadingIndicator.textContent = '讀取地址失敗，請稍後再試。';
    } finally {
        if (loadingIndicator) loadingIndicator.classList.add('hidden');
        if (addressListContainer) addressListContainer.classList.remove('hidden');
    }
}

function renderAddressList() {
    if (!addressListContainer) return;
    addressListContainer.innerHTML = '';
    
    if (addressesCache.length >= MAX_ADDRESSES) {
        if (addNewAddressBtn) addNewAddressBtn.classList.add('hidden');
        if (addressLimitNotice) addressLimitNotice.classList.remove('hidden');
    } else {
        if (addNewAddressBtn) addNewAddressBtn.classList.remove('hidden');
        if (addressLimitNotice) addressLimitNotice.classList.add('hidden');
    }

    if (addressesCache.length === 0) {
        addressListContainer.innerHTML = '<p>您尚未新增任何收貨地址。</p>';
        return;
    }

    addressesCache.forEach(addr => {
        const item = document.createElement('div');
        item.className = 'address-item';
        if (addr.is_default) { item.classList.add('default'); }
        const fullAddress = `${addr.postal_code || ''} ${addr.city || ''}${addr.district || ''}${addr.street_address || ''}`;
        const telNumberHtml = addr.tel_number ? `<p>市話：${addr.tel_number}</p>` : '';
        const aliasHtml = addr.alias ? `<p class="alias">${addr.alias}</p>` : '';
        
        item.innerHTML = `
            ${aliasHtml}
            <p><strong>${addr.recipient_name}</strong> ${addr.is_default ? '<span style="color: #5E8C61; font-weight: bold;">(預設地址)</span>' : ''}</p>
            <p>手機：${addr.phone_number}</p>
            ${telNumberHtml}
            <p>${fullAddress}</p>
            <div class="actions">
                <button data-id="${addr.id}" class="edit-btn">編輯</button>
                <button data-id="${addr.id}" class="delete-btn">刪除</button>
                ${!addr.is_default ? `<button data-id="${addr.id}" class="set-default-btn">設為預設</button>` : ''}
            </div>`;
        addressListContainer.appendChild(item);
    });
}

function showForm(addressToEdit = null) {
    if (!addressToEdit && addressesCache.length >= MAX_ADDRESSES) {
        showNotification(`您最多只能新增 ${MAX_ADDRESSES} 筆地址。`, 'error');
        return;
    }
    showNotification('', 'info');
    if (formContainer) formContainer.classList.remove('hidden');
    if (addNewAddressBtn) addNewAddressBtn.classList.add('hidden');
    if (addressForm) addressForm.reset();
    if (citySelector) citySelector.value = '';
    updateDistrictSelector();

    if (addressToEdit) {
        formTitle.textContent = '編輯地址';
        document.getElementById('address-id').value = addressToEdit.id;
        document.getElementById('recipient_name').value = addressToEdit.recipient_name;
        document.getElementById('alias').value = addressToEdit.alias || '';
        document.getElementById('phone_number').value = addressToEdit.phone_number;
        document.getElementById('tel_number').value = addressToEdit.tel_number || '';
        document.getElementById('street_address').value = addressToEdit.street_address;
        if (addressToEdit.city) {
            citySelector.value = addressToEdit.city;
            updateDistrictSelector();
            if (addressToEdit.district) {
                districtSelector.value = addressToEdit.district;
                updatePostalCode();
            }
        }
    } else {
        formTitle.textContent = '新增新地址';
        document.getElementById('address-id').value = '';
    }
}

function hideForm() {
    if (formContainer) formContainer.classList.add('hidden');
    if (addNewAddressBtn) addNewAddressBtn.classList.remove('hidden');
    if (addressForm) addressForm.reset();
}

async function handleFormSubmit(event) {
    event.preventDefault();
    setFormSubmitting(addressForm, true, '儲存地址');

    const addressId = document.getElementById('address-id').value;
    const formData = { 
        user_id: currentUser.id, 
        recipient_name: document.getElementById('recipient_name').value, 
        alias: document.getElementById('alias').value, 
        phone_number: document.getElementById('phone_number').value, 
        tel_number: document.getElementById('tel_number').value, 
        postal_code: postalCodeInput.value, 
        city: citySelector.value, 
        district: districtSelector.value, 
        street_address: document.getElementById('street_address').value 
    };

    const phoneRegex = /^09\d{8}$/;
    if (!phoneRegex.test(formData.phone_number)) {
        showNotification('請輸入有效的10位台灣手機號碼格式 (例如 0912345678)', 'error');
        setFormSubmitting(addressForm, false, '儲存地址');
        return;
    }
    
    try {
        const client = await supabase;
        const { error } = addressId 
            ? await client.from(TABLE_NAMES.ADDRESSES).update(formData).eq('id', addressId)
            : await client.from(TABLE_NAMES.ADDRESSES).insert(formData);

        if (error) throw error;
        
        showNotification(addressId ? '地址更新成功！' : '地址新增成功！', 'success');
        hideForm();
        await fetchAddresses();
    } catch (error) {
        console.error('儲存地址時發生錯誤:', error);
        showNotification('儲存地址失敗！請檢查所有欄位並重試。', 'error');
    } finally {
        setFormSubmitting(addressForm, false, '儲存地址');
    }
}

async function handleDeleteAddress(addressId) {
    if (!confirm('您確定要刪除這個地址嗎？')) return;
    try {
        const client = await supabase;
        const { error } = await client.from(TABLE_NAMES.ADDRESSES).delete().eq('id', addressId);
        if (error) throw error;
        showNotification('地址已成功刪除。', 'success');
        await fetchAddresses();
    } catch (error) {
        console.error('刪除地址時發生錯誤:', error);
        showNotification('刪除地址失敗！', 'error');
    }
}

async function handleSetDefaultAddress(addressId) {
    try {
        showNotification('正在更新預設地址...', 'info');
        const client = await supabase;
        const { data, error } = await client.functions.invoke('set-default-address', { body: { addressId: addressId } });
        if (error) throw error;
        if (data.error) throw new Error(data.error);
        await fetchAddresses();
        showNotification('預設地址已成功更新！', 'success');
    } catch (error) {
        console.error('設定預設地址時發生錯誤:', error);
        showNotification(`設定預設地址失敗：${error.message}`, 'error');
    }
}

function bindEvents() {
    if (addNewAddressBtn) addNewAddressBtn.addEventListener('click', () => showForm());
    if (cancelBtn) cancelBtn.addEventListener('click', hideForm);
    if (addressForm) addressForm.addEventListener('submit', handleFormSubmit);
    if (citySelector) citySelector.addEventListener('change', updateDistrictSelector);
    if (districtSelector) districtSelector.addEventListener('change', updatePostalCode);
    if (addressListContainer) {
        addressListContainer.addEventListener('click', (event) => {
            const target = event.target.closest('button');
            if (!target) return;

            const addressId = target.dataset.id;
            if (!addressId) return;

            if (target.classList.contains('edit-btn')) {
                const addressToEdit = addressesCache.find(addr => addr.id === addressId);
                if (addressToEdit) showForm(addressToEdit);
            } else if (target.classList.contains('delete-btn')) {
                handleDeleteAddress(addressId);
            } else if (target.classList.contains('set-default-btn')) {
                handleSetDefaultAddress(addressId);
            }
        });
    }
}

/**
 * 由 app.js 呼叫的主初始化函式。
 */
export async function init() {
    currentUser = await requireLogin();
    if (!currentUser) return; 

    initCitySelector();
    bindEvents();
    await fetchAddresses();
}