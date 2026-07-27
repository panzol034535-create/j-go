import { deriveVariantsListUrl } from "@/lib/products/merge-product-variants";
import {
  resolveProductSourceProductId,
  resolveProductSourceSite,
  resolveProductSourceUrl,
} from "@/lib/products/product-source-fields";
import {
  buildProductPriceUpdatePayload,
  buildProductStockStatusPayload,
  fetchPricingSettings,
  parseCurrentJpyPrice,
  resolveLastStockStatusFromVariants,
} from "@/lib/products/sync-product-price";
import {
  matchVariantStockForUpdate,
  type SkippedVariantEntry,
} from "@/lib/products/variant-stock-match";
import {
  normalizeVariantStockEntries,
  type VariantStockEntry,
} from "@/lib/products/variant-stock-normalize";
import { loadExtensionBulkSyncItems } from "@/lib/admin/extension-bulk-sync-items";
import { isConfidentUnpublishSourceStatus } from "@/lib/admin/stock-sync-policy";
import { fetchMergedProducts } from "@/lib/server/fetch-products";
import { fetchZozoStockSyncData } from "@/lib/zozo/fetch-zozo-stock-sync";
import { isZozoFetchTimeoutError } from "@/lib/zozo/with-timeout";

const DEFAULT_PRODUCTS_URL =
  "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/products";

const DEFAULT_UPDATE_VARIANT_STOCK_URL =
  "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/update-variant-stock";

const DEFAULT_UPDATE_PRODUCT_STOCK_URL =
  "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/update-product-stock";

const DEFAULT_UPDATE_PRODUCT_STATUS_URL =
  "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/update-product-status";

export type SyncableProduct = {
  id: number;
  name: string;
  source_url: string;
  source_site: string;
  source_product_id: string;
  status: string;
};

export type SyncOneProductStockAction =
  | "updated"
  | "unpublished"
  | "republished"
  | "uncertain"
  | "skipped"
  | "failed";

export type SyncOneProductStockResult = {
  product_id: number;
  name: string;
  success: boolean;
  action: SyncOneProductStockAction;
  reason?: string;
  synced_count?: number;
  updated_variants?: number;
  skipped_variants?: SkippedVariantEntry[];
  price_synced?: boolean;
};

type MatchedVariantUpdate = {
  variant_id: number;
  product_id: number;
  color: string;
  size: string;
  stock_status: string;
};

function getUpdateVariantStockUrl(): string {
  return process.env.XANO_UPDATE_VARIANT_STOCK_URL || DEFAULT_UPDATE_VARIANT_STOCK_URL;
}

function getUpdateProductStockUrl(): string {
  return process.env.XANO_UPDATE_PRODUCT_STOCK_URL || DEFAULT_UPDATE_PRODUCT_STOCK_URL;
}

function getUpdateProductStatusUrl(): string {
  return process.env.XANO_UPDATE_PRODUCT_STATUS_URL || DEFAULT_UPDATE_PRODUCT_STATUS_URL;
}

function getProductsUrl(): string {
  return process.env.XANO_PRODUCTS_URL || DEFAULT_PRODUCTS_URL;
}

function getVariantsUrl(): string {
  return (
    process.env.XANO_LIST_VARIANTS_URL || deriveVariantsListUrl(getProductsUrl())
  );
}

export function resolveSyncSourceUrl(product: SyncableProduct): string | null {
  const trimmedUrl = product.source_url?.trim();
  if (trimmedUrl) {
    return trimmedUrl;
  }

  const site = String(product.source_site || "").trim().toLowerCase();
  if (product.source_product_id && (site === "zozo" || site === "zozotown")) {
    return `https://zozo.jp/shop/goods/${product.source_product_id}`;
  }

  return null;
}

export function isZozoSyncSource(product: SyncableProduct): boolean {
  const site = String(product.source_site || "").trim().toLowerCase();
  const url = String(product.source_url || "").trim().toLowerCase();

  if (url.includes("zozo.jp")) {
    return true;
  }

  return site === "zozo" || site === "zozotown";
}

