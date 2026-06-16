import { isSourceSite, type SourceSite } from "@/lib/products/source-site";
import type { StockMonitorProduct } from "@/lib/types/stock-monitor";

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function toStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return String(value);
}

export function normalizeStockMonitorProduct(raw: Record<string, unknown>): StockMonitorProduct | null {
  const id = Number(raw.id);
  if (!id || Number.isNaN(id)) {
    return null;
  }

  const sourceSiteRaw = String(raw.source_site || "unknown");
  const source_site: SourceSite = isSourceSite(sourceSiteRaw) ? sourceSiteRaw : "unknown";

  return {
    id,
    name: String(raw.name || raw.name_zh || raw.name_jp || ""),
    name_jp: toStringOrNull(raw.name_jp) ?? undefined,
    name_zh: toStringOrNull(raw.name_zh) ?? undefined,
    brand: String(raw.brand || ""),
    jpy_price: toNumber(raw.jpy_price) ?? 0,
    main_image: toStringOrNull(raw.main_image) ?? undefined,
    image: toStringOrNull(raw.image) ?? undefined,
    source_url: String(raw.source_url || ""),
    source_site,
    last_checked_at: toStringOrNull(raw.last_checked_at),
    last_price_jpy: toNumber(raw.last_price_jpy),
    last_stock_status: toStringOrNull(raw.last_stock_status),
    check_status: toStringOrNull(raw.check_status),
  };
}

export function normalizeStockMonitorProducts(data: unknown): StockMonitorProduct[] {
  const list = Array.isArray(data)
    ? data
    : Array.isArray((data as { products?: unknown[] })?.products)
      ? (data as { products: unknown[] }).products
      : [];

  return list
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => normalizeStockMonitorProduct(item))
    .filter((item): item is StockMonitorProduct => item !== null);
}

export function getCheckSuccessMessage(checkStatus: string | null | undefined): string {
  switch (checkStatus) {
    case "requires_browser_check":
      return "檢查完成：需瀏覽器檢查（已建立紀錄）";
    case "mock":
      return "檢查完成：Mock 檢查（已建立紀錄）";
    case "ok":
      return "檢查完成：狀態正常";
    case "error":
      return "檢查完成：來源無法識別";
    default:
      return "檢查完成，已更新監控資料";
  }
}
