import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  requireAdminUser,
  serverErrorResponse,
  unauthorizedResponse,
} from "@/lib/auth/require-admin";
import { processBulkStockSyncBatch } from "@/lib/admin/bulk-stock-sync-job";

type NextRequestBody = {
  job_id?: string;
  batch_size?: number;
};

export async function POST(request: NextRequest) {
  const admin = await requireAdminUser();
  if (!admin) {
    return unauthorizedResponse();
  }

  let body: NextRequestBody;
  try {
    body = (await request.json()) as NextRequestBody;
  } catch {
    return badRequestResponse("Request body 格式錯誤");
  }

  const jobId = String(body.job_id ?? "").trim();
  if (!jobId) {
    return badRequestResponse("請提供 job_id");
  }

  const batchSize = Number(body.batch_size);
  const resolvedBatchSize =
    Number.isFinite(batchSize) && batchSize > 0 ? Math.min(batchSize, 3) : undefined;

  try {
    const summary = await processBulkStockSyncBatch(jobId, resolvedBatchSize);
    const done = summary.status === "completed";

    return NextResponse.json({
      success: true,
      done,
      message: done
        ? "同步完成：成功 " +
          summary.success +
          " 件，失敗 " +
          summary.failed +
          " 件，自動下架 " +
          summary.unpublished +
          " 件"
        : "同步進行中：已完成 " + summary.completed + " / " + summary.total,
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "批次同步失敗";
    return serverErrorResponse(message);
  }
}
