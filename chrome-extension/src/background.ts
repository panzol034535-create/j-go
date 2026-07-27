import {
  DEFAULT_API_BASE_URL,
  STORAGE_KEY_API_BASE_URL,
  type BackgroundMessage,
  type BackgroundResponse,
  type ExtensionBulkSyncProduct,
  type ImportProductPayload,
  type ImportProductResponse,
  type SyncProductStockPayload,
  type SyncProductStockResponse,
} from "./types";
import {
  cancelBulkStockSync,
  getBulkSyncProgress,
  getBulkSyncProgressFromStorage,
  resolveBulkScrapeResult,
  resumeBatchStockSync,
  startBatchStockSync,
} from "./bulk-stock-sync";
import type { ExtensionBulkSyncScrapePayload } from "./bulk-stock-sync-types";
import { resolveImportErrorMessage } from "./variant-create-errors";

async function getApiBaseUrl(): Promise<string> {
  const stored = await chrome.storage.sync.get(STORAGE_KEY_API_BASE_URL);
  const value = stored[STORAGE_KEY_API_BASE_URL];
  return typeof value === "string" && value.trim() ? value.trim().replace(/\/$/, "") : DEFAULT_API_BASE_URL;
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const responseText = await response.text();

  if (!responseText) {
    return {} as T;
  }

  try {
    return JSON.parse(responseText) as T;
  } catch {
    return {} as T;
  }
}

function sanitizeSyncProductStockPayload(
  payload: SyncProductStockPayload
): SyncProductStockPayload {
  const currentJpyPrice = payload.current_jpy_price;
  const roundedPrice = Math.round(Number(currentJpyPrice));
  const hasValidPrice = Number.isFinite(roundedPrice) && roundedPrice > 0;

  if (!hasValidPrice) {
    const { current_jpy_price: _ignored, ...rest } = payload;
    return rest;
  }

  return {
    ...payload,
    current_jpy_price: roundedPrice,
  };
}

