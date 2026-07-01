import {
  extractSyncModeVariantStock,
  isZozoProductPage,
  scrapeZozoProductPage,
} from "./scrape-zozo-page";
import { detectSourceSite } from "./detect-source-site";
import type { BackgroundMessage, BackgroundResponse } from "./types";

const IMPORT_BUTTON_ID = "jgo-import-button";
const SYNC_BUTTON_ID = "jgo-sync-button";
const TOAST_ID = "jgo-import-toast";
const SYNC_TIMEOUT_MS = 5000;
const SYNC_TIMEOUT_MESSAGE = "同步逾時，請重新整理頁面後再試";

function showToast(message: string, type: "success" | "error" | "loading") {
  let toast = document.getElementById(TOAST_ID);

  if (!toast) {
    toast = document.createElement("div");
    toast.id = TOAST_ID;
    toast.className = "jgo-toast";
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.dataset.type = type;
  toast.classList.add("jgo-toast-visible");

  if (type !== "loading") {
    window.setTimeout(() => {
      toast?.classList.remove("jgo-toast-visible");
    }, 4000);
  }
}

function sendBackgroundMessage(message: BackgroundMessage): Promise<BackgroundResponse> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: BackgroundResponse | undefined) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      if (!response) {
        reject(new Error("擴充功能未回應，請重新載入擴充功能後再試"));
        return;
      }

      resolve(response);
    });
  });
}

function parseSyncProductId(): number | null {
  const hashMatch = window.location.hash.match(/jgo-sync=(\d+)/);
  if (hashMatch) {
    return Number(hashMatch[1]);
  }

  const params = new URLSearchParams(window.location.search);
  const queryValue = params.get("jgo_sync");
  if (queryValue && /^\d+$/.test(queryValue)) {
    return Number(queryValue);
  }

  return null;
}

function isSyncMode(): boolean {
  return parseSyncProductId() !== null;
}

function createSyncTimeoutError(): Error {
  return new Error("SYNC_TIMEOUT");
}

function remainingSyncMs(deadline: number): number {
  return Math.max(0, deadline - Date.now());
}

function assertSyncNotTimedOut(deadline: number): void {
  if (Date.now() > deadline) {
    throw createSyncTimeoutError();
  }
}

function waitForNextTick(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

async function runStockSync(productId: number, button?: HTMLButtonElement | null) {
  if (button) {
    button.disabled = true;
  }

  showToast("正在同步庫存...", "loading");
  const deadline = Date.now() + SYNC_TIMEOUT_MS;

  try {
    assertSyncNotTimedOut(deadline);
    await waitForNextTick();
    assertSyncNotTimedOut(deadline);

    const { variant_stock: variantStock, current_jpy_price: currentJpyPrice } =
      extractSyncModeVariantStock();

    console.log("FINAL VARIANT STOCK", variantStock);
    if (currentJpyPrice) {
      console.log("SYNC CURRENT JPY PRICE", currentJpyPrice);
    }

    assertSyncNotTimedOut(deadline);

    if (variantStock.length === 0) {
      alert("沒有抓到庫存資料");
      showToast("沒有抓到庫存資料", "error");
      return;
    }

    const response = await Promise.race([
      sendBackgroundMessage({
        type: "SYNC_PRODUCT_STOCK",
        payload: {
          product_id: productId,
          variant_stock: variantStock,
          ...(currentJpyPrice && currentJpyPrice > 0
            ? { current_jpy_price: currentJpyPrice }
            : {}),
        },
      }),
      new Promise<BackgroundResponse>((_, reject) => {
        window.setTimeout(() => reject(createSyncTimeoutError()), remainingSyncMs(deadline));
      }),
    ]);

    if (!response.ok) {
      showToast(response.error || "同步庫存失敗", "error");
      return;
    }

    const message =
      "data" in response && response.data?.message
        ? response.data.message
        : `已同步 ${response.data?.synced_count ?? variantStock.length} 個尺寸庫存`;

    showToast(message, "success");
  } catch (error) {
    if (error instanceof Error && error.message === "SYNC_TIMEOUT") {
      alert(SYNC_TIMEOUT_MESSAGE);
      showToast(SYNC_TIMEOUT_MESSAGE, "error");
      return;
    }

    const message = error instanceof Error ? error.message : "同步庫存失敗";
    showToast(message, "error");
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

async function handleImportClick(button: HTMLButtonElement) {
  button.disabled = true;
  showToast("正在抓取庫存並匯入 J-GO...", "loading");

  try {
    const scraped = await scrapeZozoProductPage();
    const source_url = window.location.href;
    const payload = {
      ...scraped,
      source_url,
      source_site: detectSourceSite(source_url),
    };

    console.log("SCRAPED PRODUCT", payload);
    console.log("IMPORT PAYLOAD IMAGES LENGTH", payload.images.length);
    console.log("IMPORT PAYLOAD COLOR_IMAGES", payload.color_images);
    console.log("FINAL COLORS", payload.colors.split(",").filter(Boolean));
    console.log("FINAL SIZES", payload.sizes.split(",").filter(Boolean));
    console.log("FINAL IMAGES", payload.images);
    console.log("FINAL VARIANT STOCK", payload.variant_stock);

    const response = await sendBackgroundMessage({
      type: "IMPORT_PRODUCT",
      payload,
    });

    if (!response.ok) {
      showToast(response.error || "匯入失敗", "error");
      return;
    }

    showToast("商品已建立為 Draft", "success");
  } catch (error) {
    const message = error instanceof Error ? error.message : "匯入失敗";
    showToast(message, "error");
  } finally {
    button.disabled = false;
  }
}

function mountImportButton() {
  if (!isZozoProductPage() || isSyncMode() || document.getElementById(IMPORT_BUTTON_ID)) {
    return;
  }

  const button = document.createElement("button");
  button.id = IMPORT_BUTTON_ID;
  button.type = "button";
  button.className = "jgo-import-button";
  button.textContent = "匯入 J-GO";
  button.addEventListener("click", () => {
    void handleImportClick(button);
  });

  document.body.appendChild(button);
}

function mountSyncButton(productId: number) {
  if (!isZozoProductPage()) {
    return;
  }

  let button = document.getElementById(SYNC_BUTTON_ID) as HTMLButtonElement | null;

  if (!button) {
    button = document.createElement("button");
    button.id = SYNC_BUTTON_ID;
    button.type = "button";
    button.className = "jgo-sync-button";
    document.body.appendChild(button);
  }

  button.textContent = "同步目前顏色庫存";
  button.dataset.productId = String(productId);
  button.onclick = () => {
    void runStockSync(productId, button);
  };
}

function init() {
  console.log("J-GO ZOZO PRODUCT PAGE", location.pathname);

  const syncProductId = parseSyncProductId();

  if (syncProductId) {
    mountSyncButton(syncProductId);
    return;
  }

  mountImportButton();

  const observer = new MutationObserver(() => {
    mountImportButton();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
