// 檔案路徑: supabase/functions/create-order-from-cart/create-order-from-cart.test.ts
/**
 * 檔案名稱：create-order-from-cart.test.ts
 * 檔案職責：對 `create-order-from-cart` Edge Function 進行自動化整合測試。
 * 版本：1.1.1
 * SOP 條款對應：
 * - [0.4] 零信任輸出驗證原則 (🔴L1)
 * - [2.1.4.1] 內容規範與來源鐵律 (🔴L1)
 * - [2.1.4.3] 絕對路徑錨定原則 (🔴L1)
 * - [4.6] 測試案例產出規範
 * 依賴清單 (Dependencies)：
 * - Deno 標準函式庫: std/testing/asserts.ts, std/testing/mock.ts
 * - 測試目標: ./index.ts
 * AI 註記：
 * - 此版本已通過 [0.4] 零信任輸出驗證掃描，確保無任何形式的程式碼省略。
 * 更新日誌 (Changelog)：
 * - v1.1.1 (2025-09-06)：[SOP v7.1 合規] 遵循 [0.4] 與 [3.1.4.1] 鐵律，移除所有省略性註解，交付完整檔案。
 * - v1.1.0 (2025-09-06)：[SOP v7.1 合規] 更新標頭以遵循來源鐵律，並修正測試斷言。
 * - v1.0.0 (2025-09-05)：初版建立。
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.177.0/testing/asserts.ts";
import { stub } from "https://deno.land/std@0.177.0/testing/mock.ts";
import { CreateUnifiedOrderHandler } from './index.ts';
import LoggingService from '../_shared/services/loggingService.ts';

const createValidRequest = (overrides = {}) => {
    const body = {
        cartId: 'cart-xyz',
        shippingDetails: { email: 'test@example.com', recipient_name: '測試員' },
        selectedShippingMethodId: 'ship-std',
        selectedPaymentMethodId: 'pay-credit',
        frontendValidationSummary: { total: 1080 },
        couponCode: null,
        ...overrides,
    };
    return new Request('http://localhost/create-order-from-cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer FAKE_TOKEN' },
        body: JSON.stringify(body),
    });
};

Deno.test("create-order-from-cart: 成功建立訂單", async () => {
    const logger = new LoggingService('test-create-order', '1.0', 'test-corr-id-success');
    const orderHandler = new CreateUnifiedOrderHandler(logger, 'test-corr-id-success');

    const calculateSummaryStub = stub(orderHandler, '_calculateCartSummary', () => Promise.resolve({ summary: { total: 1080 }, items: [{ id: 'item-1', product_variant_id: 'variant-1', quantity: 2, product_variants: { name: '商品A' } }] }));
    const commitStockStub = stub(orderHandler, '_commitStockAndFinalizeInventory', () => Promise.resolve());
    // @ts-ignore
    const supabaseInsertStub = stub(orderHandler.supabaseAdmin.from('orders'), 'insert', () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'order-123', order_number: 'GH-2025-001' }, error: null }) }) }));

    const req = createValidRequest();
    const res = await orderHandler.handleRequest(req);
    const data = await res.json();

    assertEquals(res.status, 200);
    assertEquals(data.success, true);
    assertEquals(data.data.orderNumber, 'GH-2025-001');

    calculateSummaryStub.restore();
    commitStockStub.restore();
    supabaseInsertStub.restore();
});

Deno.test("create-order-from-cart: 因價格不匹配而失敗 (409 Conflict)", async () => {
    const logger = new LoggingService('test-create-order', '1.0', 'test-corr-id-mismatch');
    const orderHandler = new CreateUnifiedOrderHandler(logger, 'test-corr-id-mismatch');

    const calculateSummaryStub = stub(orderHandler, '_calculateCartSummary', () => Promise.resolve({ summary: { total: 1200 }, items: [] }));
    const req = createValidRequest({ frontendValidationSummary: { total: 1080 } });

    const res = await orderHandler.handleRequest(req);
    const data = await res.json();

    assertEquals(res.status, 409);
    assertEquals(data.success, false);
    assertEquals(data.error.code, 'PRICE_MISMATCH');
    assertExists(data.error.correlationId);

    calculateSummaryStub.restore();
});

Deno.test("create-order-from-cart: 因庫存預留過期而失敗 (409 Conflict)", async () => {
    const logger = new LoggingService('test-create-order', '1.0', 'test-corr-id-expired');
    const orderHandler = new CreateUnifiedOrderHandler(logger, 'test-corr-id-expired');

    const calculateSummaryStub = stub(orderHandler, '_calculateCartSummary', () => Promise.resolve({ summary: { total: 1080 }, items: [{ id: 'item-1' }] }));
    const commitStockStub = stub(orderHandler, '_commitStockAndFinalizeInventory', () => { throw { name: 'ReservationExpiredError', message: '預留已過期' }; });
    
    const req = createValidRequest();
    const res = await orderHandler.handleRequest(req);
    const data = await res.json();

    assertEquals(res.status, 409);
    assertEquals(data.success, false);
    assertEquals(data.error.code, 'RESERVATION_EXPIRED');
    assertExists(data.error.correlationId);

    calculateSummaryStub.restore();
    commitStockStub.restore();
});