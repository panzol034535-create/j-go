import { NextResponse } from "next/server";
import {
  requireAdminUser,
  serverErrorResponse,
  unauthorizedResponse,
} from "@/lib/auth/require-admin";
import { isRecoverableDraftProduct } from "@/lib/admin/stock-sync-policy";
import { isZozoSyncSource } from "@/lib/admin/sync-one-product-stock";
import { fetchMergedProducts } from "@/lib/server/fetch-products";
import {
  fetchXanoJson,
  isXanoFetchError,
  xanoErrorResponse,
} from "@/lib/server/fetch-revalidated";
import { normalizeStockMonitorProducts } from "@/lib/stock-monitor/normalize-product";

export async function GET() {
  const admin = await requireAdminUser();
  if (!admin) {
    return unauthorizedResponse();
  }

  const listUrl = process.env.XANO_STOCK_MONITOR_PRODUCTS_URL;
  if (!listUrl) {
    return serverErrorResponse("XANO_STOCK_MONITOR_PRODUCTS_URL 未設定");
  }

  try {
    const [data, mergedProducts] = await Promise.all([
      fetchXanoJson(listUrl, { revalidate: false }),
      fetchMergedProducts(),
    ]);

    const mergedById = new Map<number, Record<string, unknown>>();
    for (const raw of mergedProducts) {
      if (!raw || typeof raw !== "object") {
        continue;
      }

      const id = Number((raw as Record<string, unknown>).id);
      if (Number.isFinite(id) && id > 0) {
        mergedById.set(id, raw as Record<string, unknown>);
      }
    }

    const products = normalizeStockMonitorProducts(data).map((product) => {
      const merged = mergedById.get(product.id);
      const status = String(merged?.status ?? product.status ?? "published")
        .trim()
        .toLowerCase();
      const checkStatus = String(
        merged?.check_status ?? product.check_status ?? ""
      )
        .trim()
        .toLowerCase();
      const sourceUrl = String(merged?.source_url ?? product.source_url ?? "");
      const sourceSite = String(merged?.source_site ?? product.source_site ?? "");
      const recoverableDraft = isRecoverableDraftProduct({
        status,
        checkStatus,
        sourceUrl,
        isZozo: isZozoSyncSource({
          id: product.id,
          name: product.name,
          source_url: sourceUrl,
          source_site: sourceSite,
          source_product_id: "",
          status,
        }),
      });

      return {
        ...product,
        status,
        check_status: checkStatus || product.check_status,
        source_url: sourceUrl || product.source_url,
        source_site: (sourceSite || product.source_site) as typeof product.source_site,
        recoverable_draft: recoverableDraft,
      };
    });

    const recoverableDraftCount = products.filter((product) => product.recoverable_draft).length;

    return NextResponse.json({
      products,
      recoverable_draft_count: recoverableDraftCount,
    });
  } catch (error) {
    if (isXanoFetchError(error)) {
      return xanoErrorResponse(error, "讀取監控商品失敗");
    }

    const message = error instanceof Error ? error.message : "讀取失敗";
    return serverErrorResponse(message);
  }
}
