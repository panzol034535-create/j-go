export type VariantStockEntry = {
  color: string;
  size: string;
  stock_status: string;
};

import { isValidProductColor, normalizeColor, normalizeStoredColor } from "@/lib/products/color-normalize";

export { normalizeColor, isValidProductColor, normalizeStoredColor };

export function normalizeSize(size: string): string {
  const normalized = size.trim().toUpperCase();

  switch (normalized) {
    case "X-SMALL":
    case "XS":
      return "XS";
    case "SMALL":
    case "S":
      return "S";
    case "MEDIUM":
    case "M":
      return "M";
    case "LARGE":
    case "L":
      return "L";
    case "X-LARGE":
    case "XL":
      return "XL";
    default:
      return size.trim();
  }
}

export function normalizeStockStatus(status: string | undefined): "in_stock" | "out_of_stock" | "unknown" {
  if (status === "in_stock" || status === "out_of_stock") {
    return status;
  }

  return "unknown";
}

export function normalizeVariantStockEntries(
  entries: VariantStockEntry[] | undefined
): VariantStockEntry[] {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .map((entry) => ({
      color: normalizeStoredColor(String(entry.color || "")),
      size: normalizeSize(String(entry.size || "")),
      stock_status: normalizeStockStatus(entry.stock_status),
    }))
    .filter((entry) => entry.color && entry.size);
}

export function matchVariantStockStatus(
  normalizedVariantStock: VariantStockEntry[],
  color: string,
  size: string
): "in_stock" | "out_of_stock" | "unknown" | null {
  const normalizedColor = normalizeStoredColor(color);
  const normalizedSize = normalizeSize(size);

  const match = normalizedVariantStock.find(
    (entry) =>
      normalizeStoredColor(entry.color) === normalizedColor &&
      normalizeSize(entry.size) === normalizedSize
  );

  if (!match) {
    return null;
  }

  return normalizeStockStatus(match.stock_status);
}
