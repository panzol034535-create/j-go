import type { VariantStock } from "./types";

export type ExtensionBulkSyncProduct = {
  id: number;
  name: string;
  source_url: string;
};

export type ExtensionBulkSyncPhase =
  | "idle"
  | "item_start"
  | "scraping"
  | "syncing"
  | "item_delay"
  | "batch_pause"
  | "item_done"
  | "completed"
  | "cancelled"
  | "paused";

export type BulkSyncResultDebug = Record<string, unknown>;

export type ExtensionBulkSyncProgress = {
  status: "idle" | "running" | "completed" | "cancelled" | "paused";
  total: number;
  completed: number;
  success: number;
  failed: number;
  unpublished: number;
  republished: number;
  uncertain: number;
  skipped: number;
  currentIndex: number;
  currentProductName: string | null;
  updatedAt: number;
  phase: ExtensionBulkSyncPhase;
  pauseReason?: string;
  message?: string;
  batchMessage?: string | null;
  results: Array<{
    product_id: number;
    name: string;
    success: boolean;
    action: string;
    reason?: string;
    message?: string;
    debug?: BulkSyncResultDebug;
  }>;
};

export type BulkSyncScrapeDebug = {
  pageTitle?: string;
  url?: string;
  stockRootFound?: boolean;
  variantRowCount?: number;
  bodyTextSample?: string;
  variantStockSample?: VariantStock[];
  sourceStatus?: string;
  waitedMs?: number;
};

export type ExtensionBulkSyncScrapePayload = {
  product_id: number;
  product_name?: string;
  source_status?:
    | "available"
    | "source_missing"
    | "discontinued"
    | "all_out_of_stock"
    | "sync_uncertain"
    | "needs_manual_review";
  access_denied?: boolean;
  variant_stock?: VariantStock[];
  current_jpy_price?: number;
  reason?: string;
  message?: string;
  debug?: BulkSyncScrapeDebug;
};

export type PersistedBulkSyncState = {
  running: boolean;
  cancelRequested: boolean;
  adminTabId?: number;
  products: ExtensionBulkSyncProduct[];
  itemsInCurrentBatch: number;
  progress: ExtensionBulkSyncProgress;
  updatedAt: number;
};
