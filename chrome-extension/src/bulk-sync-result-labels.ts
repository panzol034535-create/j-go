export type BulkSyncResultDebug = Record<string, unknown>;

const REASON_LABELS: Record<string, string> = {
  item_timeout: "單件同步逾時",
  source_timeout: "ZOZO 來源讀取逾時",
  tab_load_timeout: "ZOZO 來源讀取逾時",
  xano_429: "Xano 請求過於頻繁",
  variant_not_matched: "找不到可更新的 variant",
  scrape_empty_variants: "抓不到 ZOZO 庫存規格",
  access_denied: "ZOZO 暫時拒絕存取",
  source_missing: "商品頁不存在",
  discontinued: "商品已停售",
  all_out_of_stock: "ZOZO 全尺寸缺貨",
  update_failed: "更新 Xano 失敗",
  api_timeout: "更新 Xano 逾時",
  invalid_scrape_result: "抓取結果無效",
  invalid_product: "商品資料無效",
  item_incomplete: "單件同步逾時",
  unexpected_error: "未知錯誤",
  unexpected_exception: "未知錯誤",
  unknown: "未知原因",
  unknown_stock: "無法確認庫存狀態",
  sync_uncertain: "同步狀態不確定",
  needs_manual_review: "需人工檢查",
  empty_scraped_variants: "抓不到 ZOZO 庫存規格",
  empty_variant_stock: "抓不到 ZOZO 庫存規格",
  variant_match_failed: "找不到可更新的 variant",
  api_failed: "更新 Xano 失敗",
};

const UNCERTAIN_RESULT_MESSAGES: Record<string, string> = {
  source_timeout: "ZOZO 來源讀取逾時，請稍後重試",
  tab_load_timeout: "ZOZO 來源讀取逾時，請稍後重試",
  item_timeout: "單件同步逾時，請稍後重試",
  item_incomplete: "單件同步逾時，請稍後重試",
  access_denied: "ZOZO 暫時拒絕存取，請稍後重試",
  scrape_empty_variants: "抓不到 ZOZO 庫存規格，請稍後重試",
  empty_scraped_variants: "抓不到 ZOZO 庫存規格，請稍後重試",
  empty_variant_stock: "抓不到 ZOZO 庫存規格，請稍後重試",
  sync_uncertain: "同步狀態不確定，請稍後重試",
  unknown_stock: "無法確認庫存狀態，請稍後重試",
  needs_manual_review: "需人工檢查，請稍後重試",
  invalid_scrape_result: "ZOZO 來源讀取逾時，請稍後重試",
  unknown: "無法判定同步結果，請稍後重試",
};

const FAILED_REASON_CODES = new Set([
  "xano_429",
  "update_failed",
  "variant_not_matched",
  "variant_match_failed",
  "invalid_product",
  "unexpected_exception",
  "unexpected_error",
  "api_failed",
  "api_timeout",
]);

const UNCERTAIN_REASON_CODES = new Set([
  "source_timeout",
  "item_timeout",
  "tab_load_timeout",
  "item_incomplete",
  "access_denied",
  "scrape_empty_variants",
  "empty_scraped_variants",
  "empty_variant_stock",
  "sync_uncertain",
  "unknown_stock",
  "needs_manual_review",
  "invalid_scrape_result",
  "unknown",
]);

const REASON_PRIORITY: Record<string, number> = {
  source_missing: 100,
  discontinued: 95,
  all_out_of_stock: 90,
  variant_not_matched: 85,
  xano_429: 80,
  update_failed: 82,
  invalid_product: 81,
  source_timeout: 75,
  access_denied: 70,
  scrape_empty_variants: 65,
  item_timeout: 60,
  tab_load_timeout: 74,
  api_timeout: 78,
  invalid_scrape_result: 55,
  item_incomplete: 59,
  sync_uncertain: 40,
  needs_manual_review: 40,
  unknown_stock: 38,
  unexpected_exception: 10,
  unexpected_error: 10,
  unknown: 0,
};

