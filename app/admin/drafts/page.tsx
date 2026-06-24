"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { deferClientUpdate } from "@/lib/react/defer-client-update";
import { AdminShell } from "@/components/admin/AdminShell";
import { SizeTableEditor } from "@/components/admin/SizeTableEditor";
import { openStockSync } from "@/lib/admin/stock-sync";
import { getProductGenderLabel, type ProductGender } from "@/lib/products/product-gender";
import { filterProductsBySearch } from "@/lib/products/product-search";
import type { ZozoSizeTableRow } from "@/lib/products/size-table-json";
import type { DraftProduct } from "@/lib/types/product-import";

export default function DraftsPage() {
  const [products, setProducts] = useState<DraftProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [publishingId, setPublishingId] = useState<number | null>(null);
  const [syncingId, setSyncingId] = useState<number | null>(null);
  const [savingGenderId, setSavingGenderId] = useState<number | null>(null);
  const [genderDrafts, setGenderDrafts] = useState<Record<number, ProductGender>>({});
  const [sizeTableDrafts, setSizeTableDrafts] = useState<Record<number, ZozoSizeTableRow[]>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedDescriptions, setExpandedDescriptions] = useState<Record<number, boolean>>({});

  const toggleDescription = (productId: number) => {
    setExpandedDescriptions((prev) => ({
      ...prev,
      [productId]: !prev[productId],
    }));
  };

  const filteredProducts = useMemo(
    () =>
      filterProductsBySearch(
        products.map((product) => ({
          ...product,
          name: product.name_zh || product.name_jp,
        })),
        searchQuery
      ),
    [products, searchQuery]
  );

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

      const list: DraftProduct[] = Array.isArray(data.products) ? data.products : [];
      list.forEach((product: DraftProduct) => {
        console.log("DRAFT PRODUCT", product);
      });
      setProducts(list);
      setGenderDrafts(
        Object.fromEntries(list.map((product) => [product.id, product.gender || "unisex"]))
      );
      setSizeTableDrafts(
        Object.fromEntries(list.map((product) => [product.id, product.size_table_json || []]))
      );
    } catch {
      setError("網路錯誤，請稍後再試");
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    deferClientUpdate(() => {
      void loadDrafts();
    });
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

  const handleSyncStock = (product: DraftProduct) => {
    setSyncingId(product.id);

    try {
      const sourceUrl = product.source_url || product.sourceUrl || product.url;

      if (!sourceUrl?.trim()) {
        console.log("SYNC PRODUCT MISSING SOURCE_URL", product);
        alert("此商品沒有來源網址，無法同步庫存");
        return;
      }

      const opened = openStockSync(sourceUrl, product.id);
      if (opened) {
        alert("已開啟 ZOZO 商品頁，請先選擇顏色，再按「同步目前顏色庫存」");
      }
    } finally {
      setSyncingId(null);
    }
  };

  const handleSaveGender = async (productId: number) => {
    const gender = genderDrafts[productId] || "unisex";
    setSavingGenderId(productId);

    try {
      const response = await fetch("/api/products/gender", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: productId, gender }),
      });
      const data = await response.json();

      if (!response.ok) {
        alert(data.error || "更新性別失敗");
        return;
      }

      setProducts((prev) =>
        prev.map((product) => (product.id === productId ? { ...product, gender } : product))
      );
    } catch {
      alert("網路錯誤，請稍後再試");
    } finally {
      setSavingGenderId(null);
    }
  };

  return (
    <AdminShell title="Draft 管理">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-neutral-500">
            共 {filteredProducts.length} 筆 Draft 商品
            {searchQuery.trim() ? `（全部 ${products.length} 筆）` : ""}
          </p>
          <button
            type="button"
            onClick={loadDrafts}
            className="rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-bold text-neutral-700"
          >
            重新整理
          </button>
        </div>

        <label className="flex items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-4 py-3">
          <span className="text-xs font-bold text-neutral-400">搜尋</span>
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="JGO ID、商品名、品牌、source_product_id"
            className="w-full bg-transparent text-sm text-neutral-900 outline-none placeholder:text-neutral-400"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="shrink-0 rounded-full bg-neutral-100 px-2 py-1 text-[11px] font-bold text-neutral-600"
            >
              清除
            </button>
          ) : null}
        </label>

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

        {!loading && !error && products.length > 0 && filteredProducts.length === 0 && (
          <div className="rounded-3xl border border-neutral-100 bg-neutral-50 p-8 text-center">
            <p className="text-sm font-bold text-neutral-700">找不到符合搜尋條件的 Draft 商品</p>
            <p className="mt-2 text-xs text-neutral-500">可搜尋 JGO ID、商品名、品牌、source_product_id</p>
          </div>
        )}

        {!loading &&
          filteredProducts.map((product) => (
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
                  <div className="mt-2 space-y-1 text-xs text-neutral-500">
                    <p>J-GO ID：{product.id}</p>
                    <p>來源：{product.source_site || "unknown"}</p>
                    <p>來源商品ID：{product.source_product_id || "-"}</p>
                  </div>
                </div>
              </div>

              <div className="border-t border-neutral-100 px-4 py-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-bold text-neutral-500">性別分類</span>
                  <div className="flex gap-2">
                    <select
                      className="h-10 flex-1 rounded-2xl border border-neutral-200 bg-white px-3 text-sm font-bold outline-none"
                      value={genderDrafts[product.id] || product.gender || "unisex"}
                      onChange={(event) =>
                        setGenderDrafts((prev) => ({
                          ...prev,
                          [product.id]: event.target.value as ProductGender,
                        }))
                      }
                    >
                      <option value="male">男生 male</option>
                      <option value="female">女生 female</option>
                      <option value="unisex">中性 unisex</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => handleSaveGender(product.id)}
                      disabled={savingGenderId === product.id}
                      className="rounded-2xl bg-neutral-900 px-4 text-xs font-bold text-white disabled:opacity-50"
                    >
                      {savingGenderId === product.id ? "Saving..." : "儲存"}
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] text-neutral-400">
                    目前：{getProductGenderLabel(genderDrafts[product.id] || product.gender || "unisex")}
                  </p>
                </label>
              </div>

              <div className="border-t border-neutral-100 px-4 py-3">
                <SizeTableEditor
                  key={product.id}
                  productId={product.id}
                  initialRows={sizeTableDrafts[product.id] || product.size_table_json || []}
                  onSaved={(rows) => {
                    setSizeTableDrafts((prev) => ({ ...prev, [product.id]: rows }));
                    setProducts((prev) =>
                      prev.map((item) =>
                        item.id === product.id ? { ...item, size_table_json: rows } : item
                      )
                    );
                  }}
                />
              </div>

              {(() => {
                const description =
                  product.description_zh?.trim() ||
                  product.description_jp?.trim() ||
                  "";
                const isDescriptionExpanded = expandedDescriptions[product.id] === true;

                if (!description) {
                  return null;
                }

                return (
                  <div className="border-t border-neutral-100 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => toggleDescription(product.id)}
                      className="text-xs font-bold text-neutral-700 underline decoration-neutral-300 underline-offset-2"
                    >
                      {isDescriptionExpanded ? "收合商品介紹" : "查看商品介紹"}
                    </button>
                    {isDescriptionExpanded ? (
                      <div className="mt-3 max-h-[300px] overflow-y-auto rounded-2xl bg-neutral-50 p-3 text-sm leading-relaxed text-neutral-600">
                        <p className="whitespace-pre-wrap">{description}</p>
                      </div>
                    ) : null}
                  </div>
                );
              })()}

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

              <div className="space-y-2 border-t border-neutral-100 px-4 py-3">
                <button
                  type="button"
                  onClick={() => handleSyncStock(product)}
                  disabled={syncingId === product.id || publishingId === product.id}
                  className="w-full rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700 transition active:scale-[0.98] disabled:opacity-50"
                >
                  {syncingId === product.id ? "Opening..." : "同步庫存"}
                </button>
                <button
                  type="button"
                  onClick={() => handlePublish(product.id)}
                  disabled={publishingId === product.id || syncingId === product.id}
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
