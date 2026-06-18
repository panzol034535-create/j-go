const STORAGE_KEY = "jgo_favorite_lookbooks";

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

export function loadFavoriteLookbookIds(): number[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    return normalizeFavoriteLookbookIds(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveFavoriteLookbookIds(ids: number[]): void {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeFavoriteLookbookIds(ids)));
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
