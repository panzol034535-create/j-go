import {
  loadBulkSyncSettings,
  randomDelayMs,
  type BulkSyncSettings,
} from "./bulk-sync-settings";
import {
  buildBulkSyncResultEntry,
  dedupeBulkSyncResultsByProductId,
  shouldReplaceBulkSyncResult,
} from "./bulk-sync-result-labels";
import type {
  BulkSyncResultDebug,
  ExtensionBulkSyncProduct,
  ExtensionBulkSyncPhase,
  ExtensionBulkSyncProgress,
  ExtensionBulkSyncScrapePayload,
  PersistedBulkSyncState,
} from "./bulk-stock-sync-types";
import type { BackgroundResponse, SyncProductStockPayload, SyncProductStockResponse } from "./types";

export const STORAGE_KEY_BULK_SYNC_STATE = "jgoBulkStockSyncState";
const BULK_ITEM_TIMEOUT_MS = 90_000;
const BULK_SCRAPE_RESULT_TIMEOUT_MS = 65_000;
const TAB_LOAD_TIMEOUT_MS = 30_000;
const API_POST_TIMEOUT_MS = 30_000;
const ACCESS_DENIED_MESSAGE =
  "ZOZO 暫時拒絕存取，請稍候 30～60 分鐘再同步。";

type BulkSyncState = {
  running: boolean;
  cancelRequested: boolean;
  progress: ExtensionBulkSyncProgress;
  adminTabId?: number;
  products: ExtensionBulkSyncProduct[];
  itemsInCurrentBatch: number;
};

type StartBatchOptions = {
  resume?: boolean;
};

let bulkSyncState: BulkSyncState | null = null;
let activeLoopPromise: Promise<ExtensionBulkSyncProgress> | null = null;

const pendingScrapeResolvers = new Map<
  number,
  {
    resolve: (payload: ExtensionBulkSyncScrapePayload | null) => void;
    timeoutId: ReturnType<typeof setTimeout>;
  }
>();

function nowMs(): number {
  return Date.now();
}

function createInitialProgress(total: number): ExtensionBulkSyncProgress {
  return {
    status: "running",
    total,
    completed: 0,
    success: 0,
    failed: 0,
    unpublished: 0,
    republished: 0,
    uncertain: 0,
    skipped: 0,
    currentIndex: 0,
    currentProductName: null,
    updatedAt: nowMs(),
    phase: "item_start",
    batchMessage: null,
    results: [],
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutError: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(timeoutError));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

async function sleepWithCancel(ms: number, phase: ExtensionBulkSyncPhase): Promise<boolean> {
  const stepMs = 1_000;
  let elapsed = 0;

  while (elapsed < ms) {
    if (!bulkSyncState || bulkSyncState.cancelRequested) {
      return false;
    }

    bulkSyncState.progress.phase = phase;
    bulkSyncState.progress.updatedAt = nowMs();
    await persistBulkSyncState();

    const remaining = ms - elapsed;
    const waitMs = Math.min(stepMs, remaining);
    await sleep(waitMs);
    elapsed += waitMs;
  }

  return true;
}

function buildBulkSyncUrl(sourceUrl: string, productId: number): string {
  const url = new URL(sourceUrl);
  url.hash = `jgo-bulk-sync=${productId}`;
  return url.toString();
}

function dedupeBulkSyncProductsById(
  products: ExtensionBulkSyncProduct[]
): ExtensionBulkSyncProduct[] {
  const seenProductIds = new Set<number>();
  const uniqueProducts: ExtensionBulkSyncProduct[] = [];

  for (const product of products) {
    if (!product?.id || seenProductIds.has(product.id)) {
      continue;
    }

    seenProductIds.add(product.id);
    uniqueProducts.push(product);
  }

  return uniqueProducts;
}

function getNextBulkSyncStartIndex(
  products: ExtensionBulkSyncProduct[],
  progress: ExtensionBulkSyncProgress
): number {
  const completedProductIds = new Set(
    progress.results
      .map((entry) => entry.product_id)
      .filter((productId) => Number.isFinite(productId))
  );

  const nextIndex = products.findIndex((product) => !completedProductIds.has(product.id));
  if (nextIndex >= 0) {
    return nextIndex;
  }

  return Math.min(Math.max(progress.currentIndex + 1, 0), products.length);
}

function ensureBulkSyncResultsForEveryProduct(
  progress: ExtensionBulkSyncProgress,
  products: ExtensionBulkSyncProduct[]
): void {
  for (const product of products) {
    if (hasBulkResultForProduct(progress, product.id)) {
      continue;
    }

    recordBulkResult(progress, product, {
      success: true,
      action: "uncertain",
      reason: "item_incomplete",
      debug: {
        stage: "finalize",
        note: "bulk loop finished without a result for this product",
      },
    });
  }
}

function toPersistedState(state: BulkSyncState): PersistedBulkSyncState {
  return {
    running: state.running,
    cancelRequested: state.cancelRequested,
    adminTabId: state.adminTabId,
    products: state.products,
    itemsInCurrentBatch: state.itemsInCurrentBatch,
    progress: state.progress,
    updatedAt: state.progress.updatedAt,
  };
}

async function persistBulkSyncState(): Promise<void> {
  if (!bulkSyncState) {
    return;
  }

  bulkSyncState.progress.updatedAt = nowMs();

  try {
    await chrome.storage.local.set({
      [STORAGE_KEY_BULK_SYNC_STATE]: toPersistedState(bulkSyncState),
    });
  } catch (error) {
    console.error("JGO EXT BG STORAGE WRITE FAILED", error);
  }
}

async function clearPersistedBulkSyncState(): Promise<void> {
  try {
    await chrome.storage.local.remove(STORAGE_KEY_BULK_SYNC_STATE);
  } catch (error) {
    console.error("JGO EXT BG STORAGE CLEAR FAILED", error);
  }
}

export async function loadPersistedBulkSyncState(): Promise<PersistedBulkSyncState | null> {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY_BULK_SYNC_STATE);
    const value = stored[STORAGE_KEY_BULK_SYNC_STATE];
    if (!value || typeof value !== "object") {
      return null;
    }

    return value as PersistedBulkSyncState;
  } catch (error) {
    console.error("JGO EXT BG STORAGE READ FAILED", error);
    return null;
  }
}

