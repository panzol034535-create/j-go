export function getFavoriteCount(value: unknown): number {
  const count = Number(value);
  return !Number.isNaN(count) && count > 0 ? count : 0;
}

export function sortByFavoriteCount<T extends { favoriteCount?: number }>(
  items: T[],
  limit = 10
): T[] {
  return [...items]
    .sort((a, b) => getFavoriteCount(b.favoriteCount) - getFavoriteCount(a.favoriteCount))
    .slice(0, limit);
}

export type FavoriteSyncResult = {
  favoriteCount: number;
};

function resolveFavoriteCountFromResponse(
  data: Record<string, unknown>,
  fallback: number
): number {
  if (!("favorite_count" in data) && !("favoriteCount" in data)) {
    return Math.max(0, fallback);
  }

  const count = Number(data.favorite_count ?? data.favoriteCount);
  if (Number.isNaN(count) || count < 0) {
    return Math.max(0, fallback);
  }

  return count;
}

export async function syncProductFavoriteCount(
  productId: number,
  action: "add" | "remove",
  fallbackCount = 0
): Promise<FavoriteSyncResult> {
  const response = await fetch("/api/products/favorite-count", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ product_id: productId, action }),
  });

  let data: Record<string, unknown> = {};
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    data = {};
  }

  if (!response.ok || data.success === false) {
    const message =
      typeof data.message === "string" && data.message
        ? data.message
        : `更新商品收藏數失敗（${response.status}）`;
    throw new Error(message);
  }

  return {
    favoriteCount: resolveFavoriteCountFromResponse(data, fallbackCount),
  };
}

export async function syncLookbookFavoriteCount(
  lookbookId: number,
  action: "add" | "remove",
  fallbackCount = 0
): Promise<FavoriteSyncResult> {
  const response = await fetch("/api/lookbooks/favorite-count", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lookbook_id: lookbookId, action }),
  });

  let data: Record<string, unknown> = {};
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    data = {};
  }

  if (!response.ok || data.success === false) {
    const message =
      typeof data.message === "string" && data.message
        ? data.message
        : `更新穿搭收藏數失敗（${response.status}）`;
    throw new Error(message);
  }

  return {
    favoriteCount: resolveFavoriteCountFromResponse(data, fallbackCount),
  };
}

export function bumpProductFavoriteCount<T extends { id?: unknown; favoriteCount?: number }>(
  products: T[],
  productId: number,
  delta: number
): T[] {
  const id = Number(productId);

  return products.map((item) => (
    Number(item.id) === id
      ? {
          ...item,
          favoriteCount: Math.max(0, Number(item.favoriteCount || 0) + delta),
        }
      : item
  ));
}

export function bumpLookbookFavoriteCount<T extends { id?: unknown; favoriteCount?: number }>(
  lookbooks: T[],
  lookbookId: number,
  delta: number
): T[] {
  const id = Number(lookbookId);

  return lookbooks.map((item) => (
    Number(item.id) === id
      ? {
          ...item,
          favoriteCount: Math.max(0, Number(item.favoriteCount || 0) + delta),
        }
      : item
  ));
}

export function setProductFavoriteCount<T extends { id?: unknown; favoriteCount?: number }>(
  products: T[],
  productId: number,
  favoriteCount: number
): T[] {
  const id = Number(productId);
  const nextCount = Math.max(0, Number(favoriteCount) || 0);

  return products.map((item) => (
    Number(item.id) === id ? { ...item, favoriteCount: nextCount } : item
  ));
}

export function setLookbookFavoriteCount<T extends { id?: unknown; favoriteCount?: number }>(
  lookbooks: T[],
  lookbookId: number,
  favoriteCount: number
): T[] {
  const id = Number(lookbookId);
  const nextCount = Math.max(0, Number(favoriteCount) || 0);

  return lookbooks.map((item) => (
    Number(item.id) === id ? { ...item, favoriteCount: nextCount } : item
  ));
}

export function bumpFavoriteProductRankings(
  rankings: unknown[],
  productId: number,
  delta: number
): unknown[] {
  const id = Number(productId);

  return rankings.map((entry) => {
    if (!entry || typeof entry !== "object") {
      return entry;
    }

    const item = entry as Record<string, unknown>;
    const entryId = Number(item.id ?? item.product_id);

    if (Number(entryId) !== id) {
      return entry;
    }

    const current = Number(item.favorite_count ?? item.favoriteCount ?? 0) || 0;
    const nextCount = Math.max(0, current + delta);

    return {
      ...item,
      favorite_count: nextCount,
      favoriteCount: nextCount,
    };
  });
}

export function bumpFavoriteLookbookRankings(
  rankings: unknown[],
  lookbookId: number,
  delta: number
): unknown[] {
  const id = Number(lookbookId);

  return rankings.map((entry) => {
    if (!entry || typeof entry !== "object") {
      return entry;
    }

    const item = entry as Record<string, unknown>;
    const entryId = Number(item.id ?? item.lookbook_id);

    if (Number(entryId) !== id) {
      return entry;
    }

    const current = Number(item.favorite_count ?? item.favoriteCount ?? 0) || 0;
    const nextCount = Math.max(0, current + delta);

    return {
      ...item,
      favorite_count: nextCount,
      favoriteCount: nextCount,
    };
  });
}

export function setFavoriteProductRankingCount(
  rankings: unknown[],
  productId: number,
  favoriteCount: number
): unknown[] {
  const id = Number(productId);
  const nextCount = Math.max(0, Number(favoriteCount) || 0);

  return rankings.map((entry) => {
    if (!entry || typeof entry !== "object") {
      return entry;
    }

    const item = entry as Record<string, unknown>;
    const entryId = Number(item.id ?? item.product_id);

    if (Number(entryId) !== id) {
      return entry;
    }

    return {
      ...item,
      favorite_count: nextCount,
      favoriteCount: nextCount,
    };
  });
}

export function setFavoriteLookbookRankingCount(
  rankings: unknown[],
  lookbookId: number,
  favoriteCount: number
): unknown[] {
  const id = Number(lookbookId);
  const nextCount = Math.max(0, Number(favoriteCount) || 0);

  return rankings.map((entry) => {
    if (!entry || typeof entry !== "object") {
      return entry;
    }

    const item = entry as Record<string, unknown>;
    const entryId = Number(item.id ?? item.lookbook_id);

    if (Number(entryId) !== id) {
      return entry;
    }

    return {
      ...item,
      favorite_count: nextCount,
      favoriteCount: nextCount,
    };
  });
}
