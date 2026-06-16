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

const root = process.cwd();
const env = {
  ...loadEnvFile(path.join(root, ".env")),
  ...loadEnvFile(path.join(root, ".env.local")),
  ...process.env,
};

const checks = [
  {
    label: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    passed: Boolean(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY),
    detail: env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? "已設定" : "未設定",
  },
  {
    label: "CLERK_SECRET_KEY",
    passed: Boolean(env.CLERK_SECRET_KEY),
    detail: env.CLERK_SECRET_KEY ? "已設定" : "未設定",
  },
  {
    label: "XANO_PRODUCTS_URL",
    passed: Boolean(env.XANO_PRODUCTS_URL),
    detail: env.XANO_PRODUCTS_URL ? "已設定" : "未設定（/api/products 會使用預設 URL）",
  },
  {
    label: "XANO_UPDATE_ORDER_SHIPPING_URL",
    passed: Boolean(env.XANO_UPDATE_ORDER_SHIPPING_URL),
    detail: env.XANO_UPDATE_ORDER_SHIPPING_URL ? "已設定" : "未設定（後台無法更新物流）",
  },
];

console.log("J-GO 上線前檢查");
console.log("================");

for (const check of checks) {
  const mark = check.passed ? "PASS" : "FAIL";
  console.log(`[${mark}] ${check.label} - ${check.detail}`);
}

const passed = checks.filter((item) => item.passed).length;
console.log("");
console.log(`結果：${passed}/${checks.length} 通過`);

if (passed !== checks.length) {
  process.exitCode = 1;
}
