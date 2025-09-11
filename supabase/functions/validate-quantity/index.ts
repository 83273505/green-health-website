-- 檔案路徑: supabase/migrations/YYYYMMDDHHMMSS_upgrade_get_stock_status_func_v2_1.sql
/**
 * 檔案名稱：YYYYMMDDHHMMSS_upgrade_get_stock_status_func_v2_1.sql
 * 檔案職責：以安全、冪等的方式，升級 `get_public_stock_status` 資料庫函式。
 * 版本：2.1 (最終除錯版)
 * AI 註記：
 * - [核心除錯]: 此版本為 v2.0 的最終修正版。在 `CREATE OR REPLACE` 指令前，
 *   新增了一行 `DROP FUNCTION IF EXISTS...`。這將安全地刪除舊版本的函式，
 *   然後再建立新版本，從而解決了因函式回傳類型變更而導致的 `ERROR: 42P13` 錯誤。
 * - [操作指示]: 此為一個完整的指令碼，可直接複製貼上執行，它將安全地覆蓋舊版本函式。
 * 更新日誌 (Changelog)：
 * - v2.1 (2025-09-09)：[BUG FIX] 新增 `DROP FUNCTION` 指令以處理函式簽名變更。
 * - v2.0 (2025-09-09)：升級函式以回傳精確庫存數量。
 */

-- 步驟 1: 安全地刪除舊版本的函式 (如果它存在的話)
DROP FUNCTION IF EXISTS public.get_public_stock_status(uuid[]);

-- 步驟 2: 建立全新版本的函式
CREATE OR REPLACE FUNCTION public.get_public_stock_status(variant_ids uuid[])
RETURNS TABLE(
    variant_id uuid,
    stock_status text,
    available_stock int
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    low_stock_threshold INT := 10; -- 低庫存的閾值，未來可在此處統一調整
BEGIN
    RETURN QUERY
    SELECT
        v.id AS variant_id,
        CASE
            WHEN v.stock <= 0 THEN 'OUT_OF_STOCK'
            WHEN v.stock <= low_stock_threshold THEN 'LOW_STOCK'
            ELSE 'IN_STOCK'
        END::text AS stock_status,
        GREATEST(0, v.stock)::int AS available_stock
    FROM
        public.product_variants AS v
    WHERE
        v.id = ANY(variant_ids);
END;
$$;

-- 步驟 3: 為新版本的函式附加註解
COMMENT ON FUNCTION public.get_public_stock_status(uuid[]) IS 'V2.1: 供前端公開、安全地批次查詢一個或多個商品規格的庫存狀態，並在有庫存時回傳精確數量供前端進行互動驗證。使用 SECURITY DEFINER 以繞過 RLS。';