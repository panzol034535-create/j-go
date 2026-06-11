"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import type { DraftProduct } from "@/lib/types/product-import";

export default function DraftsPage() {
  const [products, setProducts] = useState<DraftProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [publishingId, setPublishingId] = useState<number | null>(null);

  const loadDrafts = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/draft-products");
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
    loadDrafts();
  }, [loadDrafts]);

  const handlePublish = async (productId: number) => {
    setPublishingId(productId);

    try {
      const response = await fetch("/api/publish-product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: productId }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || "上架失敗");
        return;
      }

      setProducts((prev) => prev.filter((product) => product.id !== productId));
    } catch {
      alert("網路錯誤，請稍後再試");
    } finally {
      setPublishingId(null);
    }
  };

  return (
    <AdminShell title="Draft 管理">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-neutral-500">共 {products.length} 筆 Draft 商品</p>
          <button
            type="button"
            onClick={loadDrafts}
            className="rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-bold text-neutral-700"
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
          <div className="rounded-3xl border border-neutral-100 bg-neutral-50 p-8 text-center">
            <p className="text-sm font-bold text-neutral-700">目前沒有 Draft 商品</p>
            <p className="mt-2 text-xs text-neutral-500">請先到匯入頁面建立商品</p>
          </div>
        )}

        {!loading &&
          products.map((product) => (
            <article
              key={product.id}
              className="overflow-hidden rounded-3xl border border-neutral-100 bg-white shadow-sm"
            >
              <div className="flex gap-4 p-4">
                {product.main_image ? (
                  <img
                    src={product.main_image}
                    alt={product.name_zh || product.name_jp}
                    className="h-24 w-24 shrink-0 rounded-2xl object-cover"
                  />
                ) : (
                  <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl bg-neutral-100 text-xs text-neutral-400">
                    No Image
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold tracking-widest text-neutral-400">{product.brand}</p>
                  <h2 className="truncate text-base font-black tracking-tight">
                    {product.name_zh || product.name_jp}
                  </h2>
                  <p className="truncate text-xs text-neutral-500">{product.name_jp}</p>
                  <p className="mt-2 text-lg font-black">¥{Number(product.jpy_price).toLocaleString()}</p>
                </div>
              </div>

              {product.description_zh && (
                <p className="border-t border-neutral-100 px-4 py-3 text-sm leading-relaxed text-neutral-600">
                  {product.description_zh}
                </p>
              )}

              {product.tags?.length > 0 && (
                <div className="flex flex-wrap gap-2 border-t border-neutral-100 px-4 py-3">
                  {product.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-bold text-neutral-700"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <div className="border-t border-neutral-100 px-4 py-3">
                <button
                  type="button"
                  onClick={() => handlePublish(product.id)}
                  disabled={publishingId === product.id}
                  className="w-full rounded-2xl bg-neutral-900 px-4 py-3 text-sm font-bold text-white transition active:scale-[0.98] disabled:opacity-50"
                >
                  {publishingId === product.id ? "Publishing..." : "Publish"}
                </button>
              </div>
            </article>
          ))}
      </div>
    </AdminShell>
  );
}
