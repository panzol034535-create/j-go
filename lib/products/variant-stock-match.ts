import { normalizeColor, normalizeStoredColor } from "@/lib/products/color-normalize";
import {
  normalizeSize,
  type VariantStockEntry,
} from "@/lib/products/variant-stock-normalize";

export type SkippedVariantEntry = {
  color: string;
  size: string;
  reason: "variant_not_found";
};

export type MatchedVariantStockUpdate = {
  variant_id: number;
  product_id: number;
  color: string;
  size: string;
  stock_status: string;
};

function canonicalSize(size: string): string {
  const normalized = normalizeSize(size);
  const upper = normalized.toUpperCase();

  if (upper === "F" || upper === "FREE") {
    return "FREE";
  }

  return normalized;
}

export function colorsEquivalent(left: string, right: string): boolean {
  const a = String(left || "").trim();
  const b = String(right || "").trim();

  if (!a || !b) {
    return false;
  }

  if (a === b) {
    return true;
  }

  const comparisons = [
    [normalizeStoredColor(a), normalizeStoredColor(b)],
    [normalizeColor(a), normalizeColor(b)],
    [normalizeStoredColor(a), normalizeColor(b)],
    [normalizeColor(a), normalizeStoredColor(b)],
  ] as const;

  return comparisons.some(([x, y]) => Boolean(x && y && x === y));
}

export function sizesEquivalent(left: string, right: string): boolean {
  const a = String(left || "").trim();
  const b = String(right || "").trim();

  if (!a || !b) {
    return false;
  }

  if (a === b) {
    return true;
  }

  if (normalizeSize(a) === normalizeSize(b)) {
    return true;
  }

  return canonicalSize(a) === canonicalSize(b);
}

export function getVariantRecordId(record: Record<string, unknown>): number {
  return Number(record.id ?? record.variant_id ?? 0);
}

export function getVariantRecordProductId(record: Record<string, unknown>): number {
  return Number(record.product_id ?? record.products_id ?? record.productId ?? 0);
}

export function getVariantRecordColor(record: Record<string, unknown>): string {
  return String(record.color ?? "").trim();
}

export function getVariantRecordSize(record: Record<string, unknown>): string {
  return String(record.size ?? record.size_name ?? "").trim();
}

export function findVariantRecordMatch(
  productVariants: Record<string, unknown>[],
  entry: VariantStockEntry,
  usedVariantIds: Set<number>
): Record<string, unknown> | null {
  for (const record of productVariants) {
    const variantId = getVariantRecordId(record);
    if (!variantId || usedVariantIds.has(variantId)) {
      continue;
    }

    const recordColor = getVariantRecordColor(record);
    const recordSize = getVariantRecordSize(record);

    if (colorsEquivalent(entry.color, recordColor) && sizesEquivalent(entry.size, recordSize)) {
      return record;
    }
  }

  return null;
}

export function matchVariantStockForUpdate(options: {
  productId: number;
  variantRecords: Record<string, unknown>[];
  normalizedVariantStock: VariantStockEntry[];
}): {
  updates: MatchedVariantStockUpdate[];
  skippedVariants: SkippedVariantEntry[];
} {
  const productVariants = options.variantRecords.filter(
    (record) => getVariantRecordProductId(record) === options.productId
  );
  const usedVariantIds = new Set<number>();
  const updates: MatchedVariantStockUpdate[] = [];
  const skippedVariants: SkippedVariantEntry[] = [];

  for (const entry of options.normalizedVariantStock) {
    const matched = findVariantRecordMatch(productVariants, entry, usedVariantIds);

    if (!matched) {
      skippedVariants.push({
        color: entry.color,
        size: entry.size,
        reason: "variant_not_found",
      });
      continue;
    }

    const variantId = getVariantRecordId(matched);
    if (!variantId) {
      skippedVariants.push({
        color: entry.color,
        size: entry.size,
        reason: "variant_not_found",
      });
      continue;
    }

    usedVariantIds.add(variantId);
    updates.push({
      variant_id: variantId,
      product_id: options.productId,
      color: entry.color,
      size: entry.size,
      stock_status: entry.stock_status,
    });
  }

  return { updates, skippedVariants };
}
