import {
  isZozoSyncSource,
  resolveSyncSourceUrl,
  type SyncableProduct,
} from "@/lib/admin/sync-one-product-stock";
import { isRecoverableDraftProduct } from "@/lib/admin/stock-sync-policy";
import {
  resolveProductSourceProductId,
  resolveProductSourceSite,
  resolveProductSourceUrl,
} from "@/lib/products/product-source-fields";
import {
  normalizeStockMonitorProducts,
} from "@/lib/stock-monitor/normalize-product";
import { fetchMergedProducts } from "@/lib/server/fetch-products";
import { fetchXanoJson } from "@/lib/server/fetch-revalidated";

export type ExtensionBulkSyncExcludeReason =
  | "missing_product_id"
  | "not_published"
  | "already_draft"
  | "missing_source_url"
  | "unsupported_source";

export type ExtensionBulkSyncExcludedItem = {
  product_id: number;
  name: string;
  reason: ExtensionBulkSyncExcludeReason;
};

export type ExtensionBulkSyncItem = {
  id: number;
  name: string;
  source_url: string;
  source_site: string;
  source_product_id: string;
  status?: string;
  recoverable_draft?: boolean;
};

export type ExtensionBulkSyncItemsResult = {
  items: ExtensionBulkSyncItem[];
  excluded: ExtensionBulkSyncExcludedItem[];
  total_monitor_products: number;
  syncable_count: number;
  excluded_count: number;
  recoverable_draft_count: number;
};

function resolveMonitorProductName(raw: Record<string, unknown>): string {
  return String(raw.name_zh || raw.name || raw.name_jp || "未命名商品");
}

function classifyExtensionSyncProduct(
  productId: number,
  raw: Record<string, unknown>
): { item: ExtensionBulkSyncItem } | { excluded: ExtensionBulkSyncExcludedItem } {
  const name = resolveMonitorProductName(raw);
  const status = String(raw.status ?? "published").trim().toLowerCase();
  const checkStatus = String(raw.check_status ?? "").trim().toLowerCase();
  const source_url = resolveProductSourceUrl(raw);
  const source_site = resolveProductSourceSite(raw, source_url);
  const source_product_id = resolveProductSourceProductId(raw, source_url);

  const syncable: SyncableProduct = {
    id: productId,
    name,
    source_url,
    source_site,
    source_product_id,
    status,
  };

  const resolvedSourceUrl = resolveSyncSourceUrl(syncable);
  const isZozoSource =
    Boolean(resolvedSourceUrl?.includes("zozo.jp")) && isZozoSyncSource(syncable);

  if (status === "draft") {
    if (
      isRecoverableDraftProduct({
        status,
        checkStatus,
        sourceUrl: resolvedSourceUrl,
        isZozo: isZozoSource,
      })
    ) {
      return {
        item: {
          id: productId,
          name,
          source_url: resolvedSourceUrl!,
          source_site,
          source_product_id,
          status,
          recoverable_draft: true,
        },
      };
    }

    return {
      excluded: {
        product_id: productId,
        name,
        reason: "already_draft",
      },
    };
  }

  if (status !== "published") {
    return {
      excluded: {
        product_id: productId,
        name,
        reason: "not_published",
      },
    };
  }

  if (!resolvedSourceUrl?.trim()) {
    return {
      excluded: {
        product_id: productId,
        name,
        reason: "missing_source_url",
      },
    };
  }

  if (!isZozoSource) {
    return {
      excluded: {
        product_id: productId,
        name,
        reason: "unsupported_source",
      },
    };
  }

  return {
    item: {
      id: productId,
      name,
      source_url: resolvedSourceUrl,
      source_site,
      source_product_id,
      status,
    },
  };
}

export async function loadExtensionBulkSyncItems(): Promise<ExtensionBulkSyncItemsResult> {
  const listUrl = process.env.XANO_STOCK_MONITOR_PRODUCTS_URL;
  if (!listUrl) {
    throw new Error("XANO_STOCK_MONITOR_PRODUCTS_URL 未設定");
  }

  const [monitorData, mergedProducts] = await Promise.all([
    fetchXanoJson(listUrl, { revalidate: false }),
    fetchMergedProducts(),
  ]);

  const rawList = Array.isArray(monitorData)
    ? monitorData
    : Array.isArray((monitorData as { products?: unknown[] })?.products)
      ? (monitorData as { products: unknown[] }).products
      : [];

  const monitorProducts = normalizeStockMonitorProducts(monitorData);
  const mergedById = new Map<number, Record<string, unknown>>();
  const rawById = new Map<number, Record<string, unknown>>();

  for (const raw of mergedProducts) {
    if (!raw || typeof raw !== "object") {
      continue;
    }

    const id = Number((raw as Record<string, unknown>).id);
    if (Number.isFinite(id) && id > 0) {
      mergedById.set(id, raw as Record<string, unknown>);
    }
  }

  for (const rawItem of rawList) {
    if (!rawItem || typeof rawItem !== "object") {
      continue;
    }

    const id = Number((rawItem as Record<string, unknown>).id);
    if (Number.isFinite(id) && id > 0) {
      rawById.set(id, rawItem as Record<string, unknown>);
    }
  }

  const items: ExtensionBulkSyncItem[] = [];
  const excluded: ExtensionBulkSyncExcludedItem[] = [];
  let recoverableDraftCount = 0;

  for (const monitor of monitorProducts) {
    const productId = monitor.id;

    if (!Number.isFinite(productId) || productId <= 0) {
      excluded.push({
        product_id: productId || 0,
        name: getMonitorFallbackName(monitor),
        reason: "missing_product_id",
      });
      continue;
    }

    const mergedRaw = mergedById.get(productId);
    const monitorRaw = rawById.get(productId);
    const raw = {
      ...(monitorRaw ?? {}),
      ...(mergedRaw ?? {}),
      id: productId,
      name: monitor.name,
      name_zh: monitor.name_zh,
      name_jp: monitor.name_jp,
      source_url: mergedRaw?.source_url ?? monitorRaw?.source_url ?? monitor.source_url,
      source_site: mergedRaw?.source_site ?? monitorRaw?.source_site ?? monitor.source_site,
      check_status:
        mergedRaw?.check_status ?? monitorRaw?.check_status ?? monitor.check_status,
      status: mergedRaw?.status ?? monitorRaw?.status ?? "published",
    } as Record<string, unknown>;

    const result = classifyExtensionSyncProduct(productId, raw);
    if ("item" in result) {
      items.push(result.item);
      if (result.item.recoverable_draft) {
        recoverableDraftCount += 1;
      }
    } else {
      excluded.push(result.excluded);
    }
  }

  return {
    items,
    excluded,
    total_monitor_products: monitorProducts.length,
    syncable_count: items.length,
    excluded_count: excluded.length,
    recoverable_draft_count: recoverableDraftCount,
  };
}

function getMonitorFallbackName(monitor: {
  name: string;
  name_zh?: string;
  name_jp?: string;
}): string {
  return monitor.name_zh || monitor.name || monitor.name_jp || "未命名商品";
}
