type ExtensionSyncItem = {
  id: number;
  name: string;
  source_url: string;
};

let cachedAdminTabId: number | undefined;

function postToPage(payload: Record<string, unknown>): void {
  window.postMessage(payload, "*");
}

function requestAdminTabId(): Promise<number | undefined> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "GET_ADMIN_TAB_ID" }, (response) => {
      if (chrome.runtime.lastError) {
        resolve(cachedAdminTabId);
        return;
      }

      const tabId = Number((response as { tabId?: number } | undefined)?.tabId);
      if (Number.isFinite(tabId) && tabId > 0) {
        cachedAdminTabId = tabId;
        resolve(tabId);
        return;
      }

      resolve(cachedAdminTabId);
    });
  });
}

function sendRuntimeMessage<T extends Record<string, unknown>>(
  message: Record<string, unknown>
): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve((response ?? {}) as T);
    });
  });
}

function startStockSyncMessage(
  type: "JGO_START_STOCK_SYNC" | "JGO_RESUME_STOCK_SYNC",
  items: ExtensionSyncItem[]
): void {
  void requestAdminTabId().then((adminTabId) => {
    chrome.runtime.sendMessage(
      {
        type,
        items,
        adminTabId,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error("JGO EXT BG START ERROR", chrome.runtime.lastError);
          postToPage({
            type: "JGO_EXTENSION_BULK_SYNC_ERROR",
            error: chrome.runtime.lastError.message || "無法連線到 Extension background",
          });
          return;
        }

        console.log("JGO EXT BG START OK", type, response);
      }
    );
  });
}

window.addEventListener("message", (event) => {
  if (event.source !== window) {
    return;
  }

  const data = event.data as {
    type?: string;
    items?: ExtensionSyncItem[];
  };

  if (!data?.type) {
    return;
  }

  if (data.type === "JGO_EXTENSION_PING") {
    console.log("JGO EXT PING RECEIVED");
    postToPage({
      type: "JGO_EXTENSION_PONG",
      version: chrome.runtime.getManifest().version,
    });
    return;
  }

  if (data.type === "JGO_EXTENSION_BULK_SYNC_STATUS") {
    void sendRuntimeMessage<{ type?: string; progress?: Record<string, unknown> }>({
      type: "ADMIN_BRIDGE",
      adminType: "JGO_EXTENSION_BULK_SYNC_STATUS",
    })
      .then((response) => {
        if (response.type === "JGO_EXTENSION_BULK_SYNC_PROGRESS" && response.progress) {
          postToPage({
            type: "JGO_EXTENSION_BULK_SYNC_PROGRESS",
            progress: response.progress,
          });
        }
      })
      .catch((error) => {
        console.error("JGO EXT STATUS ERROR", error);
      });
    return;
  }

  if (data.type === "JGO_START_STOCK_SYNC") {
    const items = Array.isArray(data.items) ? data.items : [];
    console.log("JGO EXT START RECEIVED", items.length);

    if (items.length === 0) {
      postToPage({
        type: "JGO_EXTENSION_BULK_SYNC_ERROR",
        error: "沒有可同步商品",
      });
      return;
    }

    postToPage({
      type: "JGO_STOCK_SYNC_ACCEPTED",
      total: items.length,
    });
    console.log("JGO EXT SYNC START", items.length);
    startStockSyncMessage("JGO_START_STOCK_SYNC", items);
    return;
  }

  if (data.type === "JGO_RESUME_STOCK_SYNC") {
    console.log("JGO EXT RESUME RECEIVED");
    postToPage({
      type: "JGO_STOCK_SYNC_ACCEPTED",
      resumed: true,
    });
    startStockSyncMessage("JGO_RESUME_STOCK_SYNC", []);
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "BULK_SYNC_PROGRESS" || message?.type === "JGO_STOCK_SYNC_PROGRESS") {
    const progress = message.progress;
    console.log(
      "JGO ADMIN EXT PROGRESS",
      progress?.completed,
      progress?.total,
      progress?.status,
      progress?.currentProductName,
      progress?.phase,
      progress?.updatedAt
    );

    postToPage({
      type: "JGO_EXTENSION_BULK_SYNC_PROGRESS",
      progress,
    });

    if (
      progress?.status === "completed" ||
      progress?.status === "cancelled" ||
      progress?.status === "paused"
    ) {
      postToPage({
        type: "JGO_EXTENSION_BULK_SYNC_FINISHED",
        progress,
      });
    }
  }
});