export async function loadSyncablePublishedProducts(): Promise<SyncableProduct[]> {
  const products = await fetchMergedProducts();

  return products
    .map((raw) => {
      const source_url = resolveProductSourceUrl(raw);
      const source_site = resolveProductSourceSite(raw, source_url);
      const source_product_id = resolveProductSourceProductId(raw, source_url);
      const status = String(raw.status ?? "published").trim().toLowerCase();

      return {
        id: Number(raw.id),
        name: String(raw.name_zh || raw.name || raw.name_jp || "未命名商品"),
        source_url,
        source_site,
        source_product_id,
        status,
      };
    })
    .filter((product) => {
      if (!Number.isFinite(product.id) || product.id <= 0) {
        return false;
      }

      if (product.status && product.status !== "published") {
        return false;
      }

      return Boolean(product.source_url?.trim() || product.source_product_id?.trim());
    });
}

export async function loadExtensionBulkSyncQueue(): Promise<SyncableProduct[]> {
  const { items } = await loadExtensionBulkSyncItems();

  return items.map((item) => ({
    id: item.id,
    name: item.name,
    source_url: item.source_url,
    source_site: item.source_site,
    source_product_id: item.source_product_id,
    status: item.status ?? "published",
  }));
}

export type ExtensionSourceStatus =
  | "available"
  | "source_missing"
  | "discontinued"
  | "all_out_of_stock"
  | "sync_uncertain"
  | "needs_manual_review";

async function fetchProductContext(
  productId: number
): Promise<{ status: string; check_status: string } | null> {
  const products = await fetchMergedProducts();
  const raw = products.find((item) => Number(item.id) === productId);

  if (!raw) {
    return null;
  }

  return {
    status: String(raw.status ?? "published").trim().toLowerCase(),
    check_status: String(raw.check_status ?? "").trim().toLowerCase(),
  };
}

function buildUncertainResult(options: {
  productId: number;
  name: string;
  reason: string;
}): SyncOneProductStockResult {
  return {
    product_id: options.productId,
    name: options.name,
    success: true,
    action: "uncertain",
    reason: options.reason,
  };
}

async function markProductUncertain(options: {
  productId: number;
  name: string;
  checkStatus: "needs_manual_review" | "sync_uncertain";
  reason: string;
}): Promise<SyncOneProductStockResult> {
  const statusResult = await updateProductMonitorStatus({
    productId: options.productId,
    checkStatus: options.checkStatus,
    lastStockStatus: "unknown",
  });

  if (!statusResult.ok) {
    return {
      product_id: options.productId,
      name: options.name,
      success: false,
      action: "failed",
      reason: statusResult.body || "更新監控狀態失敗",
    };
  }

  return buildUncertainResult({
    productId: options.productId,
    name: options.name,
    reason: options.reason,
  });
}

export async function applyExtensionStockSyncResult(options: {
  productId: number;
  productName?: string;
  source_status?: ExtensionSourceStatus;
  variant_stock?: VariantStockEntry[];
  current_jpy_price?: unknown;
  access_denied?: boolean;
}): Promise<SyncOneProductStockResult> {
  const productId = options.productId;
  const name = options.productName || `商品 #${productId}`;
  const sourceStatus = options.source_status || "available";

  if (options.access_denied) {
    return markProductUncertain({
      productId,
      name,
      checkStatus: "needs_manual_review",
      reason: "access_denied",
    });
  }

  if (
    sourceStatus === "sync_uncertain" ||
    sourceStatus === "needs_manual_review"
  ) {
    return markProductUncertain({
      productId,
      name,
      checkStatus: sourceStatus,
      reason: sourceStatus,
    });
  }

  if (isConfidentUnpublishSourceStatus(sourceStatus)) {
    if (sourceStatus === "all_out_of_stock") {
      const normalizedVariantStock = normalizeVariantStockEntries(options.variant_stock);
      if (normalizedVariantStock.length === 0) {
        return markProductUncertain({
          productId,
          name,
          checkStatus: "sync_uncertain",
          reason: "empty_scraped_variants",
        });
      }
    }

    const statusResult = await updateProductPublishStatus({
      productId,
      status: "draft",
      checkStatus: sourceStatus,
      lastStockStatus:
        sourceStatus === "all_out_of_stock" ? "all_out_of_stock" : sourceStatus,
    });

    if (!statusResult.ok) {
      return {
        product_id: productId,
        name,
        success: false,
        action: "failed",
        reason: statusResult.body || "自動下架失敗",
      };
    }

    return {
      product_id: productId,
      name,
      success: true,
      action: "unpublished",
      reason: sourceStatus,
    };
  }

  return applyProductStockSyncFromPayload({
    productId,
    productName: name,
    variant_stock: options.variant_stock,
    current_jpy_price: options.current_jpy_price,
  });
}

