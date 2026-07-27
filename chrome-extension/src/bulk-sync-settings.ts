export type BulkSyncSettings = {
  slowSyncMode: boolean;
  batchSize: number;
  itemDelayMinMs: number;
  itemDelayMaxMs: number;
  batchPauseMinMs: number;
  batchPauseMaxMs: number;
};

export const DEFAULT_BULK_SYNC_SETTINGS: BulkSyncSettings = {
  slowSyncMode: true,
  batchSize: 5,
  itemDelayMinMs: 20_000,
  itemDelayMaxMs: 45_000,
  batchPauseMinMs: 3 * 60_000,
  batchPauseMaxMs: 5 * 60_000,
};

export const STORAGE_KEY_BULK_SYNC_SETTINGS = "jgoBulkSyncSettings";

function toPositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export async function loadBulkSyncSettings(): Promise<BulkSyncSettings> {
  const stored = await chrome.storage.sync.get(STORAGE_KEY_BULK_SYNC_SETTINGS);
  const raw = stored[STORAGE_KEY_BULK_SYNC_SETTINGS];

  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_BULK_SYNC_SETTINGS };
  }

  const settings = raw as Partial<BulkSyncSettings>;

  return {
    slowSyncMode:
      typeof settings.slowSyncMode === "boolean"
        ? settings.slowSyncMode
        : DEFAULT_BULK_SYNC_SETTINGS.slowSyncMode,
    batchSize: toPositiveInt(settings.batchSize, DEFAULT_BULK_SYNC_SETTINGS.batchSize),
    itemDelayMinMs: toPositiveInt(
      settings.itemDelayMinMs,
      DEFAULT_BULK_SYNC_SETTINGS.itemDelayMinMs
    ),
    itemDelayMaxMs: toPositiveInt(
      settings.itemDelayMaxMs,
      DEFAULT_BULK_SYNC_SETTINGS.itemDelayMaxMs
    ),
    batchPauseMinMs: toPositiveInt(
      settings.batchPauseMinMs,
      DEFAULT_BULK_SYNC_SETTINGS.batchPauseMinMs
    ),
    batchPauseMaxMs: toPositiveInt(
      settings.batchPauseMaxMs,
      DEFAULT_BULK_SYNC_SETTINGS.batchPauseMaxMs
    ),
  };
}

export function randomDelayMs(minMs: number, maxMs: number): number {
  const min = Math.min(minMs, maxMs);
  const max = Math.max(minMs, maxMs);
  return min + Math.floor(Math.random() * (max - min + 1));
}
