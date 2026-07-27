import type { SourceSite } from "@/lib/products/source-site";

export type StockCheckStatus =
  | "pending"
  | "ok"
  | "requires_browser_check"
  | "mock"
  | "error";

export type StockStatus = "in_stock" | "out_of_stock" | "unknown";

export type StockMonitorProduct = {
  id: number;
  name: string;
  name_jp?: string;
  name_zh?: string;
  brand: string;
  jpy_price: number;
  main_image?: string;
  image?: string;
  source_url: string;
  source_site: SourceSite;
  status?: string;
  last_checked_at: string | null;
  last_price_jpy: number | null;
  last_stock_status: StockStatus | string | null;
  check_status: StockCheckStatus | string | null;
};

export type ProductStockCheck = {
  id?: number;
  product_id: number;
  source_url: string;
  source_site: SourceSite;
  checked_at: string;
  price_jpy: number | null;
  stock_status: StockStatus | string;
  raw_result: string | Record<string, unknown>;
  status: string;
};

export type StockCheckResult = {
  price_jpy: number | null;
  stock_status: StockStatus;
  check_status: StockCheckStatus;
  raw_result: Record<string, unknown>;
  record_status: string;
};
