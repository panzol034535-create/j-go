import fs from "node:fs";
import path from "node:path";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const content = fs.readFileSync(filePath, "utf8");
  const env = {};

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

function isSet(env, key) {
  return Boolean(env[key]?.trim());
}

const root = process.cwd();
const env = {
  ...loadEnvFile(path.join(root, ".env")),
  ...loadEnvFile(path.join(root, ".env.local")),
  ...process.env,
};

/** @type {{ label: string; level: "fail" | "warn"; detail: string; passed: boolean }[]} */
const checks = [
  // Clerk
  {
    label: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    level: "fail",
    passed: isSet(env, "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"),
    detail: isSet(env, "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY") ? "已設定" : "未設定",
  },
  {
    label: "CLERK_SECRET_KEY",
    level: "fail",
    passed: isSet(env, "CLERK_SECRET_KEY"),
    detail: isSet(env, "CLERK_SECRET_KEY") ? "已設定" : "未設定",
  },

  // Xano catalog
  {
    label: "XANO_PRODUCTS_URL",
    level: "warn",
    passed: isSet(env, "XANO_PRODUCTS_URL"),
    detail: isSet(env, "XANO_PRODUCTS_URL")
      ? "已設定"
      : "未設定（/api/products 等會使用程式內 DEFAULT URL）",
  },
  {
    label: "XANO_LIST_VARIANTS_URL",
    level: "warn",
    passed: isSet(env, "XANO_LIST_VARIANTS_URL"),
    detail: isSet(env, "XANO_LIST_VARIANTS_URL")
      ? "已設定"
      : "未設定（由 XANO_PRODUCTS_URL 推導 /variants）",
  },
  {
    label: "XANO_LOOKBOOKS_URL",
    level: "fail",
    passed: isSet(env, "XANO_LOOKBOOKS_URL"),
    detail: isSet(env, "XANO_LOOKBOOKS_URL")
      ? "已設定"
      : "未設定（GET /api/lookbooks 會失敗；SSR 有 DEFAULT 但 API route 無）",
  },

  // Import / publish
  {
    label: "XANO_IMPORT_PRODUCT_URL",
    level: "fail",
    passed: isSet(env, "XANO_IMPORT_PRODUCT_URL"),
    detail: isSet(env, "XANO_IMPORT_PRODUCT_URL") ? "已設定" : "未設定（/api/import-product 無法使用）",
  },
  {
    label: "XANO_CREATE_VARIANT_URL",
    level: "fail",
    passed: isSet(env, "XANO_CREATE_VARIANT_URL"),
    detail: isSet(env, "XANO_CREATE_VARIANT_URL") ? "已設定" : "未設定（/api/import-product 無法使用）",
  },
  {
    label: "XANO_DRAFT_PRODUCTS_URL",
    level: "fail",
    passed: isSet(env, "XANO_DRAFT_PRODUCTS_URL"),
    detail: isSet(env, "XANO_DRAFT_PRODUCTS_URL") ? "已設定" : "未設定（/api/draft-products 無法使用）",
  },
  {
    label: "XANO_PUBLISH_PRODUCT_URL",
    level: "fail",
    passed: isSet(env, "XANO_PUBLISH_PRODUCT_URL"),
    detail: isSet(env, "XANO_PUBLISH_PRODUCT_URL") ? "已設定" : "未設定（/api/publish-product 無法使用）",
  },

  // Product / lookbook updates
  {
    label: "XANO_UPDATE_PRODUCT_GENDER_URL",
    level: "warn",
    passed: isSet(env, "XANO_UPDATE_PRODUCT_GENDER_URL"),
    detail: isSet(env, "XANO_UPDATE_PRODUCT_GENDER_URL")
      ? "已設定"
      : "未設定（/api/products/gender 使用程式內 DEFAULT URL）",
  },
  {
    label: "XANO_UPDATE_PRODUCT_SIZE_TABLE_URL",
    level: "warn",
    passed: isSet(env, "XANO_UPDATE_PRODUCT_SIZE_TABLE_URL"),
    detail: isSet(env, "XANO_UPDATE_PRODUCT_SIZE_TABLE_URL")
      ? "已設定"
      : "未設定（/api/products/size-table 使用程式內 DEFAULT URL）",
  },
  {
    label: "XANO_UPDATE_PRODUCT_FAVORITE_COUNT_URL",
    level: "warn",
    passed: isSet(env, "XANO_UPDATE_PRODUCT_FAVORITE_COUNT_URL"),
    detail: isSet(env, "XANO_UPDATE_PRODUCT_FAVORITE_COUNT_URL")
      ? "已設定"
      : "未設定（/api/products/favorite-count 使用程式內 DEFAULT URL）",
  },
  {
    label: "XANO_UPDATE_LOOKBOOK_FAVORITE_COUNT_URL",
    level: "warn",
    passed: isSet(env, "XANO_UPDATE_LOOKBOOK_FAVORITE_COUNT_URL"),
    detail: isSet(env, "XANO_UPDATE_LOOKBOOK_FAVORITE_COUNT_URL")
      ? "已設定"
      : "未設定（/api/lookbooks/favorite-count 使用程式內 DEFAULT URL）",
  },
  {
    label: "XANO_VALIDATE_COUPON_URL",
    level: "warn",
    passed: isSet(env, "XANO_VALIDATE_COUPON_URL"),
    detail: isSet(env, "XANO_VALIDATE_COUPON_URL")
      ? "已設定"
      : "未設定（/api/validate-coupon 使用程式內 DEFAULT URL）",
  },

  // Stock
  {
    label: "XANO_UPDATE_VARIANT_STOCK_URL",
    level: "warn",
    passed: isSet(env, "XANO_UPDATE_VARIANT_STOCK_URL"),
    detail: isSet(env, "XANO_UPDATE_VARIANT_STOCK_URL")
      ? "已設定"
      : "未設定（/api/admin-sync-product-stock 使用程式內 DEFAULT URL）",
  },
  {
    label: "XANO_UPDATE_PRODUCT_STOCK_URL",
    level: "warn",
    passed: isSet(env, "XANO_UPDATE_PRODUCT_STOCK_URL"),
    detail: isSet(env, "XANO_UPDATE_PRODUCT_STOCK_URL")
      ? "已設定"
      : "未設定（admin-sync 有 DEFAULT；stock-monitor/check 仍須設定）",
  },
  {
    label: "XANO_STOCK_MONITOR_PRODUCTS_URL",
    level: "fail",
    passed: isSet(env, "XANO_STOCK_MONITOR_PRODUCTS_URL"),
    detail: isSet(env, "XANO_STOCK_MONITOR_PRODUCTS_URL")
      ? "已設定"
      : "未設定（/api/stock-monitor 無法使用）",
  },
  {
    label: "XANO_CREATE_STOCK_CHECK_URL",
    level: "fail",
    passed: isSet(env, "XANO_CREATE_STOCK_CHECK_URL"),
    detail: isSet(env, "XANO_CREATE_STOCK_CHECK_URL")
      ? "已設定"
      : "未設定（/api/stock-monitor/check 無法使用）",
  },

  // Orders (server admin)
  {
    label: "XANO_UPDATE_ORDER_SHIPPING_URL",
    level: "fail",
    passed: isSet(env, "XANO_UPDATE_ORDER_SHIPPING_URL"),
    detail: isSet(env, "XANO_UPDATE_ORDER_SHIPPING_URL")
      ? "已設定"
      : "未設定（/api/admin/orders/shipping 無法更新物流）",
  },

  // Settings & rankings
  {
    label: "XANO_SETTINGS_URL",
    level: "warn",
    passed: isSet(env, "XANO_SETTINGS_URL"),
    detail: isSet(env, "XANO_SETTINGS_URL")
      ? "已設定"
      : "未設定（匯入定價使用預設 jpy_rate × profit_rate）",
  },
  {
    label: "XANO_SALES_RANKINGS_URL",
    level: "warn",
    passed: isSet(env, "XANO_SALES_RANKINGS_URL"),
    detail: isSet(env, "XANO_SALES_RANKINGS_URL")
      ? "已設定"
      : "未設定（銷售排行使用程式內 DEFAULT URL）",
  },

  // Blob / OpenAI / GA
  {
    label: "BLOB_READ_WRITE_TOKEN",
    level: "warn",
    passed: isSet(env, "BLOB_READ_WRITE_TOKEN"),
    detail: isSet(env, "BLOB_READ_WRITE_TOKEN")
      ? "已設定"
      : "未設定（後台 Lookbook 圖片上傳無法使用）",
  },
  {
    label: "OPENAI_API_KEY",
    level: "warn",
    passed: isSet(env, "OPENAI_API_KEY"),
    detail: isSet(env, "OPENAI_API_KEY") ? "已設定" : "未設定（商品匯入翻譯可能無法使用）",
  },
  {
    label: "NEXT_PUBLIC_GA_MEASUREMENT_ID",
    level: "warn",
    passed: isSet(env, "NEXT_PUBLIC_GA_MEASUREMENT_ID"),
    detail: isSet(env, "NEXT_PUBLIC_GA_MEASUREMENT_ID") ? "已設定" : "未設定（GA 事件不會送出）",
  },
];

