"use client";

import { useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { detectSourceSite } from "@/lib/products/source-site";
import type { ImportedProduct, ZozoProductData } from "@/lib/types/product-import";

type ImportStatus = "idle" | "loading" | "success" | "error";

type ImportForm = {
  url: string;
  name_jp: string;
  brand: string;
  jpy_price: string;
  description_jp: string;
  main_image: string;
  colors: string;
  sizes: string;
};

const initialForm: ImportForm = {
  url: "",
  name_jp: "",
  brand: "",
  jpy_price: "",
  description_jp: "",
  main_image: "",
  colors: "",
  sizes: "",
};

function applyZozoDataToForm(product: ZozoProductData): ImportForm {
  return {
    url: "",
    name_jp: product.name_jp || "",
    brand: product.brand || "",
    jpy_price: product.jpy_price ? String(product.jpy_price) : "",
    description_jp: product.description_jp || "",
    main_image: product.main_image || "",
    colors: Array.isArray(product.colors) ? product.colors.join(",") : "",
    sizes: Array.isArray(product.sizes) ? product.sizes.join(",") : "",
  };
}

export default function ImportProductPage() {
  const [form, setForm] = useState<ImportForm>(initialForm);
  const [status, setStatus] = useState<ImportStatus>("idle");
  const [message, setMessage] = useState("");
  const [product, setProduct] = useState<ImportedProduct | null>(null);
  const [fetchingZozo, setFetchingZozo] = useState(false);

  const updateField = (field: keyof ImportForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleFetchFromZozo = async () => {
    const url = form.url.trim();
    if (!url) {
      setStatus("error");
      setMessage("請輸入 ZOZOTOWN 商品網址");
      return;
    }

    setFetchingZozo(true);
    setStatus("loading");
    setMessage("正在抓取 ZOZO 商品資料...");
    setProduct(null);

    try {
      const response = await fetch("/api/fetch-zozo-product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const data = await response.json();

      if (!response.ok) {
        setStatus("error");
        setMessage(data.error || "ZOZO 抓取失敗");
        return;
      }

      const scraped = data.product as ZozoProductData;
      setForm((prev) => ({
        ...applyZozoDataToForm(scraped),
        url: prev.url,
      }));
      setStatus("success");
      setMessage("ZOZO 商品資料已自動填入，請確認後再 Import Product");
    } catch {
      setStatus("error");
      setMessage("網路錯誤，請稍後再試");
    } finally {
      setFetchingZozo(false);
    }
  };

  const handleImport = async () => {
    const url = form.url.trim();
    const name_jp = form.name_jp.trim();
    const brand = form.brand.trim();
    const jpy_price = Number(form.jpy_price);
    const hasManualRequired =
      Boolean(name_jp && brand && form.jpy_price.trim()) &&
      !Number.isNaN(jpy_price) &&
      jpy_price > 0;

    if (!url && !hasManualRequired) {
      setStatus("error");
      setMessage("請填寫 ZOZO 商品網址，或手動輸入商品名稱、品牌與價格");
      return;
    }

    if (!url && (Number.isNaN(jpy_price) || jpy_price <= 0)) {
      setStatus("error");
      setMessage("請輸入有效的日圓價格");
      return;
    }

    setStatus("loading");
    setMessage(
      url
        ? "正在抓取 ZOZO 商品、翻譯並寫入 Draft..."
        : "正在翻譯商品資料並寫入 Draft..."
    );
    setProduct(null);

    const payload = {
      url,
      source_url: url || undefined,
      source_site: url ? detectSourceSite(url) : undefined,
      name_jp,
      brand,
      jpy_price: hasManualRequired ? jpy_price : form.jpy_price,
      description_jp: form.description_jp.trim(),
      main_image: form.main_image.trim(),
      colors: form.colors.trim(),
      sizes: form.sizes.trim(),
    };

    try {
      const response = await fetch("/api/import-product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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

  const inputClassName =
    "mt-2 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm outline-none focus:border-neutral-900";

  const isBusy = status === "loading" || fetchingZozo;

  return (
    <AdminShell title="匯入商品">
      <div className="space-y-6">
        <section className="space-y-4 rounded-3xl border border-neutral-100 bg-neutral-50 p-5">
          <p className="text-xs font-bold tracking-widest text-neutral-500">
            半自動匯入：可選填 ZOZO 網址抓取，或直接使用下方手動欄位
          </p>

          <div className="rounded-2xl border border-neutral-200 bg-white p-4">
            <label htmlFor="product-url" className="block text-xs font-bold text-neutral-600">
              商品網址（選填）
            </label>
            <input
              id="product-url"
              type="url"
              value={form.url}
              onChange={(event) => updateField("url", event.target.value)}
              placeholder="https://zozo.jp/shop/.../goods/..."
              className={inputClassName}
            />
            <button
              type="button"
              onClick={handleFetchFromZozo}
              disabled={isBusy || !form.url.trim()}
              className="mt-3 w-full rounded-2xl border border-neutral-900 bg-white px-4 py-3 text-sm font-bold text-neutral-900 transition active:scale-[0.98] disabled:opacity-50"
            >
              {fetchingZozo ? "Fetching..." : "抓取 ZOZO 商品"}
            </button>
          </div>

          <div>
            <label htmlFor="name_jp" className="block text-xs font-bold text-neutral-600">
              商品名稱（日文）*
            </label>
            <input
              id="name_jp"
              type="text"
              value={form.name_jp}
              onChange={(event) => updateField("name_jp", event.target.value)}
              placeholder="例：オーバーサイズ クルーネック ニット"
              className={inputClassName}
            />
          </div>

          <div>
            <label htmlFor="brand" className="block text-xs font-bold text-neutral-600">
              品牌 *
            </label>
            <input
              id="brand"
              type="text"
              value={form.brand}
              onChange={(event) => updateField("brand", event.target.value)}
              placeholder="例：UNIQLO"
              className={inputClassName}
            />
          </div>

          <div>
            <label htmlFor="jpy_price" className="block text-xs font-bold text-neutral-600">
              日圓價格 *
            </label>
            <input
              id="jpy_price"
              type="number"
              min="1"
              value={form.jpy_price}
              onChange={(event) => updateField("jpy_price", event.target.value)}
              placeholder="例：8900"
              className={inputClassName}
            />
          </div>

          <div>
            <label htmlFor="description_jp" className="block text-xs font-bold text-neutral-600">
              商品描述（日文）
            </label>
            <textarea
              id="description_jp"
              value={form.description_jp}
              onChange={(event) => updateField("description_jp", event.target.value)}
              placeholder="例：ゆったりシルエットのコットンニット..."
              rows={4}
              className={inputClassName}
            />
          </div>

          <div>
            <label htmlFor="main_image" className="block text-xs font-bold text-neutral-600">
              主圖 URL
            </label>
            <input
              id="main_image"
              type="url"
              value={form.main_image}
              onChange={(event) => updateField("main_image", event.target.value)}
              placeholder="https://..."
              className={inputClassName}
            />
          </div>

          <div>
            <label htmlFor="colors" className="block text-xs font-bold text-neutral-600">
              顏色（逗號分隔）
            </label>
            <input
              id="colors"
              type="text"
              value={form.colors}
              onChange={(event) => updateField("colors", event.target.value)}
              placeholder="黑色,白色,灰色"
              className={inputClassName}
            />
          </div>

          <div>
            <label htmlFor="sizes" className="block text-xs font-bold text-neutral-600">
              尺寸（逗號分隔）
            </label>
            <input
              id="sizes"
              type="text"
              value={form.sizes}
              onChange={(event) => updateField("sizes", event.target.value)}
              placeholder="S,M,L,XL"
              className={inputClassName}
            />
          </div>

          <button
            type="button"
            onClick={handleImport}
            disabled={isBusy}
            className="w-full rounded-2xl bg-neutral-900 px-4 py-3 text-sm font-bold text-white transition active:scale-[0.98] disabled:opacity-50"
          >
            {status === "loading" && !fetchingZozo ? "Importing..." : "Import Product"}
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
