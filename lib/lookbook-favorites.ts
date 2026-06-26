export const GUEST_FAVORITE_LOOKBOOK_IDS_KEY = "jgo_favorite_lookbook_ids_guest";

/** Guest vs signed-in Clerk users use separate localStorage keys. Load only after client mount. */

function normalizeFavoriteLookbookIds(ids: unknown): number[] {
  if (!Array.isArray(ids)) {
    return [];
  }

  return Array.from(
    new Set(
      ids
        .map((id) => Number(id))
        .filter((id) => !Number.isNaN(id) && id > 0)
    )
  );
}

export function getFavoriteLookbookIdsStorageKey(userId?: string | null): string {
  const normalized = String(userId || "").trim();
  if (!normalized) {
    return GUEST_FAVORITE_LOOKBOOK_IDS_KEY;
  }

  return `jgo_favorite_lookbook_ids_${normalized}`;
}

export function loadFavoriteLookbookIds(storageKeyOrUserId?: string | null): number[] {
  if (typeof window === "undefined") {
    return [];
  }

  const storageKey = storageKeyOrUserId?.startsWith("jgo_favorite_lookbook_ids_")
    ? storageKeyOrUserId
    : getFavoriteLookbookIdsStorageKey(storageKeyOrUserId);

  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return [];
    }

    return normalizeFavoriteLookbookIds(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveFavoriteLookbookIds(ids: number[], storageKeyOrUserId?: string | null): void {
  if (typeof window === "undefined") {
    return;
  }

  const storageKey = storageKeyOrUserId?.startsWith("jgo_favorite_lookbook_ids_")
    ? storageKeyOrUserId
    : getFavoriteLookbookIdsStorageKey(storageKeyOrUserId);

  localStorage.setItem(storageKey, JSON.stringify(normalizeFavoriteLookbookIds(ids)));
}

export function toggleFavoriteLookbookId(ids: number[], lookbookId: number): number[] {
  const id = Number(lookbookId);
  if (!id || Number.isNaN(id)) {
    return ids;
  }

  if (ids.some((entry) => Number(entry) === id)) {
    return ids.filter((entry) => Number(entry) !== id);
  }

  return [...ids, id];
}

export function isFavoriteLookbook(ids: number[], lookbookId: number): boolean {
  const id = Number(lookbookId);
  return ids.some((entry) => Number(entry) === id);
}

export function resolveLookbookId(lookbook: { id?: unknown; lookbook_id?: unknown }, index = 0): number {
  const fromLookbookId = Number(lookbook?.lookbook_id);
  if (!Number.isNaN(fromLookbookId) && fromLookbookId > 0) {
    return fromLookbookId;
  }

  const fromId = Number(lookbook?.id);
  if (!Number.isNaN(fromId) && fromId > 0) {
    return fromId;
  }

  return index + 1;
}
