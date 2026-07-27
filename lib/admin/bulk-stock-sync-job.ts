import {
  loadSyncablePublishedProducts,
  sleep,
  syncOneProductStock,
  type SyncableProduct,
  type SyncOneProductStockResult,
} from "@/lib/admin/sync-one-product-stock";

export const BULK_STOCK_SYNC_BATCH_SIZE = 3;
export const BULK_STOCK_SYNC_ITEM_DELAY_MS = 800;

export type BulkStockSyncJobStatus = "idle" | "running" | "completed";

export type BulkStockSyncJob = {
  id: string;
  createdAt: number;
  status: BulkStockSyncJobStatus;
  total: number;
  cursor: number;
  completed: number;
  success: number;
  failed: number;
  unpublished: number;
  republished: number;
  uncertain: number;
  skipped: number;
  currentProductName: string | null;
  products: SyncableProduct[];
  results: SyncOneProductStockResult[];
};

type BulkStockSyncJobStore = Map<string, BulkStockSyncJob>;

declare global {
  // eslint-disable-next-line no-var
  var __bulkStockSyncJobs: BulkStockSyncJobStore | undefined;
}

function getJobStore(): BulkStockSyncJobStore {
  if (!globalThis.__bulkStockSyncJobs) {
    globalThis.__bulkStockSyncJobs = new Map();
  }

  return globalThis.__bulkStockSyncJobs;
}

function createJobId(): string {
  return `bulk-stock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function summarizeJob(job: BulkStockSyncJob) {
  return {
    job_id: job.id,
    status: job.status,
    total: job.total,
    completed: job.completed,
    success: job.success,
    failed: job.failed,
    unpublished: job.unpublished,
    republished: job.republished,
    uncertain: job.uncertain,
    skipped: job.skipped,
    current_product_name: job.currentProductName,
    cursor: job.cursor,
    results: job.results,
  };
}

export async function startBulkStockSyncJob(): Promise<ReturnType<typeof summarizeJob>> {
  const products = await loadSyncablePublishedProducts();
  const job: BulkStockSyncJob = {
    id: createJobId(),
    createdAt: Date.now(),
    status: products.length > 0 ? "running" : "completed",
    total: products.length,
    cursor: 0,
    completed: 0,
    success: 0,
    failed: 0,
    unpublished: 0,
    republished: 0,
    uncertain: 0,
    skipped: 0,
    currentProductName: null,
    products,
    results: [],
  };

  getJobStore().set(job.id, job);
  return summarizeJob(job);
}

export function getBulkStockSyncJob(jobId: string): BulkStockSyncJob | null {
  return getJobStore().get(jobId) ?? null;
}

function recordJobResult(job: BulkStockSyncJob, result: SyncOneProductStockResult) {
  job.results.push(result);
  job.completed += 1;
  job.cursor += 1;

  if (result.action === "updated" && result.success) {
    job.success += 1;
    return;
  }

  if (result.action === "republished" && result.success) {
    job.success += 1;
    job.republished += 1;
    return;
  }

  if (result.action === "unpublished" && result.success) {
    job.unpublished += 1;
    return;
  }

  if (result.action === "uncertain" && result.success) {
    job.uncertain += 1;
    return;
  }

  if (result.action === "skipped") {
    job.skipped += 1;
    return;
  }

  job.failed += 1;
}

function buildFailedResult(product: SyncableProduct, reason: string): SyncOneProductStockResult {
  return {
    product_id: product.id,
    name: product.name,
    success: false,
    action: "failed",
    reason,
  };
}

export async function processBulkStockSyncBatch(
  jobId: string,
  batchSize = BULK_STOCK_SYNC_BATCH_SIZE
): Promise<ReturnType<typeof summarizeJob>> {
  const job = getBulkStockSyncJob(jobId);
  if (!job) {
    throw new Error("找不到同步工作，請重新開始");
  }

  if (job.status === "completed") {
    return summarizeJob(job);
  }

  console.log("SYNC ALL NEXT START", jobId);

  job.status = "running";
  const end = Math.min(job.cursor + batchSize, job.products.length);

  for (let index = job.cursor; index < end; index += 1) {
    const product = job.products[index];
    const startedAt = Date.now();
    job.currentProductName = product.name;

    console.log(
      "SYNC ALL ITEM START",
      product.id,
      product.name,
      product.source_site,
      product.source_url || product.source_product_id || ""
    );

    try {
      const result = await syncOneProductStock(product);

      if (result.action === "skipped") {
        console.log("SYNC ALL ITEM SKIPPED", product.id, result.reason || "skipped");
      }

      console.log(
        "SYNC ALL ITEM DONE",
        product.id,
        result.action,
        result.reason || "",
        Date.now() - startedAt
      );

      recordJobResult(job, result);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unexpected_error";
      const failedResult = buildFailedResult(product, reason);

      console.log(
        "SYNC ALL ITEM DONE",
        product.id,
        failedResult.action,
        failedResult.reason || "",
        Date.now() - startedAt
      );

      recordJobResult(job, failedResult);
    }

    if (index < end - 1) {
      await sleep(BULK_STOCK_SYNC_ITEM_DELAY_MS);
    }
  }

  job.currentProductName = null;

  if (job.cursor >= job.products.length) {
    job.status = "completed";
  }

  getJobStore().set(job.id, job);

  console.log(
    "SYNC ALL NEXT DONE",
    jobId,
    job.completed,
    job.success,
    job.failed,
    job.skipped,
    job.unpublished
  );

  return summarizeJob(job);
}

export function getBulkStockSyncJobSummary(jobId: string) {
  const job = getBulkStockSyncJob(jobId);
  if (!job) {
    return null;
  }

  return summarizeJob(job);
}
