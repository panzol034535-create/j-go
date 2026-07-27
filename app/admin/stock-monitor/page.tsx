"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { STOREFRONT_CACHE_REFRESH_HINT } from "@/lib/products/store-product-visibility";
import type { StockMonitorProduct } from "@/lib/types/stock-monitor";
import { isRecoverableDraftProduct } from "@/lib/admin/stock-sync-policy";
import {
  countBulkSyncResultsByAction,
  dedupeBulkSyncResultsByProductId,
  getBulkSyncReasonLabel,
  normalizeBulkSyncResultEntry,
} from "@/lib/admin/extension-bulk-sync-result-labels";

type MonitorProduct = StockMonitorProduct & {
  recoverable_draft?: boolean;
};

type ToastState = {
  message: string;
  type: "success" | "error";
} | null;

function parseCheckedAt(value: string | number | null | undefined): Date | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const trimmed = String(value).trim();
  if (!trimmed) {
    return null;
  }

  if (/^\d+$/.test(trimmed)) {
    const timestamp = Number(trimmed);
    if (!Number.isFinite(timestamp)) {
      return null;
    }

    const date = new Date(timestamp);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value: string | number | null | undefined): string {
  const date = parseCheckedAt(value);
  if (!date) {
    return "—";
  }

  const parts = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);

  const getPart = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";

  const year = getPart("year");
  const month = getPart("month").padStart(2, "0");
  const day = getPart("day").padStart(2, "0");
  const dayPeriod = getPart("dayPeriod");
  const hour = getPart("hour").padStart(2, "0");
  const minute = getPart("minute").padStart(2, "0");

  return `${year}/${month}/${day} ${dayPeriod}${hour}:${minute}`;
}

function formatPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "—";
  }

  return `¥${Number(value).toLocaleString()}`;
}

function getProductName(product: StockMonitorProduct): string {
  return product.name_zh || product.name || product.name_jp || "未命名商品";
}

function getProductImage(product: StockMonitorProduct): string {
  return product.main_image || product.image || "";
}

function getCheckStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "pending":
      return "待檢查";
    case "ok":
    case "normal":
      return "正常";
    case "requires_browser_check":
      return "需瀏覽器檢查";
    case "mock":
      return "Mock 檢查";
    case "error":
      return "錯誤";
    case "needs_manual_review":
      return "需人工檢查";
    case "sync_uncertain":
      return "同步不確定";
    case "source_missing":
      return "來源不存在";
    case "discontinued":
      return "已下架";
    case "all_out_of_stock":
      return "全尺寸無庫存";
    default:
      return status || "—";
  }
}

function resolveLoadErrorMessage(
  response: Response,
  data: { error?: string }
): string {
  if (response.status === 429) {
    return "Xano 請求過於頻繁，請稍候 20 秒再重試。";
  }

  const message = data.error || "讀取失敗";
  if (message.includes("429")) {
    return "Xano 請求過於頻繁，請稍候 20 秒再重試。";
  }

  return message;
}

function getStockStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "in_stock":
    case "available":
      return "有庫存";
    case "out_of_stock":
      return "無庫存";
    case "unknown":
      return "未知";
    case "source_missing":
      return "來源不存在";
    case "discontinued":
      return "已下架";
    case "all_out_of_stock":
      return "全尺寸無庫存";
    default:
      return status || "—";
  }
}

function formatBulkSyncSummary(progress: BulkSyncProgress): string {
  const counts =
    progress.results.length > 0
      ? countBulkSyncResultsByAction(progress.results)
      : progress;

  const parts = [
    `成功 ${counts.success} 件`,
    `失敗 ${counts.failed} 件`,
    `自動下架 ${counts.unpublished} 件`,
  ];

  if (counts.republished > 0) {
    parts.push(`已恢復上架 ${counts.republished} 件`);
  }

  if (counts.uncertain > 0) {
    parts.push(`待人工檢查 ${counts.uncertain} 件`);
  }

  if (counts.unpublished > 0 || counts.republished > 0) {
    parts.push(STOREFRONT_CACHE_REFRESH_HINT);
  }

  return parts.join("，");
}

