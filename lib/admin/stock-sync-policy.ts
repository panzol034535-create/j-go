export const CONFIDENT_UNPUBLISH_SOURCE_STATUSES = [
  "source_missing",
  "discontinued",
  "all_out_of_stock",
] as const;

export type ConfidentUnpublishSourceStatus =
  (typeof CONFIDENT_UNPUBLISH_SOURCE_STATUSES)[number];

export const UNCERTAIN_MONITOR_CHECK_STATUSES = [
  "needs_manual_review",
  "sync_uncertain",
] as const;

export type UncertainMonitorCheckStatus =
  (typeof UNCERTAIN_MONITOR_CHECK_STATUSES)[number];

export const RECOVERABLE_DRAFT_CHECK_STATUSES = new Set<string>([
  "all_out_of_stock",
  "source_missing",
  "discontinued",
  "needs_manual_review",
  "sync_uncertain",
]);

export function isConfidentUnpublishSourceStatus(
  value: string
): value is ConfidentUnpublishSourceStatus {
  return CONFIDENT_UNPUBLISH_SOURCE_STATUSES.includes(
    value as ConfidentUnpublishSourceStatus
  );
}

export function isRecoverableDraftProduct(options: {
  status: string;
  checkStatus: string;
  sourceUrl: string | null;
  isZozo: boolean;
}): boolean {
  const status = options.status.trim().toLowerCase();
  const checkStatus = options.checkStatus.trim().toLowerCase();

  return (
    status === "draft" &&
    options.isZozo &&
    Boolean(options.sourceUrl?.trim()) &&
    RECOVERABLE_DRAFT_CHECK_STATUSES.has(checkStatus)
  );
}
