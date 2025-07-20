// 檔案路徑: GreenHealth-Auth-Module/js/address.js

import { supabase } from './supabaseClient.js';
import { requireLogin } from './session.js';
import { TABLE_NAMES } from './constants.js';
// 【新增】引入我們的郵遞區號資料
import { taiwanZipcodes } from './taiwan_zipcodes.js';

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

// 【新增】獲取下拉選單相關元素
const citySelector = document.getElementById('city-selector');
const districtSelector = document.getElementById('district-selector');
const postalCodeDisplay = document.getElementById('postal-code-display');
const postalCodeInput = document.getElementById('postal-code-input');


// --- 郵遞區號聯動邏輯 ---

/**
 * 初始化縣市下拉選單
 */
function initCitySelector() {
    const cities = Object.keys(taiwanZipcodes);
    cities.forEach(city => {
        const option = new Option(city, city);
        citySelector.add(option);
    });
}

/**
 * 根據選擇的縣市，更新鄉鎮市區下拉選單
 */
function updateDistrictSelector() {
    const selectedCity = citySelector.value;
    districtSelector.innerHTML = '<option value="">請選擇鄉鎮市區</option>'; // 重置
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

/**
 * 根據選擇的鄉鎮市區，更新郵遞區號
 */
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


// --- 核心 CRUD 函式 (部分有修改) ---

async function fetchAddresses() {
    // ... 此函式內容不變 ...
    loadingIndicator.classList.remove('hidden');
    addressListContainer.classList.add('hidden');

    const { data, error } = await supabase
        .from(TABLE_NAMES.ADDRESSES)
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching addresses:', error);
        loadingIndicator.textContent = '讀取地址失敗，請稍後再試。';
        return;
    }

    addressesCache = data;
    renderAddressList();
    
    loadingIndicator.classList.add('hidden');
    addressListContainer.classList.remove('hidden');
}

function renderAddressList() {
    // ... 此函式內容不變 ...
    addressListContainer.innerHTML = '';
    if (addressesCache.length === 0) {
        addressListContainer.innerHTML = '<p>您尚未新增任何收貨地址。</p>';
        return;
    }

    addressesCache.forEach(addr => {
        const item = document.createElement('div');
        item.className = 'address-item';
        if (addr.is_default) {
            item.classList.add('default');
        }
        item.innerHTML = `
            <p><strong>${addr.recipient_name}</strong> ${addr.is_default ? '<span style="color: #4CAF50; font-weight: bold;">(預設)</span>' : ''}</p>
            <p>${addr.phone_number}</p>
            <p>${addr.postal_code} ${addr.city || ''} ${addr.district || ''}</p>
            <p>${addr.street_address || ''}</p>
            <div class="actions">
                <button data-id="${addr.id}" class="edit-btn">編輯</button>
                <button data-id="${addr.id}" class="delete-btn">刪除</button>
                ${!addr.is_default ? `<button data-id="${addr.id}" class="set-default-btn">設為預設</button>` : ''}
            </div>
        `;
        addressListContainer.appendChild(item);
    });
}

/**
 * @param {object | null} addressToEdit 
 */
function showForm(addressToEdit = null) {
    // ... 此函式內容有修改 ...
    formContainer.classList.remove('hidden');
    addNewAddressBtn.classList.add('hidden');
    addressForm.reset();
    
    // 重置下拉選單
    citySelector.value = '';
    updateDistrictSelector();

    if (addressToEdit) {
        formTitle.textContent = '編輯地址';
        document.getElementById('address-id').value = addressToEdit.id;
        document.getElementById('recipient_name').value = addressToEdit.recipient_name;
        document.getElementById('phone_number').value = addressToEdit.phone_number;
        document.getElementById('street_address').value = addressToEdit.street_address;
        
        // 【修改】為下拉選單設定儲存的值
        if (addressToEdit.city) {
            citySelector.value = addressToEdit.city;
            updateDistrictSelector(); // 觸發更新區域
            if (addressToEdit.district) {
                districtSelector.value = addressToEdit.district;
                updatePostalCode(); // 觸發更新郵遞區號
            }
        }

    } else {
        formTitle.textContent = '新增新地址';
        document.getElementById('address-id').value = '';
    }
}

function hideForm() {
    // ... 此函式內容不變 ...
    formContainer.classList.add('hidden');
    addNewAddressBtn.classList.remove('hidden');
    addressForm.reset();
}

/**
 * @param {Event} event
 */
async function handleFormSubmit(event) {
    // ... 此函式內容有修改 ...
    event.preventDefault();
    const addressId = document.getElementById('address-id').value;
    
    // 【修改】從下拉選單和新的 input 獲取地址資訊
    const formData = {
        user_id: currentUser.id,
        recipient_name: document.getElementById('recipient_name').value,
        phone_number: document.getElementById('phone_number').value,
        postal_code: postalCodeInput.value,
        city: citySelector.value,
        district: districtSelector.value,
        street_address: document.getElementById('street_address').value,
    };

    let error;
    if (addressId) {
        const { error: updateError } = await supabase
            .from(TABLE_NAMES.ADDRESSES)
            .update(formData)
            .eq('id', addressId);
        error = updateError;
    } else {
        const { error: insertError } = await supabase
            .from(TABLE_NAMES.ADDRESSES)
            .insert(formData);
        error = insertError;
    }

    if (error) {
        console.error('Error saving address:', error);
        alert('儲存地址失敗！');
    } else {
        hideForm();
        await fetchAddresses();
    }
}

async function handleDeleteAddress(addressId) {
    // ... 此函式內容不變 ...
    if (!confirm('您確定要刪除這個地址嗎？')) return;

    const { error } = await supabase
        .from(TABLE_NAMES.ADDRESSES)
        .delete()
        .eq('id', addressId);

    if (error) {
        console.error('Error deleting address:', error);
        alert('刪除地址失敗！');
    } else {
        await fetchAddresses();
    }
}

async function handleSetDefaultAddress(addressId) {
    // ... 此函式內容不變 ...
    const { error: clearError } = await supabase
        .from(TABLE_NAMES.ADDRESSES)
        .update({ is_default: false })
        .eq('user_id', currentUser.id);

    if (clearError) {
        console.error('Error clearing default address:', clearError);
        alert('設定預設地址失敗！ (step 1)');
        return;
    }

    const { error: setError } = await supabase
        .from(TABLE_NAMES.ADDRESSES)
        .update({ is_default: true })
        .eq('id', addressId);

    if (setError) {
        console.error('Error setting new default address:', setError);
        alert('設定預設地址失敗！ (step 2)');
    } else {
        await fetchAddresses();
    }
}


// --- 事件綁定與初始化 ---

function bindEvents() {
    // ... 此函式內容有新增 ...
    addNewAddressBtn.addEventListener('click', () => showForm());
    cancelBtn.addEventListener('click', hideForm);
    addressForm.addEventListener('submit', handleFormSubmit);

    // 【新增】為下拉選單綁定 change 事件
    citySelector.addEventListener('change', updateDistrictSelector);
    districtSelector.addEventListener('change', updatePostalCode);

    addressListContainer.addEventListener('click', (event) => {
        const target = event.target;
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

/**
 * 頁面初始化函式
 */
export async function init() {
    currentUser = await requireLogin();
    if (!currentUser) return;

    initCitySelector(); // 【新增】初始化縣市選單
    bindEvents();
    await fetchAddresses();
}