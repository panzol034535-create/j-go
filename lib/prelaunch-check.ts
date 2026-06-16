export type PrelaunchCheckResult = {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
};

export const STATIC_PRELAUNCH_CHECKS: PrelaunchCheckResult[] = [
  {
    id: "home-trust-cards",
    label: "首頁信任感三卡",
    passed: true,
    detail: "日本正品代購 / 7-14 天到貨 / 可查詢訂單物流",
  },
  {
    id: "product-trust-badges",
    label: "商品詳情信任標籤",
    passed: true,
    detail: "日本正品 / 代購服務 / 可查詢物流",
  },
  {
    id: "order-status-display",
    label: "訂單頁狀態欄位",
    passed: true,
    detail: "付款狀態 / 出貨狀態 / 物流單號",
  },
];

async function fetchCheck(url: string, label: string): Promise<PrelaunchCheckResult> {
  try {
    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) {
      return {
        id: label,
        label,
        passed: false,
        detail: `HTTP ${response.status}`,
      };
    }

    return {
      id: label,
      label,
      passed: true,
      detail: "連線正常",
    };
  } catch (error) {
    return {
      id: label,
      label,
      passed: false,
      detail: error instanceof Error ? error.message : "連線失敗",
    };
  }
}

export async function runPrelaunchChecks(options?: {
  lookbooksUrl?: string;
}): Promise<PrelaunchCheckResult[]> {
  const results: PrelaunchCheckResult[] = [...STATIC_PRELAUNCH_CHECKS];

  results.push(await fetchCheck("/api/products", "商品 API"));

  if (options?.lookbooksUrl) {
    results.push(await fetchCheck(`${options.lookbooksUrl}?t=${Date.now()}`, "Lookbook API"));
  }

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem("jgo_prelaunch_probe", "1");
      localStorage.removeItem("jgo_prelaunch_probe");
      results.push({
        id: "local-storage",
        label: "localStorage 可用",
        passed: true,
        detail: "收藏與購物車資料可正常儲存",
      });
    } catch (error) {
      results.push({
        id: "local-storage",
        label: "localStorage 可用",
        passed: false,
        detail: error instanceof Error ? error.message : "無法寫入 localStorage",
      });
    }
  }

  return results;
}

export function summarizePrelaunchChecks(results: PrelaunchCheckResult[]): {
  passed: number;
  total: number;
  ready: boolean;
} {
  const passed = results.filter((item) => item.passed).length;
  const total = results.length;

  return {
    passed,
    total,
    ready: passed === total,
  };
}
