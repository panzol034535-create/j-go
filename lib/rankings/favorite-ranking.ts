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

export async function syncProductFavoriteCount(
  productId: number,
  action: "add" | "remove"
): Promise<void> {
  try {
    await fetch("/api/products/favorite-count", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: productId, action }),
    });
  } catch {
    // 本地收藏不受 API 失敗影響
  }
}

export async function syncLookbookFavoriteCount(
  lookbookId: number,
  action: "add" | "remove"
): Promise<void> {
  try {
    await fetch("/api/lookbooks/favorite-count", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lookbook_id: lookbookId, action }),
    });
  } catch {
    // 本地收藏不受 API 失敗影響
  }
}
