import type { VariantStockEntry } from "@/lib/products/variant-stock-normalize";

const DEFAULT_JPY_RATE = 0.25;
const DEFAULT_PROFIT_RATE = 1.35;

export type PricingSettings = {
  jpy_rate: number;
  profit_rate: number;
};

export type ProductStockStatus = "in_stock" | "out_of_stock" | "unknown";

/**
 * Accepts only positive integer JPY prices from sync payloads.
 * Returns null for undefined, null, "", whitespace, 0, NaN, or non-numeric values.
 */
export function parseCurrentJpyPrice(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string" && value.trim() === "") {
    return null;
  }

  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

export function isValidCurrentJpyPrice(value: unknown): boolean {
  return parseCurrentJpyPrice(value) !== null;
}

export function calculateSyncTwdPrice(
  currentJpyPrice: number,
  settings: PricingSettings
): number {
  return Math.round(currentJpyPrice * settings.jpy_rate * settings.profit_rate);
}

export function resolveLastStockStatusFromVariants(
  entries: VariantStockEntry[]
): ProductStockStatus {
  if (entries.length === 0) {
    return "unknown";
  }

  if (entries.some((entry) => entry.stock_status === "in_stock")) {
    return "in_stock";
  }

  if (entries.every((entry) => entry.stock_status === "out_of_stock")) {
    return "out_of_stock";
  }

  return "unknown";
}

export function normalizePricingSettings(raw: unknown): PricingSettings {
  const record = Array.isArray(raw)
    ? (raw[0] as Record<string, unknown> | undefined)
    : (raw as Record<string, unknown> | null);

  const jpy_rate = Number(record?.jpy_rate);
  const profit_rate = Number(record?.profit_rate);

  return {
    jpy_rate:
      !Number.isNaN(jpy_rate) && jpy_rate > 0 ? jpy_rate : DEFAULT_JPY_RATE,
    profit_rate:
      !Number.isNaN(profit_rate) && profit_rate > 0 ? profit_rate : DEFAULT_PROFIT_RATE,
  };
}

export async function fetchPricingSettings(): Promise<PricingSettings> {
  const settingsUrl = process.env.XANO_SETTINGS_URL?.trim();

  if (!settingsUrl) {
    return normalizePricingSettings(null);
  }

  try {
    const response = await fetch(`${settingsUrl}${settingsUrl.includes("?") ? "&" : "?"}t=${Date.now()}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      console.warn("SYNC PRICE SETTINGS FETCH FAILED", response.status);
      return normalizePricingSettings(null);
    }

    const data = await response.json();
    return normalizePricingSettings(data);
  } catch (error) {
    console.warn("SYNC PRICE SETTINGS FETCH ERROR", error);
    return normalizePricingSettings(null);
  }
}

/**
 * Xano POST update-product-stock — price sync payload.
 * Returns null when TWD price would be <= 0 so callers never send price: 0.
 */
export function buildProductPriceUpdatePayload(options: {
  productId: number;
  currentJpyPrice: number;
  settings: PricingSettings;
  lastStockStatus: ProductStockStatus;
}): Record<string, unknown> | null {
  const twdPrice = calculateSyncTwdPrice(options.currentJpyPrice, options.settings);
  if (twdPrice <= 0) {
    return null;
  }

  return {
    product_id: options.productId,
    current_jpy_price: options.currentJpyPrice,
    jpy_price: options.currentJpyPrice,
    last_price_jpy: options.currentJpyPrice,
    price: twdPrice,
    last_stock_status: options.lastStockStatus,
    check_status: "ok",
  };
}

/**
 * Xano POST update-product-stock — stock-only payload (no price fields).
 */
export function buildProductStockStatusPayload(
  productId: number,
  lastStockStatus: ProductStockStatus
): Record<string, unknown> {
  return {
    product_id: productId,
    last_stock_status: lastStockStatus,
    check_status: "ok",
  };
}
