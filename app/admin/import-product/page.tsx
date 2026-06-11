"use client";

import { useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import type { ImportedProduct } from "@/lib/types/product-import";

type ImportStatus = "idle" | "loading" | "success" | "error";

export default function ImportProductPage() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<ImportStatus>("idle");
  const [message, setMessage] = useState("");
  const [product, setProduct] = useState<ImportedProduct | null>(null);

  const handleImport = async () => {
    if (!url.trim()) {
      setStatus("error");
      setMessage("請輸入商品網址");
      return;
    }

    setStatus("loading");
    setMessage("正在抓取商品資料、翻譯並寫入 Draft...");
    setProduct(null);

    try {
      const response = await fetch("/api/import-product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        setStatus("error");
        setMessage(data.error || "匯入失敗");
        return;
      }

      setStatus("success");
      setMessage("匯入成功，商品已建立為 Draft");
      setProduct(data.product);
    } catch {
      setStatus("error");
      setMessage("網路錯誤，請稍後再試");
    }
  };

  return (
    <AdminShell title="匯入商品">
      <div className="space-y-6">
        <section className="rounded-3xl border border-neutral-100 bg-neutral-50 p-5">
          <label htmlFor="product-url" className="block text-xs font-bold tracking-widest text-neutral-500">
            ZOZOTOWN 商品網址
          </label>
          <input
            id="product-url"
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://zozo.jp/shop/xxxx/goods/12345678/"
            className="mt-3 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm outline-none focus:border-neutral-900"
          />
          <button
            type="button"
            onClick={handleImport}
            disabled={status === "loading"}
            className="mt-4 w-full rounded-2xl bg-neutral-900 px-4 py-3 text-sm font-bold text-white transition active:scale-[0.98] disabled:opacity-50"
          >
            {status === "loading" ? "Importing..." : "Import Product"}
          </button>
        </section>

        {status !== "idle" && (
          <section
            className={`rounded-3xl border p-5 ${
              status === "error"
                ? "border-red-200 bg-red-50 text-red-700"
                : status === "success"
                  ? "border-green-200 bg-green-50 text-green-700"
                  : "border-neutral-200 bg-white text-neutral-600"
            }`}
          >
            <p className="text-sm font-bold">{message}</p>
          </section>
        )}

        {product && (
          <section className="overflow-hidden rounded-3xl border border-neutral-100 bg-white shadow-sm">
            {product.main_image && (
              <img
                src={product.main_image}
                alt={product.name_zh}
                className="aspect-square w-full object-cover"
              />
            )}
            <div className="space-y-3 p-5">
              <div>
                <p className="text-xs font-bold tracking-widest text-neutral-400">{product.brand}</p>
                <h2 className="text-lg font-black tracking-tight">{product.name_zh}</h2>
                <p className="mt-1 text-sm text-neutral-500">{product.name_jp}</p>
              </div>
              <p className="text-2xl font-black">¥{product.jpy_price.toLocaleString()}</p>
              <p className="text-sm leading-relaxed text-neutral-600">{product.description_zh}</p>
              {product.tags?.length > 0 && (
                <div className="flex flex-wrap gap-2">
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
              <p className="text-xs text-neutral-400">Product ID: {product.id}</p>
            </div>
          </section>
        )}
      </div>
    </AdminShell>
  );
}
