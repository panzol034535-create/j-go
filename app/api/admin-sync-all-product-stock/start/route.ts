import { NextResponse } from "next/server";
import {
  badRequestResponse,
  requireAdminUser,
  serverErrorResponse,
  unauthorizedResponse,
} from "@/lib/auth/require-admin";
import { startBulkStockSyncJob } from "@/lib/admin/bulk-stock-sync-job";

export async function POST() {
  const admin = await requireAdminUser();
  if (!admin) {
    return unauthorizedResponse();
  }

  try {
    const job = await startBulkStockSyncJob();
    return NextResponse.json({
      success: true,
      message:
        job.total > 0
          ? "已建立同步工作，共 " + job.total + " 件商品"
          : "沒有可同步的已發布商品",
      job_id: job.job_id,
      status: job.status,
      total: job.total,
      completed: job.completed,
      success_count: job.success,
      failed: job.failed,
      unpublished: job.unpublished,
      skipped: job.skipped,
      current_product_name: job.current_product_name,
      cursor: job.cursor,
      results: job.results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "建立同步工作失敗";
    return serverErrorResponse(message);
  }
}