const hardcodedClientXanoUrls = [
  "checkout (XANO_CHECKOUT_URL)",
  "add-order-item (XANO_ADD_ORDER_ITEM_URL)",
  "Get_Orders (XANO_GET_ORDERS_URL)",
  "order-items (XANO_GET_ORDER_ITEMS_URL)",
  "create-ecpay-order (XANO_CREATE_ECPAY_ORDER_URL)",
  "create-cvs-map (XANO_CREATE_CVS_MAP_URL)",
  "decrease-stock (XANO_DECREASE_STOCK_URL)",
  "lookbooks CRUD (XANO_LOOKBOOKS_URL constant in JGoApp.tsx)",
  "update-order-shipping-status (XANO_UPDATE_ORDER_SHIPPING_STATUS_URL)",
  "admin-orders (XANO_ADMIN_ORDERS_URL)",
  "admin-create-product (XANO_ADMIN_CREATE_PRODUCT_URL)",
  "admin-update-product (XANO_ADMIN_UPDATE_PRODUCT_URL)",
  "admin-delete-product (XANO_ADMIN_DELETE_PRODUCT_URL)",
  "admin-recalculate-all-products (XANO_RECALCULATE_PRODUCTS_URL)",
];

const notEnvVars = [
  "XANO_ADMIN_SYNC_PRODUCT_STOCK_URL — 不存在；請用 Next.js POST /api/admin-sync-product-stock",
  "XANO_ADMIN_ORDERS_URL — 寫死在 components/JGoApp.tsx，非 process.env",
  "XANO_GET_ORDER_ITEMS_URL — 寫死在 components/JGoApp.tsx（order-items），非 process.env",
];

console.log("J-GO 上線前檢查");
console.log("================");
console.log("");

for (const check of checks) {
  const mark = check.passed ? "PASS" : check.level === "fail" ? "FAIL" : "WARN";
  console.log(`[${mark}] ${check.label} - ${check.detail}`);
}

const failChecks = checks.filter((item) => item.level === "fail");
const warnChecks = checks.filter((item) => item.level === "warn");
const failPassed = failChecks.filter((item) => item.passed).length;
const warnPassed = warnChecks.filter((item) => item.passed).length;
const allPassed = checks.filter((item) => item.passed).length;

console.log("");
console.log(`結果：${allPassed}/${checks.length} 已設定`);
console.log(`  必要 (FAIL)：${failPassed}/${failChecks.length}`);
console.log(`  建議 (WARN)：${warnPassed}/${warnChecks.length}`);

console.log("");
console.log("寫死在 components/JGoApp.tsx 的 Xano endpoint（非 env）：");
for (const item of hardcodedClientXanoUrls) {
  console.log(`  - ${item}`);
}

console.log("");
console.log("使用者清單中但非 process.env 的項目：");
for (const item of notEnvVars) {
  console.log(`  - ${item}`);
}

if (failPassed !== failChecks.length) {
  process.exitCode = 1;
}
