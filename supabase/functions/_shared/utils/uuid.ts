// ==============================================================================
// 檔案路徑: supabase/functions/_shared/utils/uuid.ts
// 版本： 1.0
// 說明： UUID v4 生成器的本地化版本。
//       此檔案旨在移除對 deno.land 的遠端網路依賴，提升函式啟動的穩定性。
//       原始碼來自 Deno Standard Library (std@0.177.0)。
// ==============================================================================

// Copyright 2018-2023 the Deno authors. All rights reserved. MIT license.
// https://github.com/denoland/deno_std/blob/0.177.0/uuid/v4.ts

const UUID_V4_REGEXP = new RegExp(
  "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
  "i",
);

/**
 * 根據 RFC 4122 section 4.4 演算法生成一個 UUID v4。
 */
export function v4() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 1

  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return [
    hex.substring(0, 8),
    hex.substring(8, 12),
    hex.substring(12, 16),
    hex.substring(16, 20),
    hex.substring(20, 32),
  ].join("-");
}