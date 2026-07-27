import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  requireAdminUser,
  serverErrorResponse,
  unauthorizedResponse,
} from "@/lib/auth/require-admin";
import { getBulkStockSyncJobSummary } from "@/lib/admin/bulk-stock-sync-job";

export async function GET(request: NextRequest) {
  const admin = await requireAdminUser();
  if (!admin) {
    return unauthorizedResponse();
  }

  const jobId = request.nextUrl.searchParams.get("job_id")?.trim();
  if (!jobId) {
    return badRequestResponse("請提供 job_id");
  }

  const summary = getBulkStockSyncJobSummary(jobId);
  if (!summary) {
    return serverErrorResponse("找不到同步工作，請重新開始");
  }

  return NextResponse.json({
    success: true,
    job_id: summary.job_id,
    status: summary.status,
    total: summary.total,
    completed: summary.completed,
    success_count: summary.success,
    failed: summary.failed,
    unpublished: summary.unpublished,
    skipped: summary.skipped,
    current_product_name: summary.current_product_name,
    cursor: summary.cursor,
    results: summary.results,
  });
}
