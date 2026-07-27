import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  requireAdminUser,
  serverErrorResponse,
  unauthorizedResponse,
} from "@/lib/auth/require-admin";
import {
  applyExtensionStockSyncResult,
  type ExtensionSourceStatus,
} from "@/lib/admin/sync-one-product-stock";
import type { VariantStockEntry } from "@/lib/products/variant-stock-normalize";

type SyncRequestBody = {
  product_id?: number;
  product_name?: string;
  source_status?: ExtensionSourceStatus;
  variant_stock?: VariantStockEntry[];
  current_jpy_price?: number;
  access_denied?: boolean;
};

const VALID_SOURCE_STATUSES = new Set<ExtensionSourceStatus>([
  "available",
  "source_missing",
  "discontinued",
  "all_out_of_stock",
  "sync_uncertain",
  "needs_manual_review",
]);

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

  const sourceStatus = body.source_status;
  if (sourceStatus && !VALID_SOURCE_STATUSES.has(sourceStatus)) {
    return badRequestResponse("source_status 無效");
  }

  console.log("JGO SYNC RECEIVED VARIANTS", productId, body.variant_stock);

  try {
    const result = await applyExtensionStockSyncResult({
      productId,
      productName: body.product_name,
      source_status: sourceStatus,
      variant_stock: body.variant_stock,
      current_jpy_price: body.current_jpy_price,
      access_denied: body.access_denied === true,
    });

    if (!result.success) {
      return serverErrorResponse(result.reason || "同步庫存失敗");
    }

    const actionMessage =
      result.action === "unpublished"
        ? `商品已自動下架（${result.reason || sourceStatus}）`
        : result.action === "republished"
          ? "已恢復上架"
          : result.action === "uncertain"
            ? `同步狀態不確定，已標記人工檢查（${result.reason || "uncertain"}）`
            : result.price_synced
              ? `已同步 ${result.updated_variants ?? result.synced_count ?? 0} 個尺寸庫存並更新價格`
              : `已同步 ${result.updated_variants ?? result.synced_count ?? 0} 個尺寸庫存`;

    return NextResponse.json({
      success: true,
      action: result.action,
      reason: result.reason,
      synced_count: result.synced_count ?? 0,
      updated_variants: result.updated_variants ?? result.synced_count ?? 0,
      skipped_variants: result.skipped_variants ?? [],
      price_synced: result.price_synced ?? false,
      message: actionMessage,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "同步庫存失敗";
    return serverErrorResponse(message);
  }
}
