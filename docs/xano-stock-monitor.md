# Xano Stock Monitor Setup

## products table — 新增欄位

| 欄位 | 類型 | 說明 |
|------|------|------|
| `source_url` | text | 商品來源網址 |
| `source_site` | text | `zozo` / `magaseek` / `beams` / `united-arrows` / `freaks-store` / `unknown` |
| `last_checked_at` | datetime | 上次檢查時間 |
| `last_price_jpy` | integer | 上次檢查到的日圓價格 |
| `last_stock_status` | text | `in_stock` / `out_of_stock` / `unknown` |
| `check_status` | text | `pending` / `ok` / `requires_browser_check` / `mock` / `error` |

匯入商品時 J-GO 會寫入：

- `source_url`
- `source_site`
- `check_status = pending`

## product_stock_checks table — 新建

| 欄位 | 類型 | 說明 |
|------|------|------|
| `id` | integer (PK) | 自動遞增 |
| `product_id` | integer | 關聯 products.id |
| `source_url` | text | 檢查時的來源網址 |
| `source_site` | text | 來源網站 |
| `checked_at` | datetime | 檢查時間 |
| `price_jpy` | integer | 檢查到的價格 |
| `stock_status` | text | 庫存狀態 |
| `raw_result` | text | JSON 字串，原始檢查結果 |
| `status` | text | 紀錄狀態，例如 `requires_browser_check` / `mock` |

## 建議 Xano API

### POST update-product-status（批次同步自動下架用）

若 `update-product-stock` 尚未支援 `status` 欄位，可另建此 endpoint。J-GO 會先嘗試 `XANO_UPDATE_PRODUCT_STATUS_URL`，失敗時 fallback 到 `XANO_UPDATE_PRODUCT_STOCK_URL`。

Body：

```json
{
  "product_id": 1,
  "status": "draft",
  "check_status": "source_missing",
  "last_stock_status": "source_missing"
}
```

`check_status` / `last_stock_status` 可能值：

- `source_missing` — 來源商品不存在
- `discontinued` — 來源已下架
- `all_out_of_stock` — 全部 variant 無庫存

環境變數：`XANO_UPDATE_PRODUCT_STATUS_URL`

### GET stock-monitor-products

回傳 `source_url` 不為空的商品，供 `/admin/stock-monitor` 列表使用。

環境變數：`XANO_STOCK_MONITOR_PRODUCTS_URL`

### POST update-product-stock

此 endpoint 會被兩種流程呼叫：

1. **ZOZO 擴充功能同步庫存**（`/api/admin-sync-product-stock`）
2. **Stock Monitor Check Now**（`/api/stock-monitor/check`）

請在 Xano 以「**只更新 request body 有帶的欄位**」方式實作，**不要**把缺少的 `price` / `jpy_price` 自動設成 `0`。

#### A. 有有效日幣價格（`current_jpy_price > 0`）

J-GO 才會計算台幣售價並送出以下欄位：

```json
{
  "product_id": 1,
  "current_jpy_price": 8900,
  "jpy_price": 8900,
  "price": 3004,
  "last_price_jpy": 8900,
  "last_stock_status": "in_stock",
  "check_status": "ok"
}
```

- `current_jpy_price`：ZOZO 同步庫存時從 JSON-LD 或購買區塊解析（選填；無效時 **不送任何價格欄位**）
- `jpy_price` / `last_price_jpy`：與 `current_jpy_price` 相同
- `price`：由 J-GO 以 `settings.jpy_rate × settings.profit_rate` 計算後四捨五入；若換算結果 `<= 0` 則 **整包價格欄位都不送**
- `XANO_SETTINGS_URL` 讀不到時，J-GO 使用預設 `0.25 × 1.35`，但仍需有效 `current_jpy_price` 才更新價格

#### B. 只同步庫存（無有效 `current_jpy_price`）

J-GO 只更新 variant 庫存 + 商品層監控狀態，**payload 不含任何價格欄位**：

```json
{
  "product_id": 1,
  "last_stock_status": "in_stock",
  "check_status": "ok"
}
```

#### C. Stock Monitor Check Now（無有效 `price_jpy`）

`/api/stock-monitor/check` 仍會寫入 `create-stock-check`（`price_jpy` 可為 `null`），但 `update-product-stock` 只送：

```json
{
  "product_id": 1,
  "last_checked_at": "2026-06-12T10:00:00.000Z",
  "last_stock_status": "unknown",
  "check_status": "requires_browser_check"
}
```

僅當 `price_jpy > 0` 時才額外送 `last_price_jpy`。

#### Xano 設定建議（避免 price 被寫成 0）

- API stack 使用 **Edit Record → 只 map input 有值的欄位**，不要用「Set `price` = `input.price` 或 0」這類 fallback
- 若使用 Function 組 payload，對 `price` / `jpy_price` / `last_price_jpy` 做 `if ($input.price > 0)` 才寫入
- 缺少價格欄位時，**保留資料庫原有售價**，不要清空或歸零

此 endpoint 只應更新價格／監控相關欄位，不要覆寫 `name_zh`、`images`、`description` 等

環境變數：`XANO_UPDATE_PRODUCT_STOCK_URL`

### GET settings（同步售價用）

J-GO 同步庫存時會讀取：

- `jpy_rate`
- `profit_rate`

環境變數：`XANO_SETTINGS_URL`（未設定時使用 import 預設 0.25 × 1.35）

### POST create-stock-check

Body：

```json
{
  "product_id": 1,
  "source_url": "https://zozo.jp/...",
  "source_site": "zozo",
  "checked_at": "2026-06-12T10:00:00.000Z",
  "price_jpy": 8900,
  "stock_status": "unknown",
  "raw_result": "{\"message\":\"...\"}",
  "status": "requires_browser_check"
}
```

環境變數：`XANO_CREATE_STOCK_CHECK_URL`

- `create-stock-check` 的 `price_jpy` 可為 `null`（如 ZOZO 第一版無法伺服器爬價），僅作檢查紀錄
- 同一輪 Check Now 呼叫 `update-product-stock` 時，**僅在 `price_jpy > 0` 才送 `last_price_jpy`**；否則只更新 `last_checked_at` / `last_stock_status` / `check_status`，避免 `null` 覆蓋商品現有價格

## Check Now 第一版邏輯

| source_site | 結果 |
|-------------|------|
| `zozo` | `check_status = requires_browser_check`（不爬蟲） |
| `magaseek` / `beams` / `united-arrows` | mock check |
| `freaks-store` | mock check |
| `unknown` | error |
