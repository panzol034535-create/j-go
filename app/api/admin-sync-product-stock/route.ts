import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  requireAdminUser,
  serverErrorResponse,
  unauthorizedResponse,
} from "@/lib/auth/require-admin";
import { deriveVariantsListUrl } from "@/lib/products/merge-product-variants";
import {
  buildProductPriceUpdatePayload,
  buildProductStockStatusPayload,
  fetchPricingSettings,
  parseCurrentJpyPrice,
  resolveLastStockStatusFromVariants,
} from "@/lib/products/sync-product-price";
import {
  normalizeSize,
  normalizeStoredColor,
  normalizeVariantStockEntries,
  type VariantStockEntry,
} from "@/lib/products/variant-stock-normalize";

const DEFAULT_PRODUCTS_URL =
  "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/products";

const DEFAULT_UPDATE_VARIANT_STOCK_URL =
  "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/update-variant-stock";

const DEFAULT_UPDATE_PRODUCT_STOCK_URL =
  "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/update-product-stock";

type SyncRequestBody = {
  product_id?: number;
  variant_stock?: VariantStockEntry[];
  current_jpy_price?: number;
};

type MatchedVariantUpdate = {
  variant_id: number;
  product_id: number;
  color: string;
  size: string;
  stock_status: string;
};

