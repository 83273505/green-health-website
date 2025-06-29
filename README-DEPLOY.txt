# Green Health Website - 部署與維護指南

本文件旨在說明此專案的部署規則與維護注意事項，以確保網站的穩定性、安全性與長期可維護性。

## 1. 路徑規則

- **內部資源**: 所有指向網站內部資源（如圖片、CSS、JS）的連結，**必須**使用根相對路徑（以 `/` 開頭）。
  - **正確範例**: `/images/logo.png`
  - **錯誤範例**: `https://www.greenhealthtw.com.tw/images/logo.png` 或 `../images/logo.png`

- **外部連結**: 指向 Facebook, Shopee 等外部網站的連結，**必須**使用完整的絕對路徑（以 `https://` 開頭）。

## 2. 環境感知邏輯

`script.js` 中包含一套環境感知系統，它會根據當前網域自動為 `<body>` 標籤添加 `data-domain` 屬性。此屬性的值可能為 `production`, `staging`, `local`, 或 `other`。

- 在**非正式環境**下 (`staging`, `local`, `other`)，頁面頂部會出現一個**視覺警告橫幅**，以防止誤操作。
- 在**正式環境** (`production`) 下，開發者工具的 Console 中會顯示一條**綠色的保護提示訊息**，提醒開發人員當前正在正式環境中。

## 3. SEO 與社群分享 (重要！)

為了確保搜尋引擎優化 (SEO) 與社群平台（如 Facebook, Line）分享功能的正常運作，以下標籤中的網址**必須手動維護**為完整的絕對路徑：

- `<link rel="canonical" href="...">`
- `<meta property="og:url" content="...">`
- `<meta property="og:image" content="...">`
- 在 `<script type="application/ld+json">` 結構化資料內的 `"url"` 和 `"logo"` 欄位。

---
*最後更新：2025-06-29*