function broadcastBulkSyncProgress(progress: ExtensionBulkSyncProgress): void {
  const payload = {
    type: "JGO_STOCK_SYNC_PROGRESS",
    progress,
  };

  void chrome.runtime.sendMessage(payload).catch(() => {
    // Admin page may read progress via storage polling when no runtime listener exists.
  });

  const adminTabId = bulkSyncState?.adminTabId;
  if (adminTabId) {
    void chrome.tabs.sendMessage(adminTabId, payload).catch(() => {
      // Content script may be unloaded; progress is still persisted for polling.
    });
  }
}

async function publishProgress(phase?: ExtensionBulkSyncPhase): Promise<void> {
  if (!bulkSyncState) {
    return;
  }

  if (phase) {
    bulkSyncState.progress.phase = phase;
  }

  bulkSyncState.progress.updatedAt = nowMs();
  await persistBulkSyncState();
  broadcastBulkSyncProgress(bulkSyncState.progress);
}

function isAccessDeniedPayload(
  payload: ExtensionBulkSyncScrapePayload | null
): payload is ExtensionBulkSyncScrapePayload {
  return Boolean(
    payload?.access_denied ||
      payload?.reason === "zozo_access_denied" ||
      payload?.reason === "access_denied"
  );
}

function stopBatchForAccessDenied(
  progress: ExtensionBulkSyncProgress
): ExtensionBulkSyncProgress {
  progress.status = "paused";
  progress.pauseReason = "zozo_access_denied";
  progress.message = ACCESS_DENIED_MESSAGE;
  progress.batchMessage = null;
  progress.currentProductName = null;
  progress.phase = "paused";
  progress.updatedAt = nowMs();

  if (bulkSyncState) {
    bulkSyncState.running = false;
  }

  void persistBulkSyncState().then(() => {
    broadcastBulkSyncProgress(progress);
  });

  console.log("JGO EXT BG PAUSED", progress.pauseReason, progress.completed);

  return progress;
}