async function fetchVariantRecords(variantsUrl: string): Promise<Record<string, unknown>[]> {
  const candidateUrls = Array.from(
    new Set([
      variantsUrl,
      variantsUrl.replace(/\/variants\/?$/, "/product_variants"),
      variantsUrl.replace(/\/variants\/?$/, "/product-variant"),
    ])
  );

  for (const url of candidateUrls) {
    try {
      const response = await fetch(`${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        continue;
      }

      const data = await response.json();
      const records = Array.isArray(data)
        ? data
        : Array.isArray((data as Record<string, unknown>).items)
          ? ((data as Record<string, unknown>).items as Record<string, unknown>[])
          : [];

      if (records.length > 0) {
        return records.filter((item) => item && typeof item === "object") as Record<string, unknown>[];
      }
    } catch (error) {
      console.warn("SYNC STOCK VARIANT FETCH FAILED:", url, error);
    }
  }

  return [];
}

function getVariantProductId(record: Record<string, unknown>): number {
  return Number(record.product_id ?? record.products_id ?? record.productId ?? 0);
}

function getVariantId(record: Record<string, unknown>): number {
  return Number(record.id ?? record.variant_id ?? 0);
}

function getVariantColor(record: Record<string, unknown>): string {
  return normalizeStoredColor(String(record.color ?? "").trim());
}

function getVariantSize(record: Record<string, unknown>): string {
  return normalizeSize(String(record.size ?? record.size_name ?? "").trim());
}

function matchVariantsForUpdate(
  productId: number,
  variantRecords: Record<string, unknown>[],
  normalizedVariantStock: VariantStockEntry[]
): MatchedVariantUpdate[] {
  const productVariants = variantRecords.filter(
    (record) => getVariantProductId(record) === productId
  );

  const updates: MatchedVariantUpdate[] = [];

  for (const entry of normalizedVariantStock) {
    const matched = productVariants.find((record) => {
      return (
        getVariantColor(record) === entry.color && getVariantSize(record) === entry.size
      );
    });

    if (!matched) {
      console.log("SYNC VARIANT NOT FOUND", {
        product_id: productId,
        color: entry.color,
        size: entry.size,
      });
      continue;
    }

    const variantId = getVariantId(matched);
    if (!variantId) {
      continue;
    }

    updates.push({
      variant_id: variantId,
      product_id: productId,
      color: entry.color,
      size: entry.size,
      stock_status: entry.stock_status,
    });
  }

  return updates;
}

async function updateVariantStock(
  updateUrl: string,
  update: MatchedVariantUpdate
): Promise<{ ok: boolean; status: number; body: string }> {
  const payload = {
    variant_id: update.variant_id,
    stock_status: update.stock_status,
  };

  console.log("UPDATE VARIANT STOCK", {
    product_id: update.product_id,
    color: update.color,
    size: update.size,
    ...payload,
  });

  const response = await fetch(updateUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const body = await response.text();
  console.log("XANO UPDATE VARIANT STOCK RESPONSE", update.variant_id, response.status, body);

  return {
    ok: response.ok,
    status: response.status,
    body,
  };
}

async function postUpdateProductStock(
  updateUrl: string,
  payload: Record<string, unknown>
): Promise<{ ok: boolean; body: string }> {
  console.log("UPDATE PRODUCT STOCK PAYLOAD", payload);

  const response = await fetch(updateUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const body = await response.text();
  console.log("XANO UPDATE PRODUCT STOCK RESPONSE", payload.product_id, response.status, body);

  return {
    ok: response.ok,
    body,
  };
}

async function updateProductPriceAndStatus(
  updateUrl: string,
  productId: number,
  currentJpyPrice: number,
  normalizedVariantStock: VariantStockEntry[]
): Promise<{ ok: boolean; newPrice: number | null; body: string }> {
  const settings = await fetchPricingSettings();
  const lastStockStatus = resolveLastStockStatusFromVariants(normalizedVariantStock);
  const payload = buildProductPriceUpdatePayload({
    productId,
    currentJpyPrice,
    settings,
    lastStockStatus,
  });

  if (!payload) {
    return {
      ok: false,
      newPrice: null,
      body: "換算後台幣售價無效，已略過價格更新",
    };
  }

  console.log("SYNC PRICE", {
    product_id: productId,
    current_jpy_price: currentJpyPrice,
    newPrice: payload.price,
  });

  const result = await postUpdateProductStock(updateUrl, payload);

  return {
    ok: result.ok,
    newPrice: Number(payload.price),
    body: result.body,
  };
}

async function updateProductStockStatusOnly(
  updateUrl: string,
  productId: number,
  normalizedVariantStock: VariantStockEntry[]
): Promise<{ ok: boolean; body: string }> {
  const payload = buildProductStockStatusPayload(
    productId,
    resolveLastStockStatusFromVariants(normalizedVariantStock)
  );

  return postUpdateProductStock(updateUrl, payload);
}

export async function POST(request: NextRequest) {
  const admin = await requireAdminUser();
  if (!admin) {
    return unauthorizedResponse();
  }

  let body: SyncRequestBody;
  try {
    body = (await request.json()) as SyncRequestBody;
  } catch {
    return badRequestResponse("Request body 格式錯誤");
  }

  const productId = body.product_id;
  if (!productId || typeof productId !== "number") {
    return badRequestResponse("請提供有效的 product_id");
  }

  console.log("SYNC BODY", body);

  const normalizedVariantStock = normalizeVariantStockEntries(body.variant_stock);
  console.log("NORMALIZED VARIANT STOCK", normalizedVariantStock);

  if (normalizedVariantStock.length === 0) {
    return badRequestResponse("未取得可同步的庫存資料");
  }

  const currentJpyPrice = parseCurrentJpyPrice(body.current_jpy_price);
  // Price fields are sent to Xano only when currentJpyPrice > 0 (see buildProductPriceUpdatePayload).
  // Stock-only sync uses buildProductStockStatusPayload (no price / jpy_price / last_price_jpy).

  const updateVariantUrl =
    process.env.XANO_UPDATE_VARIANT_STOCK_URL || DEFAULT_UPDATE_VARIANT_STOCK_URL;
  const updateProductUrl =
    process.env.XANO_UPDATE_PRODUCT_STOCK_URL || DEFAULT_UPDATE_PRODUCT_STOCK_URL;

  const productsUrl = process.env.XANO_PRODUCTS_URL || DEFAULT_PRODUCTS_URL;
  const variantsUrl =
    process.env.XANO_LIST_VARIANTS_URL || deriveVariantsListUrl(productsUrl);

  try {
    const variantRecords = await fetchVariantRecords(variantsUrl);
    const updates = matchVariantsForUpdate(productId, variantRecords, normalizedVariantStock);

    if (updates.length === 0) {
      return badRequestResponse("找不到可更新的現有 variant，請確認商品已有顏色與尺寸");
    }

    console.log("SYNC MATCHED UPDATES", updates);

    let syncedCount = 0;
    const failures: string[] = [];

    for (const update of updates) {
      const result = await updateVariantStock(updateVariantUrl, update);
      if (result.ok) {
        syncedCount += 1;
        continue;
      }

      failures.push(
        `${update.color}/${update.size} (variant_id=${update.variant_id}): ${result.body || result.status}`
      );
    }

    if (syncedCount === 0) {
      return serverErrorResponse(
        failures[0] ? `同步庫存失敗：${failures[0]}` : "同步庫存失敗"
      );
    }

    let priceSynced = false;
    let syncedPrice: number | null = null;
    let priceSyncError: string | undefined;

    if (currentJpyPrice !== null) {
      const priceResult = await updateProductPriceAndStatus(
        updateProductUrl,
        productId,
        currentJpyPrice,
        normalizedVariantStock
      );

      if (priceResult.ok && priceResult.newPrice != null) {
        priceSynced = true;
        syncedPrice = priceResult.newPrice;
      } else {
        priceSyncError = priceResult.body || "更新商品價格失敗";
        console.warn("SYNC PRICE UPDATE FAILED", priceSyncError);

        const stockStatusResult = await updateProductStockStatusOnly(
          updateProductUrl,
          productId,
          normalizedVariantStock
        );

        if (!stockStatusResult.ok) {
          console.warn("SYNC STOCK STATUS UPDATE FAILED", stockStatusResult.body);
        }
      }
    } else {
      console.log("SYNC PRICE SKIPPED", {
        product_id: productId,
        current_jpy_price: body.current_jpy_price ?? null,
      });

      const stockStatusResult = await updateProductStockStatusOnly(
        updateProductUrl,
        productId,
        normalizedVariantStock
      );

      if (!stockStatusResult.ok) {
        console.warn("SYNC STOCK STATUS UPDATE FAILED", stockStatusResult.body);
      }
    }

    return NextResponse.json({
      success: true,
      synced_count: syncedCount,
      failed_count: failures.length,
      failures: failures.length > 0 ? failures : undefined,
      price_synced: priceSynced,
      current_jpy_price: currentJpyPrice ?? undefined,
      price: syncedPrice ?? undefined,
      price_sync_error: priceSyncError,
      message:
        priceSynced && syncedPrice != null && currentJpyPrice != null
          ? `已同步 ${syncedCount} 個尺寸庫存，日幣 ${currentJpyPrice} → 台幣 ${syncedPrice}`
          : priceSyncError
            ? `已同步 ${syncedCount} 個尺寸庫存（${priceSyncError}）`
            : `已同步 ${syncedCount} 個尺寸庫存`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "同步庫存失敗";
    return serverErrorResponse(message);
  }
}
