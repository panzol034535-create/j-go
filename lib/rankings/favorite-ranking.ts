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
  ok: boolean;
  message?: string;
};

export async function syncProductFavoriteCount(
  productId: number,
  action: "add" | "remove"
): Promise<FavoriteSyncResult> {
  try {
    const response = await fetch("/api/products/favorite-count", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: productId, action }),
    });

    let data: { success?: boolean; message?: string } = {};
    try {
      data = (await response.json()) as { success?: boolean; message?: string };
    } catch {
      data = {};
    }

    if (!response.ok || data.success === false) {
      return {
        ok: false,
        message: data.message || `更新商品收藏數失敗（${response.status}）`,
      };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "更新商品收藏數失敗",
    };
  }
}

export async function syncLookbookFavoriteCount(
  lookbookId: number,
  action: "add" | "remove"
): Promise<FavoriteSyncResult> {
  try {
    const response = await fetch("/api/lookbooks/favorite-count", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lookbook_id: lookbookId, action }),
    });

    let data: { success?: boolean; message?: string } = {};
    try {
      data = (await response.json()) as { success?: boolean; message?: string };
    } catch {
      data = {};
    }

    if (!response.ok || data.success === false) {
      return {
        ok: false,
        message: data.message || `更新穿搭收藏數失敗（${response.status}）`,
      };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "更新穿搭收藏數失敗",
    };
  }
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