async function fetchVariantRecords(variantsUrl: string): Promise<Record<string, unknown>[]> {
  const candidateUrls = Array.from(
    new Set([
      variantsUrl,
      variantsUrl.replace(/\/variants\/?$/, "/product_variants"),
      variantsUrl.replace(/\/variants\/?$/, "/product-variant"),
    ])
  );

  for (const url of candidateUrls) {
    try {
      const response = await fetch(`${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        continue;
      }

      const data = await response.json();
      const records = Array.isArray(data)
        ? data
        : Array.isArray((data as Record<string, unknown>).items)
          ? ((data as Record<string, unknown>).items as Record<string, unknown>[])
          : [];

      if (records.length > 0) {
        return records.filter((item) => item && typeof item === "object") as Record<string, unknown>[];
      }
    } catch (error) {
      console.warn("SYNC STOCK VARIANT FETCH FAILED:", url, error);
    }
  }

  return [];
}

async function updateVariantStock(
  updateUrl: string,
  update: MatchedVariantUpdate
): Promise<{ ok: boolean; body: string }> {
  const response = await fetch(updateUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      variant_id: update.variant_id,
      stock_status: update.stock_status,
    }),
  });

  return {
    ok: response.ok,
    body: await response.text(),
  };
}

async function postUpdateProductStock(
  updateUrl: string,
  payload: Record<string, unknown>
): Promise<{ ok: boolean; body: string }> {
  const response = await fetch(updateUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return {
    ok: response.ok,
    body: await response.text(),
  };
}

export async function updateProductPublishStatus(options: {
  productId: number;
  status: "draft" | "unpublished" | "published";
  checkStatus: string;
  lastStockStatus: string;
}): Promise<{ ok: boolean; body: string }> {
  const payload = {
    product_id: options.productId,
    status: options.status,
    check_status: options.checkStatus,
    last_stock_status: options.lastStockStatus,
  };

  const statusUrl = getUpdateProductStatusUrl();
  const stockUrl = getUpdateProductStockUrl();

  const statusResult = await postUpdateProductStock(statusUrl, payload);
  if (statusResult.ok) {
    return statusResult;
  }

  return postUpdateProductStock(stockUrl, payload);
}

export async function updateProductMonitorStatus(options: {
  productId: number;
  checkStatus: string;
  lastStockStatus: string;
}): Promise<{ ok: boolean; body: string }> {
  return postUpdateProductStock(getUpdateProductStockUrl(), {
    product_id: options.productId,
    check_status: options.checkStatus,
    last_stock_status: options.lastStockStatus,
  });
}

async function applyVariantAndProductStockUpdate(options: {
  productId: number;
  normalizedVariantStock: VariantStockEntry[];
  currentJpyPrice: number | null;
}): Promise<{
  syncedCount: number;
  updatedVariants: number;
  skippedVariants: SkippedVariantEntry[];
  priceSynced: boolean;
  reason?: string;
}> {
  const variantRecords = await fetchVariantRecords(getVariantsUrl());
  const { updates, skippedVariants } = matchVariantStockForUpdate({
    productId: options.productId,
    variantRecords,
    normalizedVariantStock: options.normalizedVariantStock,
  });

  console.log("JGO SYNC MATCHED VARIANTS", {
    product_id: options.productId,
    matched_count: updates.length,
    skipped_count: skippedVariants.length,
    matched_variant_ids: updates.map((update) => update.variant_id),
    skipped_variants: skippedVariants,
  });

  if (updates.length === 0) {
    return {
      syncedCount: 0,
      updatedVariants: 0,
      skippedVariants,
      priceSynced: false,
      reason: "找不到可更新的 variant",
    };
  }

  let syncedCount = 0;
  const failures: string[] = [];

  for (const update of updates) {
    console.log("JGO SYNC UPDATE VARIANT", {
      product_id: options.productId,
      variant_id: update.variant_id,
      color: update.color,
      size: update.size,
      stock_status: update.stock_status,
    });

    const result = await updateVariantStock(getUpdateVariantStockUrl(), update);
    if (result.ok) {
      syncedCount += 1;
      continue;
    }

    failures.push(`${update.color}/${update.size}: ${result.body}`);
  }

  if (syncedCount === 0) {
    return {
      syncedCount: 0,
      updatedVariants: 0,
      skippedVariants,
      priceSynced: false,
      reason: failures[0] || "同步 variant 庫存失敗",
    };
  }

  const updateProductUrl = getUpdateProductStockUrl();
  let priceSynced = false;

  if (options.currentJpyPrice !== null) {
    const settings = await fetchPricingSettings();
    const payload = buildProductPriceUpdatePayload({
      productId: options.productId,
      currentJpyPrice: options.currentJpyPrice,
      settings,
      lastStockStatus: resolveLastStockStatusFromVariants(options.normalizedVariantStock),
    });

    if (payload) {
      const priceResult = await postUpdateProductStock(updateProductUrl, payload);
      priceSynced = priceResult.ok;
      if (!priceResult.ok) {
        const stockStatusResult = await postUpdateProductStock(
          updateProductUrl,
          buildProductStockStatusPayload(
            options.productId,
            resolveLastStockStatusFromVariants(options.normalizedVariantStock)
          )
        );
        if (!stockStatusResult.ok) {
          return {
            syncedCount,
            updatedVariants: syncedCount,
            skippedVariants,
            priceSynced: false,
            reason: priceResult.body || "更新商品價格失敗",
          };
        }
      }
    } else {
      await postUpdateProductStock(
        updateProductUrl,
        buildProductStockStatusPayload(
          options.productId,
          resolveLastStockStatusFromVariants(options.normalizedVariantStock)
        )
      );
    }
  } else {
    await postUpdateProductStock(
      updateProductUrl,
      buildProductStockStatusPayload(
        options.productId,
        resolveLastStockStatusFromVariants(options.normalizedVariantStock)
      )
    );
  }

  const partialWarnings = [
    ...failures,
    ...(skippedVariants.length > 0
      ? [`略過 ${skippedVariants.length} 個找不到的 variant`]
      : []),
  ];

  return {
    syncedCount,
    updatedVariants: syncedCount,
    skippedVariants,
    priceSynced,
    reason: partialWarnings.length > 0 ? partialWarnings.join("; ") : undefined,
  };
}

export async function applyProductStockSyncFromPayload(options: {
  productId: number;
  productName?: string;
  variant_stock?: VariantStockEntry[];
  current_jpy_price?: unknown;
}): Promise<SyncOneProductStockResult> {
  const productId = options.productId;
  const name = options.productName || `商品 #${productId}`;
  const normalizedVariantStock = normalizeVariantStockEntries(options.variant_stock);
  const currentJpyPrice = parseCurrentJpyPrice(options.current_jpy_price);

  console.log("JGO SYNC RECEIVED VARIANTS", productId, normalizedVariantStock);

  if (normalizedVariantStock.length === 0) {
    return markProductUncertain({
      productId,
      name,
      checkStatus: "sync_uncertain",
      reason: "empty_variant_stock",
    });
  }

  const productContext = await fetchProductContext(productId);
  const hasInStock = normalizedVariantStock.some(
    (entry) => entry.stock_status === "in_stock"
  );

  try {
    const updateResult = await applyVariantAndProductStockUpdate({
      productId,
      normalizedVariantStock,
      currentJpyPrice,
    });

    if (updateResult.syncedCount === 0) {
      return markProductUncertain({
        productId,
        name,
        checkStatus: "sync_uncertain",
        reason: updateResult.reason || "variant_match_failed",
      });
    }

    if (hasInStock && productContext?.status === "draft") {
      const republishResult = await updateProductPublishStatus({
        productId,
        status: "published",
        checkStatus: "normal",
        lastStockStatus: "available",
      });

      if (!republishResult.ok) {
        return {
          product_id: productId,
          name,
          success: false,
          action: "failed",
          reason: republishResult.body || "恢復上架失敗",
        };
      }

      return {
        product_id: productId,
        name,
        success: true,
        action: "republished",
        synced_count: updateResult.syncedCount,
        updated_variants: updateResult.updatedVariants,
        skipped_variants: updateResult.skippedVariants,
        price_synced: updateResult.priceSynced,
        reason: updateResult.reason,
      };
    }

    return {
      product_id: productId,
      name,
      success: true,
      action: "updated",
      synced_count: updateResult.syncedCount,
      updated_variants: updateResult.updatedVariants,
      skipped_variants: updateResult.skippedVariants,
      price_synced: updateResult.priceSynced,
      reason: updateResult.reason,
    };
  } catch (error) {
    return {
      product_id: productId,
      name,
      success: false,
      action: "failed",
      reason: error instanceof Error ? error.message : "同步庫存失敗",
    };
  }
}

export async function syncOneProductStock(product: SyncableProduct): Promise<SyncOneProductStockResult> {
  const hasSourceUrl = Boolean(product.source_url?.trim());
  const hasSourceProductId = Boolean(product.source_product_id?.trim());

  if (!hasSourceUrl && !hasSourceProductId) {
    return {
      product_id: product.id,
      name: product.name,
      success: true,
      action: "skipped",
      reason: "missing_source",
    };
  }

  if (!isZozoSyncSource(product)) {
    return {
      product_id: product.id,
      name: product.name,
      success: true,
      action: "skipped",
      reason: "unsupported_source",
    };
  }

  const sourceUrl = resolveSyncSourceUrl(product);

  if (!sourceUrl) {
    return {
      product_id: product.id,
      name: product.name,
      success: true,
      action: "skipped",
      reason: "missing_source",
    };
  }

  try {
    const fetchResult = await fetchZozoStockSyncData(sourceUrl);

    if (fetchResult.kind === "uncertain") {
      return markProductUncertain({
        productId: product.id,
        name: product.name,
        checkStatus: fetchResult.check_status,
        reason: fetchResult.reason,
      });
    }

    if (fetchResult.kind === "unpublish") {
      if (fetchResult.status === "all_out_of_stock" && fetchResult.variant_stock.length === 0) {
        return markProductUncertain({
          productId: product.id,
          name: product.name,
          checkStatus: "sync_uncertain",
          reason: fetchResult.reason,
        });
      }

      const statusResult = await updateProductPublishStatus({
        productId: product.id,
        status: "draft",
        checkStatus: fetchResult.status,
        lastStockStatus:
          fetchResult.status === "all_out_of_stock"
            ? "all_out_of_stock"
            : fetchResult.status,
      });

      if (!statusResult.ok) {
        return {
          product_id: product.id,
          name: product.name,
          success: false,
          action: "failed",
          reason: statusResult.body || "自動下架失敗",
        };
      }

      return {
        product_id: product.id,
        name: product.name,
        success: true,
        action: "unpublished",
        reason: fetchResult.reason,
      };
    }

    return applyProductStockSyncFromPayload({
      productId: product.id,
      productName: product.name,
      variant_stock: fetchResult.variant_stock,
      current_jpy_price: fetchResult.current_jpy_price,
    });
  } catch (error) {
    if (isZozoFetchTimeoutError(error)) {
      return markProductUncertain({
        productId: product.id,
        name: product.name,
        checkStatus: "needs_manual_review",
        reason: "source_timeout",
      });
    }

    return {
      product_id: product.id,
      name: product.name,
      success: false,
      action: "failed",
      reason: error instanceof Error ? error.message : "同步失敗",
    };
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
