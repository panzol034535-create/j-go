"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import type { StockMonitorProduct } from "@/lib/types/stock-monitor";

type ToastState = {
  message: string;
  type: "success" | "error";
} | null;

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
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
      return "正常";
    case "requires_browser_check":
      return "需瀏覽器檢查";
    case "mock":
      return "Mock 檢查";
    case "error":
      return "錯誤";
    default:
      return status || "—";
  }
}

function getStockStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "in_stock":
      return "有庫存";
    case "out_of_stock":
      return "無庫存";
    case "unknown":
      return "未知";
    default:
      return status || "—";
  }
}

export default function StockMonitorPage() {
  const [products, setProducts] = useState<StockMonitorProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [checkingId, setCheckingId] = useState<number | null>(null);
  const [toast, setToast] = useState<ToastState>(null);

  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
    window.setTimeout(() => {
      setToast((current) => (current?.message === message ? null : current));
    }, 4000);
  }, []);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/stock-monitor", { cache: "no-store" });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "讀取失敗");
        setProducts([]);
        return;
      }

      const list = Array.isArray(data.products) ? data.products : [];
      setProducts(list);
    } catch {
      setError("網路錯誤，請稍後再試");
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

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
        showToast(data.error || "檢查失敗", "error");
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
      await loadProducts();
    } catch {
      showToast("網路錯誤，請稍後再試", "error");
    } finally {
      setCheckingId(null);
    }
  };

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
        <div className="flex items-center justify-between">
          <p className="text-sm text-neutral-500">共 {products.length} 筆監控商品</p>
          <button
            type="button"
            onClick={() => void loadProducts()}
            disabled={loading || checkingId !== null}
            className="rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-bold text-neutral-700 disabled:opacity-50"
          >
            重新整理
          </button>
        </div>

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

        {!loading && !error && products.length === 0 && (
          <div className="rounded-3xl border border-neutral-100 bg-neutral-50 p-8 text-center text-sm text-neutral-500">
            尚無監控商品。請先匯入含 source_url 的商品。
          </div>
        )}

        {!loading &&
          !error &&
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
                      disabled={checkingId === product.id}
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
