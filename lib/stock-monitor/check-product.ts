import type { SourceSite } from "@/lib/products/source-site";
import type { StockCheckResult, StockMonitorProduct } from "@/lib/types/stock-monitor";

const MOCK_CHECK_SITES: SourceSite[] = ["magaseek", "beams", "united-arrows"];

export function runStockCheck(product: StockMonitorProduct): StockCheckResult {
  const sourceSite = product.source_site || "unknown";
  const currentPrice = Number(product.jpy_price) || null;

  if (sourceSite === "zozo") {
    return {
      price_jpy: product.last_price_jpy ?? currentPrice,
      stock_status: "unknown",
      check_status: "requires_browser_check",
      record_status: "requires_browser_check",
      raw_result: {
        message: "ZOZO 需要透過瀏覽器擴充功能或 Playwright 檢查，第一版不進行伺服器端爬蟲",
        source_url: product.source_url,
      },
    };
  }

  if (MOCK_CHECK_SITES.includes(sourceSite)) {
    return {
      price_jpy: currentPrice,
      stock_status: "unknown",
      check_status: "mock",
      record_status: "mock",
      raw_result: {
        message: `${sourceSite} mock check — 尚未實作真實爬蟲`,
        source_url: product.source_url,
        mocked_price_jpy: currentPrice,
      },
    };
  }

  if (sourceSite === "freaks-store") {
    return {
      price_jpy: currentPrice,
      stock_status: "unknown",
      check_status: "mock",
      record_status: "mock",
      raw_result: {
        message: "freaks-store mock check — 尚未實作真實爬蟲",
        source_url: product.source_url,
      },
    };
  }

  return {
    price_jpy: null,
    stock_status: "unknown",
    check_status: "error",
    record_status: "error",
    raw_result: {
      message: "無法識別商品來源網站",
      source_site: sourceSite,
      source_url: product.source_url,
    },
  };
}
