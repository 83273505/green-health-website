// ==============================================================================
// 檔案路徑: tcatshipment-panel/js/constants.js
// 版本: v1.1 - 功能擴充版
// ------------------------------------------------------------------------------
// 【此為完整檔案，可直接覆蓋】
// ==============================================================================

/**
 * @file T-cat Shipment Panel Constants (黑貓託運單儀表板 - 常數模組)
 * @description 集中管理黑貓託運單儀表板應用程式的所有常數，
 *              特別是後端 Edge Function 的名稱。
 * @version v1.1
 * 
 * @update v1.1 - [FEATURE] 新增貨態查詢與託運單下載的函式名稱。
 */

/**
 * Edge Function 的名稱常數。
 * 統一管理所有會從此前端模組呼叫的後端函式名稱。
 * 這樣做可以避免在程式碼中直接使用字串（魔法字串），
 * 提升程式碼的可讀性與可維護性。
 */
export const FUNCTION_NAMES = {
    CREATE_TCAT_SHIPMENT: 'create-tcat-shipment',
    GET_TCAT_SHIPMENT_STATUS: 'get-tcat-shipment-status',
    DOWNLOAD_TCAT_SHIPMENT: 'download-tcat-shipment',
};

// 未來可視需求擴充其他類型的常數，例如 TABLE_NAMES 或 ROUTES 等。