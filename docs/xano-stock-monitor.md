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

### GET stock-monitor-products

回傳 `source_url` 不為空的商品，供 `/admin/stock-monitor` 列表使用。

環境變數：`XANO_STOCK_MONITOR_PRODUCTS_URL`

### POST update-product-stock

Body：

```json
{
  "product_id": 1,
  "current_jpy_price": 8900,
  "jpy_price": 8900,
  "price": 3004,
  "last_price_jpy": 8900,
  "last_stock_status": "in_stock",
  "check_status": "ok",
  "last_checked_at": "2026-06-12T10:00:00.000Z"
}
```

- `current_jpy_price`：ZOZO 同步庫存時抓到的目前日幣售價（選填；無效時只更新庫存）
- `price`：由 Xano `settings.jpy_rate × settings.profit_rate` 計算後四捨五入的台幣售價
- 此 endpoint 只應更新價格／監控相關欄位，不要覆寫 `name_zh`、`images`、`description` 等

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

## Check Now 第一版邏輯

| source_site | 結果 |
|-------------|------|
| `zozo` | `check_status = requires_browser_check`（不爬蟲） |
| `magaseek` / `beams` / `united-arrows` | mock check |
| `freaks-store` | mock check |
| `unknown` | error |
