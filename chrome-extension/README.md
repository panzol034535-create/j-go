# J-GO Chrome Extension

Manifest V3 + TypeScript extension for importing ZOZOTOWN products into J-GO.

## Features

- Shows **匯入 J-GO** button on `zozo.jp` product pages (`/goods/`)
- Reads from the current page:
  - 商品名稱
  - 品牌
  - 價格
  - 商品介紹
  - 主圖
  - colors / sizes（若頁面可解析）
- POST to `{API_BASE_URL}/api/import-product`
- Success toast: **商品已建立為 Draft**

## Setup

```bash
cd chrome-extension
npm install
npm run build
```

## Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `chrome-extension` folder

## Configure API URL

Default: `http://localhost:3000`

Change it in:

- Extension popup → **開啟設定**
- Or `chrome-extension/options.html`

Production example:

```text
https://j-go-xd5a.vercel.app
```

## Development

```bash
npm run watch
```

After changing source files, click **Reload** on the extension in `chrome://extensions`.

## Notes

- The extension does **not** modify the J-GO website source code.
- Ensure your J-GO dev server is running before importing locally.
- Import uses the same `/api/import-product` endpoint as the admin page.