export function normalizeBulkSyncReasonCode(raw?: string): string {
  const value = String(raw ?? "").trim();
  const lower = value.toLowerCase();

  if (!value) {
    return "unknown";
  }

  if (lower === "item_timeout" || lower === "item_incomplete") {
    return "item_timeout";
  }

  if (lower === "source_timeout" || lower === "tab_load_timeout") {
    return lower === "tab_load_timeout" ? "tab_load_timeout" : "source_timeout";
  }

  if (
    lower.includes("429") ||
    value.includes("過於頻繁") ||
    lower.includes("rate limit") ||
    lower.includes("too many requests")
  ) {
    return "xano_429";
  }

  if (
    value.includes("找不到可更新的 variant") ||
    lower.includes("variant_match_failed") ||
    lower.includes("variant_not_matched")
  ) {
    return "variant_not_matched";
  }

  if (
    lower.includes("empty_scraped_variants") ||
    lower.includes("empty_variant_stock") ||
    lower.includes("scrape_empty_variants") ||
    lower.includes("unknown_stock") ||
    (lower.includes("empty") && lower.includes("variant"))
  ) {
    return lower.includes("unknown_stock") ? "unknown_stock" : "scrape_empty_variants";
  }

  if (
    lower.includes("access_denied") ||
    lower.includes("zozo_access_denied") ||
    value.includes("拒絕存取")
  ) {
    return "access_denied";
  }

  if (lower.includes("source_missing") || value.includes("商品頁不存在")) {
    return "source_missing";
  }

  if (lower === "discontinued") {
    return "discontinued";
  }

  if (lower === "all_out_of_stock") {
    return "all_out_of_stock";
  }

  if (lower.includes("invalid_product")) {
    return "invalid_product";
  }

  if (
    lower.includes("api_timeout") ||
    lower.includes("background_message_timeout")
  ) {
    return "api_timeout";
  }

  if (
    lower.includes("unexpected_exception") ||
    lower === "unexpected_error"
  ) {
    return "unexpected_exception";
  }

  if (
    lower.includes("api_failed") ||
    lower.includes("update_failed") ||
    lower.includes("同步庫存失敗") ||
    lower.includes("更新") ||
    lower.includes("xano")
  ) {
    return "update_failed";
  }

  if (lower.includes("sync_uncertain")) {
    return "sync_uncertain";
  }

  if (lower.includes("needs_manual_review")) {
    return "needs_manual_review";
  }

  if (lower.includes("missing_stock_block")) {
    return "scrape_empty_variants";
  }

  if (lower.includes("invalid_scrape_result")) {
    return "invalid_scrape_result";
  }

  if (REASON_LABELS[lower]) {
    return lower;
  }

  return lower.replace(/\s+/g, "_");
}

export function resolveBulkSyncResultAction(reason?: string): "failed" | "uncertain" {
  const code = normalizeBulkSyncReasonCode(reason);

  if (FAILED_REASON_CODES.has(code)) {
    return "failed";
  }

  if (UNCERTAIN_REASON_CODES.has(code)) {
    return "uncertain";
  }

  return "uncertain";
}

export function getBulkSyncReasonPriority(reason?: string): number {
  const code = normalizeBulkSyncReasonCode(reason);
  return REASON_PRIORITY[code] ?? 40;
}

export function shouldReplaceBulkSyncResult(
  existingReason?: string,
  nextReason?: string
): boolean {
  return getBulkSyncReasonPriority(nextReason) > getBulkSyncReasonPriority(existingReason);
}

export function getBulkSyncReasonLabel(reason?: string): string {
  const code = normalizeBulkSyncReasonCode(reason);
  return REASON_LABELS[code] || reason || "未知原因";
}

export function formatBulkSyncResultMessage(options: {
  action: string;
  reason?: string;
  message?: string;
}): { reason: string; message: string } {
  const reason = normalizeBulkSyncReasonCode(options.reason);
  const resolvedAction = resolveBulkSyncResultAction(reason);

  if (options.message?.trim()) {
    return { reason, message: options.message.trim() };
  }

  if (resolvedAction === "uncertain" && UNCERTAIN_RESULT_MESSAGES[reason]) {
    return { reason, message: UNCERTAIN_RESULT_MESSAGES[reason] };
  }

  return {
    reason,
    message: getBulkSyncReasonLabel(reason) || "未知原因",
  };
}

export function buildBulkSyncResultEntry(options: {
  action: string;
  success: boolean;
  reason?: string;
  message?: string;
}): {
  action: string;
  success: boolean;
  reason: string;
  message: string;
} {
  const formatted = formatBulkSyncResultMessage(options);
  const terminalSuccessActions = new Set([
    "updated",
    "republished",
    "unpublished",
    "skipped",
  ]);

  if (options.success && terminalSuccessActions.has(options.action)) {
    return {
      action: options.action,
      success: true,
      reason: formatted.reason,
      message: formatted.message,
    };
  }

  if (options.success && options.action === "uncertain") {
    return {
      action: "uncertain",
      success: true,
      reason: formatted.reason,
      message: formatted.message,
    };
  }

  if (resolveBulkSyncResultAction(formatted.reason) === "uncertain") {
    return {
      action: "uncertain",
      success: true,
      reason: formatted.reason,
      message: formatted.message,
    };
  }

  return {
    action: "failed",
    success: false,
    reason: formatted.reason,
    message: formatted.message,
  };
}

export function dedupeBulkSyncResultsByProductId<
  T extends { product_id: number; reason?: string },
>(results: T[]): T[] {
  const byId = new Map<number, T>();

  for (const item of results) {
    const existing = byId.get(item.product_id);
    if (!existing || shouldReplaceBulkSyncResult(existing.reason, item.reason)) {
      byId.set(item.product_id, item);
    }
  }

  return Array.from(byId.values());
}
