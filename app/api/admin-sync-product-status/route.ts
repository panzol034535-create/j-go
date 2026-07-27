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

type StatusRequestBody = {
  product_id?: number;
  product_name?: string;
  status?: "draft" | "unpublished";
  check_status?: ExtensionSourceStatus;
  last_stock_status?: string;
};

const VALID_CHECK_STATUSES = new Set<ExtensionSourceStatus>([
  "source_missing",
  "discontinued",
  "all_out_of_stock",
]);

export async function POST(request: NextRequest) {
  const admin = await requireAdminUser();
  if (!admin) {
    return unauthorizedResponse();
  }

  let body: StatusRequestBody;
  try {
    body = (await request.json()) as StatusRequestBody;
  } catch {
    return badRequestResponse("Request body 格式錯誤");
  }

  const productId = body.product_id;
  if (!productId || typeof productId !== "number") {
    return badRequestResponse("請提供有效的 product_id");
  }

  const checkStatus = body.check_status;
  if (!checkStatus || !VALID_CHECK_STATUSES.has(checkStatus)) {
    return badRequestResponse("請提供有效的 check_status");
  }

  try {
    const result = await applyExtensionStockSyncResult({
      productId,
      productName: body.product_name,
      source_status: checkStatus,
    });

    if (!result.success) {
      return serverErrorResponse(result.reason || "更新商品狀態失敗");
    }

    return NextResponse.json({
      success: true,
      action: result.action,
      reason: result.reason,
      message: `商品已自動下架（${result.reason || checkStatus}）`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "更新商品狀態失敗";
    return serverErrorResponse(message);
  }
}