async function importProduct(payload: ImportProductPayload): Promise<BackgroundResponse> {
  const apiBaseUrl = await getApiBaseUrl();

  try {
    const response = await fetch(`${apiBaseUrl}/api/import-product`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await readJsonResponse<ImportProductResponse>(response);

    if (!response.ok) {
      const failedVariants = Array.isArray(data.failedVariants) ? data.failedVariants : [];
      return {
        ok: false,
        error: resolveImportErrorMessage(data),
        failedVariants,
      };
    }

    return { ok: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : "網路錯誤";
    return { ok: false, error: message };
  }
}

async function syncProductStock(payload: SyncProductStockPayload): Promise<BackgroundResponse> {
  const apiBaseUrl = await getApiBaseUrl();
  const sanitizedPayload = sanitizeSyncProductStockPayload(payload);

  try {
    const response = await fetch(`${apiBaseUrl}/api/admin-sync-product-stock`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(sanitizedPayload),
    });

    const data = await readJsonResponse<SyncProductStockResponse>(response);

    if (!response.ok) {
      return {
        ok: false,
        error: data.error || `同步庫存失敗（HTTP ${response.status}）`,
      };
    }

    return { ok: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : "網路錯誤";
    return { ok: false, error: message };
  }
}

type StockSyncItem = {
  id?: number;
  product_id?: number;
  name: string;
  source_url: string;
};

function normalizeStockSyncItems(items: unknown): ExtensionBulkSyncProduct[] {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => {
      const entry = item as StockSyncItem;
      const id = Number(entry.product_id ?? entry.id);
      const name = typeof entry.name === "string" ? entry.name : "";
      const source_url = typeof entry.source_url === "string" ? entry.source_url : "";

      if (!Number.isFinite(id) || id <= 0 || !source_url) {
        return null;
      }

      return { id, name, source_url };
    })
    .filter((item): item is ExtensionBulkSyncProduct => item !== null);
}

async function handleAdminBridgeMessage(message: {
  adminType: string;
  products?: ExtensionBulkSyncProduct[];
}): Promise<Record<string, unknown>> {
  if (message.adminType === "JGO_EXTENSION_BULK_SYNC_STATUS") {
    const progress = getBulkSyncProgress() ?? (await getBulkSyncProgressFromStorage());
    return {
      type: "JGO_EXTENSION_BULK_SYNC_PROGRESS",
      progress,
    };
  }

  if (message.adminType === "JGO_EXTENSION_BULK_SYNC_CANCEL") {
    cancelBulkStockSync();
    return { type: "JGO_EXTENSION_BULK_SYNC_CANCELLED" };
  }

  return { type: "JGO_EXTENSION_BULK_SYNC_ERROR", error: "Unknown admin bridge message" };
}

const NOTIFICATION_ONLY_MESSAGE_TYPES = new Set([
  "JGO_STOCK_SYNC_PROGRESS",
  "BULK_SYNC_PROGRESS",
]);

type RuntimeMessage = BackgroundMessage & {
  type: string;
  adminType?: string;
  products?: ExtensionBulkSyncProduct[];
  items?: StockSyncItem[];
  payload?: ExtensionBulkSyncScrapePayload;
  product_id?: number;
  adminTabId?: number;
};

chrome.runtime.onMessage.addListener(
  (
    message: RuntimeMessage,
    sender,
    sendResponse: (response: BackgroundResponse | Record<string, unknown>) => void
  ) => {
    const type = message?.type;

    if (!type || NOTIFICATION_ONLY_MESSAGE_TYPES.has(type)) {
      return false;
    }

    let responded = false;

    const respond = (response: BackgroundResponse | Record<string, unknown>) => {
      if (responded) {
        return;
      }

      responded = true;

      try {
        sendResponse(response);
      } catch (error) {
        console.error("[J-GO] sendResponse failed", error);
      }
    };

    if (type === "JGO_START_STOCK_SYNC" || type === "JGO_RESUME_STOCK_SYNC") {
      try {
        const items = normalizeStockSyncItems(message.items);
        const explicitAdminTabId = Number(message.adminTabId);
        console.log("JGO EXT BG START RECEIVED", type, items.length);

        if (type === "JGO_START_STOCK_SYNC" && items.length === 0) {
          respond({ success: false, error: "沒有可同步商品" });
          return true;
        }

        const adminTabId =
          Number.isFinite(explicitAdminTabId) && explicitAdminTabId > 0
            ? explicitAdminTabId
            : sender.tab?.id;

        respond({ success: true, accepted: true });

        setTimeout(() => {
          const task =
            type === "JGO_RESUME_STOCK_SYNC"
              ? resumeBatchStockSync(adminTabId)
              : startBatchStockSync(items, adminTabId);

          void task.catch((error) => {
            console.error("JGO EXT BG LOOP START FAILED", error);
          });
        }, 0);
      } catch (error) {
        respond({ success: false, error: String(error) });
      }

      return true;
    }

    void (async () => {
      try {
        if (type === "GET_ADMIN_TAB_ID") {
          respond({ tabId: sender.tab?.id ?? null });
          return;
        }

        if (type === "GET_API_BASE_URL") {
          const apiBaseUrl = await getApiBaseUrl();
          respond({ ok: true, apiBaseUrl });
          return;
        }

        if (type === "IMPORT_PRODUCT") {
          respond(await importProduct(message.payload));
          return;
        }

        if (type === "SYNC_PRODUCT_STOCK") {
          respond(await syncProductStock(message.payload));
          return;
        }

        if (type === "ADMIN_BRIDGE") {
          respond(
            await handleAdminBridgeMessage({
              adminType: String(message.adminType || ""),
              products: message.products,
            })
          );
          return;
        }

        if (type === "BULK_SYNC_SCRAPE_RESULT" && message.payload && message.product_id) {
          resolveBulkScrapeResult(message.product_id, message.payload);
          respond({ ok: true });
          return;
        }

        respond({ ok: false, error: "Unknown message type" });
      } catch (error) {
        respond({ ok: false, error: String(error) });
      }
    })();

    return true;
  }
);