type BulkSyncProgress = {
  jobId?: string;
  total: number;
  completed: number;
  success: number;
  failed: number;
  unpublished: number;
  republished: number;
  uncertain: number;
  skipped: number;
  currentIndex?: number;
  currentProductName: string | null;
  updatedAt?: number;
  phase?: string;
  status: "running" | "completed" | "cancelled" | "paused";
  pauseReason?: string;
  message?: string;
  batchMessage?: string | null;
  results: Array<{
    product_id: number;
    name: string;
    success: boolean;
    action: string;
    reason?: string;
    message?: string;
    debug?: Record<string, unknown>;
  }>;
};

function getBulkSyncItemDisplay(item: BulkSyncProgress["results"][number]): {
  message: string;
  reason: string;
} {
  return {
    message: item.message?.trim() || getBulkSyncReasonLabel(item.reason),
    reason: item.reason || "unexpected_error",
  };
}

function renderBulkSyncResultSection(
  items: BulkSyncProgress["results"],
  options: {
    title: string;
    filterAction: string;
    borderClassName: string;
    bgClassName: string;
    textClassName: string;
    keyPrefix: string;
  }
) {
  const dedupedItems = dedupeBulkSyncResultsByProductId(
    items.map((item) => normalizeBulkSyncResultEntry(item))
  );
  const filtered = dedupedItems.filter((item) => item.action === options.filterAction);
  if (filtered.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 space-y-2">
      <p className="text-xs font-black tracking-widest text-neutral-400">{options.title}</p>
      {filtered.map((item) => {
        const display = getBulkSyncItemDisplay(item);

        return (
          <div
            key={`${options.keyPrefix}-${item.product_id}-${item.name}`}
            className={`rounded-2xl border px-3 py-2 text-xs ${options.borderClassName} ${options.bgClassName} ${options.textClassName}`}
          >
            <p className="font-black">
              #{item.product_id} {item.name}
            </p>
            <p className="mt-1 font-bold">{display.message}</p>
            <p className="mt-1 text-[10px] font-bold opacity-70" title={display.reason}>
              {display.reason}
            </p>
            {item.debug?.stockRootFound !== undefined ||
            item.debug?.variantRowCount !== undefined ||
            item.debug?.bodyTextSample ? (
              <p
                className="mt-1 text-[10px] font-bold opacity-60"
                title={String(item.debug?.bodyTextSample || "")}
              >
                {item.debug?.stockRootFound !== undefined
                  ? `stockRoot=${String(item.debug.stockRootFound)}`
                  : null}
                {item.debug?.variantRowCount !== undefined
                  ? ` rows=${String(item.debug.variantRowCount)}`
                  : null}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function getExtensionExcludeReasonLabel(reason: string): string {
  switch (reason) {
    case "missing_product_id":
      return "缺少商品 ID";
    case "already_draft":
      return "已是草稿 / 已下架";
    case "not_published":
      return "尚未發布";
    case "missing_source_url":
      return "缺少來源網址";
    case "unsupported_source":
      return "非 ZOZO 商品，無法用 Extension 同步";
    default:
      return reason || "未知原因";
  }
}

type ExtensionSyncMeta = {
  total_monitor_products: number;
  syncable_count: number;
  excluded_count: number;
  recoverable_draft_count: number;
  excluded: Array<{
    product_id: number;
    name: string;
    reason: string;
  }>;
};

const EXTENSION_PING_TIMEOUT_MS = 3_000;
const EXTENSION_START_TIMEOUT_MS = 5_000;
const EXTENSION_STUCK_AFTER_MS = 120_000;
const EXTENSION_STATUS_POLL_MS = 5_000;

function postExtensionMessage(payload: Record<string, unknown>): void {
  window.postMessage(payload, "*");
}

function waitForExtensionMessage(
  expectedTypes: string[],
  timeoutMs: number
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      window.removeEventListener("message", handler);
      reject(new Error("TIMEOUT"));
    }, timeoutMs);

    const handler = (event: MessageEvent) => {
      if (event.source !== window) {
        return;
      }

      const data = event.data as { type?: string; error?: string };
      if (!data?.type) {
        return;
      }

      if (data.type === "JGO_EXTENSION_BULK_SYNC_ERROR") {
        window.clearTimeout(timeoutId);
        window.removeEventListener("message", handler);
        reject(new Error(data.error || "Extension 批次同步失敗"));
        return;
      }

      if (expectedTypes.includes(data.type)) {
        window.clearTimeout(timeoutId);
        window.removeEventListener("message", handler);
        resolve(data as Record<string, unknown>);
      }
    };

    window.addEventListener("message", handler);
  });
}

async function pingExtension(): Promise<boolean> {
  console.log("JGO ADMIN EXT PING");
  postExtensionMessage({ type: "JGO_EXTENSION_PING" });

  try {
    const pong = await waitForExtensionMessage(["JGO_EXTENSION_PONG"], EXTENSION_PING_TIMEOUT_MS);
    console.log("JGO ADMIN EXT PONG", pong.version);
    return true;
  } catch {
    return false;
  }
}

function mapExtensionProgress(data: Record<string, unknown>): BulkSyncProgress {
  return {
    total: Number(data.total) || 0,
    completed: Number(data.completed) || 0,
    success: Number(data.success) || 0,
    failed: Number(data.failed) || 0,
    unpublished: Number(data.unpublished) || 0,
    republished: Number(data.republished) || 0,
    uncertain: Number(data.uncertain) || 0,
    skipped: Number(data.skipped) || 0,
    currentProductName: typeof data.currentProductName === "string" ? data.currentProductName : null,
    currentIndex: Number.isFinite(Number(data.currentIndex)) ? Number(data.currentIndex) : undefined,
    updatedAt: Number.isFinite(Number(data.updatedAt)) ? Number(data.updatedAt) : undefined,
    phase: typeof data.phase === "string" ? data.phase : undefined,
    status:
      data.status === "completed"
        ? "completed"
        : data.status === "cancelled"
          ? "cancelled"
          : data.status === "paused"
            ? "paused"
            : "running",
    pauseReason: typeof data.pauseReason === "string" ? data.pauseReason : undefined,
    message: typeof data.message === "string" ? data.message : undefined,
    batchMessage: typeof data.batchMessage === "string" ? data.batchMessage : null,
    results: Array.isArray(data.results)
      ? (data.results as BulkSyncProgress["results"])
      : [],
  };
}

export default function StockMonitorPage() {
  const [products, setProducts] = useState<MonitorProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadSucceeded, setLoadSucceeded] = useState(false);
  const [error, setError] = useState("");
  const [checkingId, setCheckingId] = useState<number | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [bulkSyncing, setBulkSyncing] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<BulkSyncProgress | null>(null);
  const [extensionSyncing, setExtensionSyncing] = useState(false);
  const [extensionReady, setExtensionReady] = useState(false);
  const [extensionProgress, setExtensionProgress] = useState<BulkSyncProgress | null>(null);
  const [extensionSyncMeta, setExtensionSyncMeta] = useState<ExtensionSyncMeta | null>(null);
  const [showExcludedProducts, setShowExcludedProducts] = useState(false);
  const [extensionPollTick, setExtensionPollTick] = useState(0);
  const loadProductsInFlightRef = useRef(false);

  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
    window.setTimeout(() => {
      setToast((current) => (current?.message === message ? null : current));
    }, 4000);
  }, []);

  const loadExtensionSyncMeta = useCallback(async () => {
    try {
      const response = await fetch("/api/admin-sync-all-product-stock/extension-items", {
        cache: "no-store",
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        return;
      }

      setExtensionSyncMeta({
        total_monitor_products: Number(data.total_monitor_products) || 0,
        syncable_count: Number(data.syncable_count) || 0,
        excluded_count: Number(data.excluded_count) || 0,
        recoverable_draft_count: Number(data.recoverable_draft_count) || 0,
        excluded: Array.isArray(data.excluded) ? data.excluded : [],
      });
    } catch {
      // Keep page usable even if extension meta fails to load.
    }
  }, []);

  const loadProducts = useCallback(async () => {
    if (loadProductsInFlightRef.current) {
      return;
    }

    loadProductsInFlightRef.current = true;
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/stock-monitor", { cache: "no-store" });
      const data = await response.json();

      if (!response.ok) {
        setError(resolveLoadErrorMessage(response, data));
        return;
      }

      const list = Array.isArray(data.products) ? data.products : [];
      setProducts(list);
      setLoadSucceeded(true);
    } catch {
      setError("網路錯誤，請稍後再試");
    } finally {
      loadProductsInFlightRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void loadProducts();
      void loadExtensionSyncMeta();
    });
  }, [loadProducts, loadExtensionSyncMeta]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.source !== window) {
        return;
      }

      const data = event.data as {
        type?: string;
        progress?: Record<string, unknown>;
      };

      if (!data?.type) {
        return;
      }

      if (data.type === "JGO_EXTENSION_PONG") {
        setExtensionReady(true);
        return;
      }

      if (data.type === "JGO_EXTENSION_BULK_SYNC_PROGRESS" && data.progress) {
        const progress = mapExtensionProgress(data.progress);
        console.log(
          "JGO ADMIN EXT PROGRESS",
          progress.completed,
          progress.total,
          progress.status,
          progress.currentProductName
        );
        setExtensionProgress(progress);
        if (
          progress.status === "paused" ||
          progress.status === "completed" ||
          progress.status === "cancelled"
        ) {
          setExtensionSyncing(false);
        }
        return;
      }

      if (data.type === "JGO_EXTENSION_BULK_SYNC_FINISHED" && data.progress) {
        const progress = mapExtensionProgress(data.progress);
        setExtensionProgress(progress);
        setExtensionSyncing(false);

        if (progress.status === "paused" && progress.pauseReason === "zozo_access_denied") {
          showToast(
            "ZOZO 暫時拒絕存取，系統已停止同步。請等待 30～60 分鐘後再試。",
            "error"
          );
          return;
        }

        showToast(
          "Extension 同步完成：" + formatBulkSyncSummary(progress),
          progress.failed > 0 ? "error" : "success"
        );
        void loadProducts();
      }
    };

    window.addEventListener("message", handler);

    void pingExtension().then((ready) => {
      setExtensionReady(ready);
    });

    return () => {
      window.removeEventListener("message", handler);
    };
  }, [loadProducts, showToast]);

  useEffect(() => {
    if (!extensionSyncing) {
      return;
    }

    const poll = window.setInterval(() => {
      postExtensionMessage({ type: "JGO_EXTENSION_BULK_SYNC_STATUS" });
      setExtensionPollTick((current) => current + 1);
    }, EXTENSION_STATUS_POLL_MS);

    return () => {
      window.clearInterval(poll);
    };
  }, [extensionSyncing]);

  const extensionStuck =
    extensionSyncing &&
    extensionProgress?.status === "running" &&
    typeof extensionProgress.updatedAt === "number" &&
    Date.now() - extensionProgress.updatedAt > EXTENSION_STUCK_AFTER_MS;

  void extensionPollTick;

  const handleExtensionResumeSync = async () => {
    const pingOk = await pingExtension();
    if (!pingOk) {
      showToast(
        "未偵測到 J-GO Chrome Extension，請確認已安裝、啟用並重新整理頁面。",
        "error"
      );
      return;
    }

    setExtensionSyncing(true);
    postExtensionMessage({ type: "JGO_RESUME_STOCK_SYNC" });

    try {
      await waitForExtensionMessage(["JGO_STOCK_SYNC_ACCEPTED"], EXTENSION_START_TIMEOUT_MS);
      showToast("已從下一件繼續 Extension 同步", "success");
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Extension 恢復同步失敗",
        "error"
      );
    }
  };

  const handleCheckNow = async (productId: number) => {
    setCheckingId(productId);

    try {
      const response = await fetch("/api/stock-monitor/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: productId }),
      });

      const data = await response.json();

      if (!response.ok) {
        showToast(resolveLoadErrorMessage(response, data), "error");
        return;
      }

      if (data.product) {
        setProducts((prev) =>
          prev.map((product) => (product.id === productId ? data.product : product))
        );
      } else if (data.result) {
        setProducts((prev) =>
          prev.map((product) =>
            product.id === productId
              ? {
                  ...product,
                  last_checked_at: data.result.last_checked_at ?? product.last_checked_at,
                  last_price_jpy: data.result.last_price_jpy ?? product.last_price_jpy,
                  last_stock_status: data.result.last_stock_status ?? product.last_stock_status,
                  check_status: data.result.check_status ?? product.check_status,
                }
              : product
          )
        );
      }

      showToast(data.message || "檢查完成，已更新監控資料", "success");
    } catch {
      showToast("網路錯誤，請稍後再試", "error");
    } finally {
      setCheckingId(null);
    }
  };

  const handleBulkSyncAll = async () => {
    const confirmed = window.confirm("將分批同步所有商品庫存，可能需要數分鐘，確定開始？");
    if (!confirmed) {
      return;
    }

    setBulkSyncing(true);
    setBulkProgress(null);

    try {
      const startResponse = await fetch("/api/admin-sync-all-product-stock/start", {
        method: "POST",
      });
      const startData = await startResponse.json();

      if (!startResponse.ok || !startData.success) {
        showToast(resolveLoadErrorMessage(startResponse, startData), "error");
        return;
      }

      if (!startData.job_id || startData.total === 0) {
        showToast(startData.message || "沒有可同步的已發布商品", "error");
        return;
      }

      let jobId = String(startData.job_id);
      let done = false;
      let latest = startData as BulkSyncProgress & {
        job_id: string;
        current_product_name?: string | null;
      };

      const mapProgress = (data: Record<string, unknown>): BulkSyncProgress => ({
        jobId: String(data.job_id ?? jobId),
        total: Number(data.total) || 0,
        completed: Number(data.completed) || 0,
        success: Number(data.success_count ?? data.success) || 0,
        failed: Number(data.failed) || 0,
        unpublished: Number(data.unpublished) || 0,
        republished: Number(data.republished) || 0,
        uncertain: Number(data.uncertain) || 0,
        skipped: Number(data.skipped) || 0,
        currentProductName: String(data.current_product_name ?? "") || null,
        status: data.status === "completed" ? "completed" : "running",
        results: Array.isArray(data.results)
          ? (data.results as BulkSyncProgress["results"])
          : [],
      });

      setBulkProgress(mapProgress(startData));

      while (!done) {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), 60_000);

        let nextResponse: Response;
        try {
          nextResponse = await fetch("/api/admin-sync-all-product-stock/next", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ job_id: jobId }),
            signal: controller.signal,
          });
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            showToast(
              "同步逾時，請重新整理後再試。已完成的商品不會重複處理。",
              "error"
            );
            break;
          }

          throw error;
        } finally {
          window.clearTimeout(timeoutId);
        }

        const nextData = await nextResponse.json();

        if (!nextResponse.ok || !nextData.success) {
          showToast(resolveLoadErrorMessage(nextResponse, nextData), "error");
          break;
        }

        latest = nextData;
        jobId = String(nextData.job_id ?? jobId);
        done = Boolean(nextData.done);
        setBulkProgress(mapProgress(nextData));
      }

      if (done || latest.status === "completed") {
        const summary = mapProgress(latest as Record<string, unknown>);
        showToast(
          "同步完成：" + formatBulkSyncSummary(summary),
          summary.failed > 0 ? "error" : "success"
        );
        await loadProducts();
      }
    } catch {
      showToast("批次同步失敗，請稍後再試", "error");
    } finally {
      setBulkSyncing(false);
    }
  };

  const handleExtensionBulkSyncAll = async () => {
    const pingOk = await pingExtension();
    if (!pingOk) {
      showToast(
        "未偵測到 J-GO Chrome Extension，請確認已安裝、啟用並重新整理頁面。",
        "error"
      );
      return;
    }

    const confirmed = window.confirm(
      "將由 Chrome Extension 在瀏覽器中逐件同步 ZOZO 庫存（每次 1 頁、間隔 2～5 秒），可能需要較長時間，確定開始？"
    );
    if (!confirmed) {
      return;
    }

    setExtensionSyncing(true);
    setExtensionProgress(null);

    try {
      const queueResponse = await fetch("/api/admin-sync-all-product-stock/extension-items", {
        cache: "no-store",
      });
      const queueData = await queueResponse.json();

      if (!queueResponse.ok || !queueData.success) {
        showToast(resolveLoadErrorMessage(queueResponse, queueData), "error");
        setExtensionSyncing(false);
        return;
      }

      setExtensionSyncMeta({
        total_monitor_products: Number(queueData.total_monitor_products) || 0,
        syncable_count: Number(queueData.syncable_count) || 0,
        excluded_count: Number(queueData.excluded_count) || 0,
        recoverable_draft_count: Number(queueData.recoverable_draft_count) || 0,
        excluded: Array.isArray(queueData.excluded) ? queueData.excluded : [],
      });

      const items = Array.isArray(queueData.items) ? queueData.items : [];
      if (items.length === 0) {
        showToast(queueData.message || "沒有可同步的 ZOZO 商品", "error");
        setExtensionSyncing(false);
        return;
      }

      console.log("JGO ADMIN EXT START", items.length);
      postExtensionMessage({
        type: "JGO_START_STOCK_SYNC",
        items: items.map((item: { id: number; name: string; source_url: string }) => ({
          id: item.id,
          name: item.name,
          source_url: item.source_url,
        })),
      });

      const accepted = await waitForExtensionMessage(
        ["JGO_STOCK_SYNC_ACCEPTED"],
        EXTENSION_START_TIMEOUT_MS
      );
      console.log("JGO ADMIN EXT ACCEPTED", accepted.total);

      setExtensionProgress({
        total: Number(accepted.total) || items.length,
        completed: 0,
        success: 0,
        failed: 0,
        unpublished: 0,
        republished: 0,
        uncertain: 0,
        skipped: 0,
        currentProductName: null,
        currentIndex: 0,
        updatedAt: Date.now(),
        phase: "item_start",
        status: "running",
        results: [],
      });
    } catch (error) {
      const isTimeout = error instanceof Error && error.message === "TIMEOUT";
      showToast(
        isTimeout
          ? "Extension 未回應，請重新載入 Chrome Extension 後再試。"
          : error instanceof Error
            ? error.message
            : "Extension 批次同步啟動失敗",
        "error"
      );
      setExtensionSyncing(false);
    }
  };

  const renderBulkProgressPanel = (
    title: string,
    progress: BulkSyncProgress,
    options?: {
      showFailedList?: boolean;
      totalCountLabel?: string;
      showExtensionStuckActions?: boolean;
      onResumeExtension?: () => void;
      extensionStuck?: boolean;
    }
  ) => {
    const showFailedList = options?.showFailedList ?? true;
    const totalCountLabel = options?.totalCountLabel ?? "總商品數";
    const showExtensionStuckActions = options?.showExtensionStuckActions ?? false;
    const extensionStuck = options?.extensionStuck ?? false;
    const dedupedResults = dedupeBulkSyncResultsByProductId(
      progress.results.map((item) => normalizeBulkSyncResultEntry(item))
    );
    const resultCounts =
      progress.results.length > 0
        ? countBulkSyncResultsByAction(progress.results)
        : {
            completed: progress.completed,
            success: progress.success,
            failed: progress.failed,
            unpublished: progress.unpublished,
            republished: progress.republished,
            uncertain: progress.uncertain,
            skipped: progress.skipped,
          };

    return (
    <div className="rounded-3xl border border-neutral-100 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-black text-neutral-900">{title}</h2>
        <span className="text-xs font-bold text-neutral-500">
          {progress.status === "completed"
            ? "已完成"
            : progress.status === "cancelled"
              ? "已取消"
              : progress.status === "paused"
                ? "已暫停"
                : "同步中"}
        </span>
      </div>

      {extensionStuck ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          同步卡住，請按重新啟動同步。
          {showExtensionStuckActions ? (
            <button
              type="button"
              onClick={options?.onResumeExtension}
              className="ml-3 rounded-full bg-red-700 px-3 py-1 text-xs font-black text-white"
            >
              從下一件繼續
            </button>
          ) : null}
        </div>
      ) : null}

      {progress.status === "paused" && progress.pauseReason === "zozo_access_denied" ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
          ZOZO 暫時拒絕存取，系統已停止同步。請等待 30～60 分鐘後再試。
        </div>
      ) : null}

      {progress.batchMessage ? (
        <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800">
          {progress.batchMessage}
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
        <div className="rounded-2xl bg-neutral-50 p-3">
          <p className="font-bold text-neutral-500">{totalCountLabel}</p>
          <p className="mt-1 text-lg font-black">{progress.total}</p>
        </div>
        <div className="rounded-2xl bg-neutral-50 p-3">
          <p className="font-bold text-neutral-500">已完成</p>
          <p className="mt-1 text-lg font-black">{resultCounts.completed}</p>
        </div>
        <div className="rounded-2xl bg-neutral-50 p-3">
          <p className="font-bold text-neutral-500">成功</p>
          <p className="mt-1 text-lg font-black text-green-700">{resultCounts.success}</p>
        </div>
        <div className="rounded-2xl bg-neutral-50 p-3">
          <p className="font-bold text-neutral-500">失敗</p>
          <p className="mt-1 text-lg font-black text-red-600">{resultCounts.failed}</p>
        </div>
        <div className="rounded-2xl bg-neutral-50 p-3">
          <p className="font-bold text-neutral-500">已下架</p>
          <p className="mt-1 text-lg font-black text-amber-700">{resultCounts.unpublished}</p>
        </div>
        <div className="rounded-2xl bg-neutral-50 p-3">
          <p className="font-bold text-neutral-500">已恢復上架</p>
          <p className="mt-1 text-lg font-black text-emerald-700">{resultCounts.republished}</p>
        </div>
        <div className="rounded-2xl bg-neutral-50 p-3">
          <p className="font-bold text-neutral-500">待人工檢查</p>
          <p className="mt-1 text-lg font-black text-blue-700">{resultCounts.uncertain}</p>
        </div>
        <div className="rounded-2xl bg-neutral-50 p-3">
          <p className="font-bold text-neutral-500">略過</p>
          <p className="mt-1 text-lg font-black">{resultCounts.skipped}</p>
        </div>
      </div>

      {progress.currentProductName ? (
        <p className="mt-4 text-sm font-bold text-neutral-700">
          目前正在同步：{progress.currentProductName}
        </p>
      ) : null}

      {progress.phase ? (
        <p className="mt-2 text-xs font-bold text-neutral-400">phase: {progress.phase}</p>
      ) : null}

      {showFailedList &&
      (progress.status === "completed" || progress.status === "cancelled") &&
      dedupedResults.some((item) => item.action === "republished") ? (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-black tracking-widest text-neutral-400">已恢復上架</p>
          {dedupedResults
            .filter((item) => item.action === "republished")
            .map((item) => (
              <div
                key={`republished-${item.product_id}-${item.name}`}
                className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-700"
              >
                <p className="font-black">
                  #{item.product_id} {item.name}
                </p>
                <p className="mt-1 font-bold">{getBulkSyncItemDisplay(item).message}</p>
              </div>
            ))}
        </div>
      ) : null}

      {showFailedList
        ? renderBulkSyncResultSection(dedupedResults, {
            title: "失敗商品",
            filterAction: "failed",
            borderClassName: "border-red-100",
            bgClassName: "bg-red-50",
            textClassName: "text-red-700",
            keyPrefix: "failed",
          })
        : null}

      {showFailedList
        ? renderBulkSyncResultSection(dedupedResults, {
            title: "待人工檢查",
            filterAction: "uncertain",
            borderClassName: "border-blue-100",
            bgClassName: "bg-blue-50",
            textClassName: "text-blue-700",
            keyPrefix: "uncertain",
          })
        : null}
    </div>
    );
  };

  const monitorSummaryText =
    extensionSyncMeta && (loadSucceeded || products.length > 0)
      ? `共 ${extensionSyncMeta.total_monitor_products || products.length} 筆監控商品，其中 ${extensionSyncMeta.syncable_count} 筆可用 Extension 同步${
          extensionSyncMeta.recoverable_draft_count > 0
            ? `（含 ${extensionSyncMeta.recoverable_draft_count} 筆已下架但可檢查）`
            : ""
        }，${extensionSyncMeta.excluded_count} 筆略過。`
      : loadSucceeded || products.length > 0
        ? `共 ${products.length} 筆監控商品${
            products.some((product) => product.recoverable_draft)
              ? `，其中 ${products.filter((product) => product.recoverable_draft).length} 筆已下架但可檢查`
              : ""
          }`
        : error
          ? "監控列表載入失敗"
          : "載入監控列表中...";

  return (
    <AdminShell title="價格庫存監控">
      {toast && (
        <div
          className={`fixed left-1/2 top-6 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-2xl px-4 py-3 text-sm font-bold shadow-lg ${
            toast.type === "success"
              ? "border border-green-200 bg-green-50 text-green-700"
              : "border border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {toast.message}
        </div>
      )}

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-neutral-500">{monitorSummaryText}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleExtensionBulkSyncAll()}
              disabled={loading || bulkSyncing || extensionSyncing}
              className="rounded-full bg-blue-700 px-4 py-1.5 text-xs font-bold text-white disabled:opacity-50"
            >
              {extensionSyncing ? "Extension 同步中..." : "使用 Extension 同步全部庫存"}
            </button>
            <button
              type="button"
              onClick={() => void handleBulkSyncAll()}
              disabled={loading || bulkSyncing || extensionSyncing}
              className="rounded-full bg-neutral-900 px-4 py-1.5 text-xs font-bold text-white disabled:opacity-50"
            >
              {bulkSyncing ? "同步中..." : "同步全部商品庫存"}
            </button>
            <button
              type="button"
              onClick={() => {
                void loadProducts();
                void loadExtensionSyncMeta();
              }}
              disabled={loading || bulkSyncing || extensionSyncing}
              className="rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-bold text-neutral-700 disabled:opacity-50"
            >
              重新整理
            </button>
          </div>
          {!extensionReady ? (
            <p className="w-full text-xs font-bold text-amber-700">
              未偵測到 J-GO Chrome Extension，請確認已安裝、啟用並重新整理頁面。
            </p>
          ) : null}
          {extensionSyncMeta && extensionSyncMeta.excluded_count > 0 ? (
            <div className="w-full space-y-2">
              <button
                type="button"
                onClick={() => setShowExcludedProducts((current) => !current)}
                className="text-xs font-bold text-neutral-600 underline"
              >
                {showExcludedProducts ? "收合略過商品" : "顯示略過商品"}
              </button>
              {showExcludedProducts ? (
                <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-3">
                  <p className="text-xs font-black tracking-widest text-neutral-400">略過商品</p>
                  <div className="mt-2 space-y-2">
                    {extensionSyncMeta.excluded.map((item) => (
                      <p
                        key={`${item.product_id}-${item.name}`}
                        className="text-xs font-bold text-neutral-700"
                        title={item.reason}
                      >
                        #{item.product_id} {item.name} — {getExtensionExcludeReasonLabel(item.reason)}
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {extensionProgress
          ? renderBulkProgressPanel("Extension 批次同步進度", extensionProgress, {
              totalCountLabel: "可同步商品數",
              showExtensionStuckActions: true,
              extensionStuck,
              onResumeExtension: () => {
                void handleExtensionResumeSync();
              },
            })
          : null}

        {bulkProgress ? renderBulkProgressPanel("伺服器批次同步進度", bulkProgress) : null}

        {loading && (
          <div className="rounded-3xl border border-neutral-100 bg-neutral-50 p-8 text-center text-sm text-neutral-500">
            載入中...
          </div>
        )}

        {!loading && error && (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-5 text-sm font-bold text-red-700">
            {error}
          </div>
        )}

        {!loading && loadSucceeded && !error && products.length === 0 && (
          <div className="rounded-3xl border border-neutral-100 bg-neutral-50 p-8 text-center text-sm text-neutral-500">
            尚無監控商品。請先匯入含 source_url 的商品。
          </div>
        )}

        {!loading &&
          products.length > 0 &&
          products.map((product) => {
            const imageUrl = getProductImage(product);

            return (
              <article
                key={product.id}
                className="overflow-hidden rounded-3xl border border-neutral-100 bg-white shadow-sm"
              >
                <div className="flex gap-4 p-4">
                  <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-neutral-100">
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={getProductName(product)}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-neutral-400">
                        無圖
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-3">
                    <div>
                      <p className="text-xs font-bold tracking-widest text-neutral-400">
                        {product.brand || "—"}
                      </p>
                      <h2 className="text-base font-black tracking-tight">{getProductName(product)}</h2>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {product.status === "draft" ? (
                          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black text-amber-800">
                            已下架
                          </span>
                        ) : null}
                        {product.recoverable_draft ||
                        isRecoverableDraftProduct({
                          status: String(product.status || ""),
                          checkStatus: String(product.check_status || ""),
                          sourceUrl: product.source_url,
                          isZozo:
                            product.source_url.includes("zozo.jp") ||
                            product.source_site === "zozo",
                        }) ? (
                          <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[10px] font-black text-blue-800">
                            已下架但可檢查
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="font-bold text-neutral-500">source_site</p>
                        <p className="font-bold text-neutral-900">{product.source_site || "—"}</p>
                      </div>
                      <div>
                        <p className="font-bold text-neutral-500">check_status</p>
                        <p className="font-bold text-neutral-900">
                          {getCheckStatusLabel(product.check_status)}
                        </p>
                      </div>
                      <div>
                        <p className="font-bold text-neutral-500">last_price_jpy</p>
                        <p className="font-bold text-neutral-900">
                          {formatPrice(product.last_price_jpy)}
                        </p>
                      </div>
                      <div>
                        <p className="font-bold text-neutral-500">last_stock_status</p>
                        <p className="font-bold text-neutral-900">
                          {getStockStatusLabel(product.last_stock_status)}
                        </p>
                      </div>
                      <div className="col-span-2">
                        <p className="font-bold text-neutral-500">last_checked_at</p>
                        <p className="font-bold text-neutral-900">
                          {formatDateTime(product.last_checked_at)}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleCheckNow(product.id)}
                      disabled={checkingId === product.id || bulkSyncing || extensionSyncing}
                      className="w-full rounded-2xl bg-neutral-900 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50"
                    >
                      {checkingId === product.id ? "Checking..." : "Check Now"}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
      </div>
    </AdminShell>
  );
}
