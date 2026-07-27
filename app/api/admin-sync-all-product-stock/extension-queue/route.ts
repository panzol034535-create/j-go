import { NextResponse } from "next/server";
import {
  requireAdminUser,
  serverErrorResponse,
  unauthorizedResponse,
} from "@/lib/auth/require-admin";
import { loadExtensionBulkSyncItems } from "@/lib/admin/extension-bulk-sync-items";
import { isXanoFetchError, xanoErrorResponse } from "@/lib/server/fetch-revalidated";

export async function GET() {
  const admin = await requireAdminUser();
  if (!admin) {
    return unauthorizedResponse();
  }

  try {
    const result = await loadExtensionBulkSyncItems();

    return NextResponse.json({
      success: true,
      total: result.syncable_count,
      products: result.items,
      items: result.items,
      excluded: result.excluded,
      total_monitor_products: result.total_monitor_products,
      syncable_count: result.syncable_count,
      excluded_count: result.excluded_count,
    });
  } catch (error) {
    if (isXanoFetchError(error)) {
      return xanoErrorResponse(error, "讀取同步清單失敗");
    }

    const message = error instanceof Error ? error.message : "讀取同步清單失敗";
    return serverErrorResponse(message);
  }
}