async function getApiBaseUrl(): Promise<string> {
  const stored = await chrome.storage.sync.get("jgoApiBaseUrl");
  const value = stored.jgoApiBaseUrl;
  return typeof value === "string" && value.trim()
    ? value.trim().replace(/\/$/, "")
    : "http://localhost:3000";
}

async function postExtensionSyncResult(
  payload: ExtensionBulkSyncScrapePayload
): Promise<BackgroundResponse> {
  const apiBaseUrl = await getApiBaseUrl();
  const variantStock = payload.variant_stock || [];

  console.log("JGO EXT VARIANT STOCK", {
    product_id: payload.product_id,
    variants: variantStock.map((variant) => ({
      color: variant.color,
      size: variant.size,
      stock_status: variant.stock_status,
    })),
  });

  const body: SyncProductStockPayload & {
    product_name: string;
    source_status: NonNullable<ExtensionBulkSyncScrapePayload["source_status"]>;
    access_denied?: boolean;
  } = {
    product_id: payload.product_id,
    product_name: payload.product_name || `商品 #${payload.product_id}`,
    source_status: payload.source_status || "available",
    variant_stock: variantStock,
    ...(payload.access_denied ? { access_denied: true } : {}),
    ...(payload.current_jpy_price && payload.current_jpy_price > 0
      ? { current_jpy_price: payload.current_jpy_price }
      : {}),
  };

  try {
    const response = await withTimeout(
      fetch(`${apiBaseUrl}/api/admin-sync-product-stock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      API_POST_TIMEOUT_MS,
      "api_timeout"
    );

    const data = (await response.json()) as SyncProductStockResponse;
    if (!response.ok) {
      return { ok: false, error: data.error || `同步失敗（HTTP ${response.status}）` };
    }

    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "網路錯誤",
    };
  }
}

function findBulkResultIndex(
  progress: ExtensionBulkSyncProgress,
  productId: number
): number {
  return progress.results.findIndex((entry) => entry.product_id === productId);
}

function hasBulkResultForProduct(
  progress: ExtensionBulkSyncProgress,
  productId: number
): boolean {
  return findBulkResultIndex(progress, productId) >= 0;
}

function adjustBulkProgressCounters(
  progress: ExtensionBulkSyncProgress,
  entry: ExtensionBulkSyncProgress["results"][number],
  delta: 1 | -1
): void {
  if (entry.action === "updated" && entry.success) {
    progress.success += delta;
    return;
  }

  if (entry.action === "republished" && entry.success) {
    progress.success += delta;
    progress.republished += delta;
    return;
  }

  if (entry.action === "unpublished" && entry.success) {
    progress.unpublished += delta;
    return;
  }

  if (entry.action === "uncertain" && entry.success) {
    progress.uncertain += delta;
    return;
  }

  if (entry.action === "skipped") {
    progress.skipped += delta;
    return;
  }

  progress.failed += delta;
}

function normalizeStoredBulkResults(progress: ExtensionBulkSyncProgress): void {
  progress.results = progress.results.map((entry) => {
    const resolved = buildBulkSyncResultEntry({
      action: entry.action,
      success: entry.success,
      reason: entry.reason,
      message: entry.message,
    });

    return {
      ...entry,
      action: resolved.action,
      success: resolved.success,
      reason: resolved.reason,
      message: resolved.message,
    };
  });
}

function recalculateBulkProgressCounters(progress: ExtensionBulkSyncProgress): void {
  normalizeStoredBulkResults(progress);
  progress.results = dedupeBulkSyncResultsByProductId(progress.results);
  progress.completed = progress.results.length;
  progress.success = 0;
  progress.failed = 0;
  progress.unpublished = 0;
  progress.republished = 0;
  progress.uncertain = 0;
  progress.skipped = 0;

  for (const entry of progress.results) {
    adjustBulkProgressCounters(progress, entry, 1);
  }
}

function recordBulkResult(
  progress: ExtensionBulkSyncProgress,
  product: ExtensionBulkSyncProduct,
  options: {
    success: boolean;
    action: string;
    reason?: string;
    message?: string;
    debug?: BulkSyncResultDebug;
  }
): boolean {
  const resolved = buildBulkSyncResultEntry({
    action: options.action,
    success: options.success,
    reason: options.reason,
    message: options.message,
  });

  const nextEntry: ExtensionBulkSyncProgress["results"][number] = {
    product_id: product.id,
    name: product.name,
    success: resolved.success,
    action: resolved.action,
    reason: resolved.reason,
    message: resolved.message,
    debug: options.debug,
  };

  const existingIndex = findBulkResultIndex(progress, product.id);

  if (existingIndex >= 0) {
    const existing = progress.results[existingIndex];

    if (!shouldReplaceBulkSyncResult(existing.reason, resolved.reason)) {
      return false;
    }

    adjustBulkProgressCounters(progress, existing, -1);
    progress.results[existingIndex] = nextEntry;
    adjustBulkProgressCounters(progress, nextEntry, 1);
    return true;
  }

  progress.results.push(nextEntry);
  progress.completed += 1;
  adjustBulkProgressCounters(progress, nextEntry, 1);
  return true;
}

function waitForBulkScrapeResult(productId: number): Promise<ExtensionBulkSyncScrapePayload | null> {
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      pendingScrapeResolvers.delete(productId);
      resolve(null);
    }, BULK_SCRAPE_RESULT_TIMEOUT_MS);

    pendingScrapeResolvers.set(productId, { resolve, timeoutId });
  });
}

export function resolveBulkScrapeResult(
  productId: number,
  payload: ExtensionBulkSyncScrapePayload
): void {
  const pending = pendingScrapeResolvers.get(productId);
  if (!pending) {
    return;
  }

  clearTimeout(pending.timeoutId);
  pendingScrapeResolvers.delete(productId);
  pending.resolve(payload);
}

async function waitForTabComplete(tabId: number, timeoutMs: number): Promise<boolean> {
  const existing = await chrome.tabs.get(tabId).catch(() => null);
  if (existing?.status === "complete") {
    return true;
  }

  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(false);
    }, timeoutMs);

    const listener: Parameters<typeof chrome.tabs.onUpdated.addListener>[0] = (
      updatedTabId,
      changeInfo
    ) => {
      if (updatedTabId !== tabId || changeInfo.status !== "complete") {
        return;
      }

      clearTimeout(timeoutId);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(true);
    };

    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function scrapeProductInTab(
  product: ExtensionBulkSyncProduct
): Promise<ExtensionBulkSyncScrapePayload | null> {
  const tab = await chrome.tabs.create({
    url: buildBulkSyncUrl(product.source_url, product.id),
    active: false,
  });

  if (!tab.id) {
    return null;
  }

  const tabId = tab.id;

  try {
    const loaded = await waitForTabComplete(tabId, TAB_LOAD_TIMEOUT_MS);
    if (!loaded) {
      console.log("JGO EXT BG TAB LOAD TIMEOUT", product.id);
      return null;
    }

    return await waitForBulkScrapeResult(product.id);
  } finally {
    try {
      await chrome.tabs.remove(tabId);
    } catch {
      // tab may already be closed
    }
  }
}

async function processSingleProduct(
  product: ExtensionBulkSyncProduct
): Promise<{
  recorded: boolean;
  accessDenied: boolean;
}> {
  await publishProgress("scraping");

  const scrapeResult = await scrapeProductInTab(product);

  if (isAccessDeniedPayload(scrapeResult)) {
    console.log("JGO EXT BG ACCESS DENIED", product.id);
    return { recorded: false, accessDenied: true };
  }

  if (!scrapeResult) {
    recordBulkResult(bulkSyncState!.progress, product, {
      success: false,
      action: "failed",
      reason: "source_timeout",
      debug: {
        stage: "scrape",
        product_id: product.id,
        source_url: product.source_url,
      },
    });
    console.log("EXTENSION BULK ITEM DONE", product.id, "uncertain", "source_timeout");
    return { recorded: true, accessDenied: false };
  }

  if (!scrapeResult.source_status) {
    recordBulkResult(bulkSyncState!.progress, product, {
      success: false,
      action: "failed",
      reason: scrapeResult.reason || "invalid_scrape_result",
      message: scrapeResult.message,
      debug: {
        stage: "scrape",
        scrape_reason: scrapeResult.reason,
        access_denied: scrapeResult.access_denied ?? false,
        variant_count: scrapeResult.variant_stock?.length ?? 0,
        ...(scrapeResult.debug || {}),
      },
    });
    console.log("EXTENSION BULK ITEM DONE", product.id, "uncertain", scrapeResult.reason);
    return { recorded: true, accessDenied: false };
  }

  await publishProgress("syncing");

  const apiResult = await postExtensionSyncResult({
    ...scrapeResult,
    product_id: product.id,
    product_name: product.name,
  });

  if (!apiResult.ok) {
    recordBulkResult(bulkSyncState!.progress, product, {
      success: false,
      action: "failed",
      reason: apiResult.error || "api_failed",
      debug: {
        stage: "api",
        error: apiResult.error,
        source_status: scrapeResult.source_status,
        variant_count: scrapeResult.variant_stock?.length ?? 0,
        ...(scrapeResult.debug || {}),
      },
    });
    console.log("EXTENSION BULK ITEM DONE", product.id, "failed", apiResult.error);
    return { recorded: true, accessDenied: false };
  }

  const action = apiResult.data?.action || "updated";

  recordBulkResult(bulkSyncState!.progress, product, {
    success: true,
    action,
    reason: scrapeResult.reason || apiResult.data?.reason || scrapeResult.source_status,
    message: scrapeResult.message || apiResult.data?.message,
    debug:
      action === "uncertain" || scrapeResult.debug
        ? {
            stage: "api",
            source_status: scrapeResult.source_status,
            api_reason: apiResult.data?.reason,
            scrape_reason: scrapeResult.reason,
            ...(scrapeResult.debug || {}),
          }
        : undefined,
  });
  console.log("EXTENSION BULK ITEM DONE", product.id, action, scrapeResult.source_status);

  return { recorded: true, accessDenied: false };
}

async function pauseBetweenBatches(
  progress: ExtensionBulkSyncProgress,
  settings: BulkSyncSettings
): Promise<boolean> {
  const pauseMs = randomDelayMs(settings.batchPauseMinMs, settings.batchPauseMaxMs);
  const pauseMinutes = Math.max(1, Math.round(pauseMs / 60_000));

  progress.batchMessage = `已完成一批 ${settings.batchSize} 件，休息約 ${pauseMinutes} 分鐘後繼續...`;
  progress.phase = "batch_pause";
  await publishProgress("batch_pause");

  console.log("JGO EXT BG ITEM DELAY START", "batch_pause", pauseMs);
  const continued = await sleepWithCancel(pauseMs, "batch_pause");
  console.log("JGO EXT BG ITEM DELAY END", "batch_pause");

  progress.batchMessage = null;
  await publishProgress("item_start");

  return continued;
}

async function delayBeforeNextItem(
  product: ExtensionBulkSyncProduct,
  settings: BulkSyncSettings
): Promise<boolean> {
  if (!settings.slowSyncMode) {
    return true;
  }

  const delayMs = randomDelayMs(settings.itemDelayMinMs, settings.itemDelayMaxMs);
  console.log("JGO EXT BG ITEM DELAY START", product.id, delayMs);
  const continued = await sleepWithCancel(delayMs, "item_delay");
  console.log("JGO EXT BG ITEM DELAY END", product.id);
  return continued;
}

async function runBulkSyncLoop(options: {
  products: ExtensionBulkSyncProduct[];
  adminTabId?: number;
  startIndex: number;
  initialProgress?: ExtensionBulkSyncProgress;
  itemsInCurrentBatch?: number;
}): Promise<ExtensionBulkSyncProgress> {
  const { adminTabId } = options;
  const products = dedupeBulkSyncProductsById(options.products);
  const safeStartIndex = Math.min(Math.max(options.startIndex, 0), products.length);
  const progress =
    options.initialProgress ??
    createInitialProgress(products.length);

  progress.total = products.length;
  progress.status = "running";
  progress.phase = "item_start";
  progress.updatedAt = nowMs();
  recalculateBulkProgressCounters(progress);

  bulkSyncState = {
    running: true,
    cancelRequested: false,
    progress,
    adminTabId,
    products,
    itemsInCurrentBatch: options.itemsInCurrentBatch ?? 0,
  };

  await persistBulkSyncState();
  broadcastBulkSyncProgress(progress);

  const settings = await loadBulkSyncSettings();
  console.log("JGO EXT BG LOOP SETTINGS", settings, "startIndex", safeStartIndex);

  for (let index = safeStartIndex; index < products.length; index += 1) {
    const product = products[index];

    if (hasBulkResultForProduct(progress, product.id)) {
      console.log("JGO EXT BG ITEM SKIP COMPLETED", index, product.id);
      progress.currentIndex = index;
      await publishProgress("item_done");
      continue;
    }

    console.log(
      "JGO EXT BG LOOP TICK",
      index,
      bulkSyncState.progress.completed,
      bulkSyncState.progress.total
    );

    if (!bulkSyncState || bulkSyncState.cancelRequested) {
      progress.status = "cancelled";
      progress.phase = "cancelled";
      bulkSyncState!.running = false;
      await persistBulkSyncState();
      broadcastBulkSyncProgress(progress);
      return progress;
    }

    bulkSyncState.progress.currentIndex = index;
    bulkSyncState.progress.currentProductName = product.name;
    bulkSyncState.progress.batchMessage = null;
    bulkSyncState.progress.phase = "item_start";
    await publishProgress("item_start");

    console.log("JGO EXT BG ITEM START", product.id, product.name, product.source_url);
    console.log("JGO EXT BG NEXT ITEM", index, product.id);

    let accessDenied = false;

    try {
      const itemResult = await withTimeout(
        processSingleProduct(product),
        BULK_ITEM_TIMEOUT_MS,
        "item_timeout"
      );

      if (itemResult.accessDenied) {
        accessDenied = true;
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unexpected_error";
      if (!hasBulkResultForProduct(progress, product.id)) {
        const normalizedReason =
          reason === "item_timeout"
            ? "item_timeout"
            : reason === "unexpected_error"
              ? "unexpected_exception"
              : reason;

        recordBulkResult(progress, product, {
          success: false,
          action: "failed",
          reason: normalizedReason,
          debug: {
            stage: "item",
            error: reason,
          },
        });
      }
      console.log("EXTENSION BULK ITEM DONE", product.id, "timeout_or_error", reason);
    } finally {
      if (!accessDenied && !hasBulkResultForProduct(progress, product.id)) {
        recordBulkResult(progress, product, {
          success: false,
          action: "failed",
          reason: "item_timeout",
          debug: {
            stage: "item",
            note: "item finished without recorded result",
          },
        });
      }

      if (!accessDenied) {
        progress.currentProductName = null;
        progress.currentIndex = index;
        progress.phase = "item_done";
        await publishProgress("item_done");
      }
    }

    if (accessDenied) {
      return stopBatchForAccessDenied(progress);
    }

    if (bulkSyncState.cancelRequested) {
      progress.status = "cancelled";
      progress.phase = "cancelled";
      bulkSyncState.running = false;
      await persistBulkSyncState();
      broadcastBulkSyncProgress(progress);
      return progress;
    }

    const hasMoreItems = index < products.length - 1;
    if (!hasMoreItems) {
      break;
    }

    bulkSyncState.itemsInCurrentBatch += 1;

    if (settings.slowSyncMode && bulkSyncState.itemsInCurrentBatch >= settings.batchSize) {
      const continued = await pauseBetweenBatches(progress, settings);
      if (!continued) {
        progress.status = "cancelled";
        progress.phase = "cancelled";
        bulkSyncState.running = false;
        await persistBulkSyncState();
        broadcastBulkSyncProgress(progress);
        return progress;
      }

      bulkSyncState.itemsInCurrentBatch = 0;
      continue;
    }

    const nextProduct = products[index + 1];
    const continued = await delayBeforeNextItem(nextProduct, settings);
    if (!continued) {
      progress.status = "cancelled";
      progress.phase = "cancelled";
      bulkSyncState.running = false;
      await persistBulkSyncState();
      broadcastBulkSyncProgress(progress);
      return progress;
    }
  }

  progress.status = "completed";
  progress.phase = "completed";
  progress.batchMessage = null;
  progress.currentProductName = null;
  ensureBulkSyncResultsForEveryProduct(progress, products);
  recalculateBulkProgressCounters(progress);
  if (bulkSyncState) {
    bulkSyncState.running = false;
  }

  await persistBulkSyncState();
  broadcastBulkSyncProgress(progress);
  await clearPersistedBulkSyncState();

  console.log(
    "EXTENSION BULK DONE",
    progress.completed,
    progress.success,
    progress.failed,
    progress.unpublished,
    progress.republished,
    progress.uncertain,
    progress.skipped
  );

  activeLoopPromise = null;
  return progress;
}

export function getBulkSyncProgress(): ExtensionBulkSyncProgress | null {
  if (bulkSyncState?.progress) {
    return bulkSyncState.progress;
  }

  return null;
}

export async function getBulkSyncProgressFromStorage(): Promise<ExtensionBulkSyncProgress | null> {
  if (bulkSyncState?.progress) {
    return bulkSyncState.progress;
  }

  const stored = await loadPersistedBulkSyncState();
  return stored?.progress ?? null;
}

export function cancelBulkStockSync(): void {
  if (bulkSyncState) {
    bulkSyncState.cancelRequested = true;
    void persistBulkSyncState();
  }
}

function canResumeStoredState(stored: PersistedBulkSyncState): boolean {
  return (
    stored.progress.status === "running" &&
    stored.progress.completed < stored.progress.total &&
    Array.isArray(stored.products) &&
    stored.products.length > 0
  );
}

export async function startBatchStockSync(
  products: ExtensionBulkSyncProduct[],
  adminTabId?: number,
  options: StartBatchOptions = {}
): Promise<ExtensionBulkSyncProgress> {
  const uniqueProducts = dedupeBulkSyncProductsById(products);
  console.log("JGO EXT BG LOOP START", uniqueProducts.length, options);

  if (activeLoopPromise && bulkSyncState?.running && !options.resume) {
    console.error("JGO EXT BG LOOP BLOCKED", "already running in memory");
    return activeLoopPromise;
  }

  const stored = await loadPersistedBulkSyncState();

  if (options.resume && stored && canResumeStoredState(stored)) {
    const storedProducts = dedupeBulkSyncProductsById(stored.products);
    const resumeStartIndex = getNextBulkSyncStartIndex(storedProducts, stored.progress);
    console.log("JGO EXT BG LOOP RESUME", resumeStartIndex, stored.progress.completed, stored.progress.total);
    activeLoopPromise = runBulkSyncLoop({
      products: storedProducts,
      adminTabId: adminTabId ?? stored.adminTabId,
      startIndex: resumeStartIndex,
      initialProgress: stored.progress,
      itemsInCurrentBatch: stored.itemsInCurrentBatch ?? 0,
    });
    return activeLoopPromise;
  }

  if (!options.resume && stored && canResumeStoredState(stored)) {
    const storedProducts = dedupeBulkSyncProductsById(stored.products);
    const resumeStartIndex = getNextBulkSyncStartIndex(storedProducts, stored.progress);
    console.log(
      "JGO EXT BG LOOP RESUME EXISTING",
      resumeStartIndex,
      stored.progress.completed,
      stored.progress.total
    );
    activeLoopPromise = runBulkSyncLoop({
      products: storedProducts,
      adminTabId: adminTabId ?? stored.adminTabId,
      startIndex: resumeStartIndex,
      initialProgress: stored.progress,
      itemsInCurrentBatch: stored.itemsInCurrentBatch ?? 0,
    });
    return activeLoopPromise;
  }

  if (bulkSyncState?.running && bulkSyncState.progress.status === "running") {
    console.error("JGO EXT BG LOOP BLOCKED", "already running");
    throw new Error("已有進行中的批次同步");
  }

  await clearPersistedBulkSyncState();

  activeLoopPromise = runBulkSyncLoop({
    products: uniqueProducts,
    adminTabId,
    startIndex: 0,
    itemsInCurrentBatch: 0,
  });

  return activeLoopPromise;
}

export async function resumeBatchStockSync(adminTabId?: number): Promise<ExtensionBulkSyncProgress> {
  return startBatchStockSync([], adminTabId, { resume: true });
}

export const startBulkStockSync = startBatchStockSync;

void chrome.runtime.onStartup.addListener(() => {
  void loadPersistedBulkSyncState().then((stored) => {
    if (stored && canResumeStoredState(stored)) {
      console.log("JGO EXT BG STORED RUNNING JOB DETECTED", stored.progress.completed, stored.progress.total);
    }
  });
});
