export const GUEST_FAVORITE_IDS_KEY = "jgo_favorite_ids_guest";

/** Guest vs signed-in Clerk users use separate localStorage keys. Load only after client mount. */

function normalizeFavoriteIds(ids: unknown): number[] {
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

export function getFavoriteIdsStorageKey(userId?: string | null): string {
  const normalized = String(userId || "").trim();
  if (!normalized) {
    return GUEST_FAVORITE_IDS_KEY;
  }

  return `jgo_favorite_ids_${normalized}`;
}

export function loadFavoriteIds(storageKeyOrUserId?: string | null): number[] {
  if (typeof window === "undefined") {
    return [];
  }

  const storageKey = storageKeyOrUserId?.startsWith("jgo_favorite_ids_")
    ? storageKeyOrUserId
    : getFavoriteIdsStorageKey(storageKeyOrUserId);

  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return [];
    }

    return normalizeFavoriteIds(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveFavoriteIds(ids: number[], storageKeyOrUserId?: string | null): void {
  if (typeof window === "undefined") {
    return;
  }

  const storageKey = storageKeyOrUserId?.startsWith("jgo_favorite_ids_")
    ? storageKeyOrUserId
    : getFavoriteIdsStorageKey(storageKeyOrUserId);

  localStorage.setItem(storageKey, JSON.stringify(normalizeFavoriteIds(ids)));
}

export function toggleFavoriteId(ids: number[], productId: number): number[] {
  const id = Number(productId);
  if (!id || Number.isNaN(id)) {
    return ids;
  }

  if (ids.some((entry) => Number(entry) === id)) {
    return ids.filter((entry) => Number(entry) !== id);
  }

  return [...ids, id];
}

export function isFavoriteProduct(ids: number[], productId: number): boolean {
  const id = Number(productId);
  return ids.some((entry) => Number(entry) === id);
}
