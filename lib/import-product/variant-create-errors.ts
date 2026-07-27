import { normalizeColor } from "@/lib/products/color-normalize";
import { normalizeSize } from "@/lib/products/variant-stock-normalize";

export type FailedVariantDetail = {
  color: string;
  size: string;
  stock_status: string;
  stock_qty: number;
  reason: string;
  status: number;
  responseText: string;
};

export type VariantStockEntry = {
  color: string;
  size: string;
  stock_status: string;
};

export function buildVariantDedupeKey(color: string, size: string): string {
  return `${normalizeColor(color)}::${normalizeSize(size)}`;
}

export function dedupeVariantStockEntries<T extends VariantStockEntry>(entries: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const entry of entries) {
    const key = buildVariantDedupeKey(entry.color, entry.size);
    if (seen.has(key)) {
      console.log("SKIP DUPLICATE VARIANT", {
        color: entry.color,
        size: entry.size,
      });
      continue;
    }

    seen.add(key);
    result.push(entry);
  }

  return result;
}

export function isDuplicateVariantError(status: number, responseText: string): boolean {
  const text = responseText.toLowerCase();

  return (
    status === 409 ||
    text.includes("duplicate") ||
    text.includes("already exists") ||
    text.includes("unique constraint") ||
    text.includes("unique violation") ||
    text.includes("重複")
  );
}

export function resolveVariantFailureReason(
  status: number,
  responseText: string
): string {
  const trimmed = responseText.trim();

  if (status === 429) {
    return "rate_limited";
  }

  if (trimmed) {
    try {
      const parsed = JSON.parse(trimmed) as {
        message?: string;
        error?: string;
        code?: string;
      };

      if (parsed.message) {
        return String(parsed.message);
      }

      if (parsed.error) {
        return String(parsed.error);
      }

      if (parsed.code) {
        return String(parsed.code);
      }
    } catch {
      if (trimmed.length <= 200) {
        return trimmed;
      }
    }
  }

  if (status >= 500) {
    return "server_error";
  }

  if (status >= 400) {
    return "client_error";
  }

  return "unknown_error";
}

export function formatFailedVariantsMessage(
  failedVariants: FailedVariantDetail[]
): string {
  if (failedVariants.length === 0) {
    return "商品已建立，但有 variant 建立失敗";
  }

  const details = failedVariants
    .map((item) => `${item.color} / ${item.size}（${item.reason}）`)
    .join("；");

  return `商品已建立，但以下規格建立失敗：${details}`;
}
