import {
  DEFAULT_API_BASE_URL,
  STORAGE_KEY_API_BASE_URL,
  type BackgroundMessage,
  type BackgroundResponse,
  type ImportProductPayload,
  type ImportProductResponse,
  type SyncProductStockPayload,
  type SyncProductStockResponse,
} from "./types";

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
      return {
        ok: false,
        error: data.error || `匯入失敗（HTTP ${response.status}）`,
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

  try {
    const response = await fetch(`${apiBaseUrl}/api/admin-sync-product-stock`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
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

chrome.runtime.onMessage.addListener(
  (message: BackgroundMessage, _sender, sendResponse: (response: BackgroundResponse) => void) => {
    let responded = false;

    const respond = (response: BackgroundResponse) => {
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

    void (async () => {
      try {
        if (message.type === "GET_API_BASE_URL") {
          const apiBaseUrl = await getApiBaseUrl();
          respond({ ok: true, apiBaseUrl });
          return;
        }

        if (message.type === "IMPORT_PRODUCT") {
          respond(await importProduct(message.payload));
          return;
        }

        if (message.type === "SYNC_PRODUCT_STOCK") {
          respond(await syncProductStock(message.payload));
          return;
        }

        respond({ ok: false, error: "Unknown message type" });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        respond({ ok: false, error: errorMessage });
      }
    })();

    return true;
  }
);
