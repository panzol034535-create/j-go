const STORAGE_KEY = "jgo_favorites";

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

export function loadFavoriteIds(): number[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    return normalizeFavoriteIds(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveFavoriteIds(ids: number[]): void {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeFavoriteIds(ids)));
}

export function toggleFavoriteId(ids: number[], productId: number): number[] {
  const id = Number(productId);
  if (!id || Number.isNaN(id)) {
    return ids;
  }

  if (ids.includes(id)) {
    return ids.filter((entry) => entry !== id);
  }

  return [...ids, id];
}

export function isFavoriteProduct(ids: number[], productId: number): boolean {
  const id = Number(productId);
  return ids.some((entry) => Number(entry) === id);
}
