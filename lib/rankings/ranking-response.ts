export function toRecordArray(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) {
    return data.filter((item) => item && typeof item === "object") as Record<string, unknown>[];
  }

  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    const candidates = [
      record.items,
      record.rankings,
      record.products,
      record.lookbooks,
      record.data,
      record.result,
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate.filter((item) => item && typeof item === "object") as Record<
          string,
          unknown
        >[];
      }
    }
  }

  return [];
}

export function parseRankingItems(data: unknown): unknown[] {
  if (Array.isArray(data)) {
    return data;
  }

  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;

    if (Array.isArray(record.items)) {
      return record.items;
    }

    if (Array.isArray(record.rankings)) {
      return record.rankings;
    }

    if (Array.isArray(record.products)) {
      return record.products;
    }

    if (Array.isArray(record.lookbooks)) {
      return record.lookbooks;
    }
  }

  return [];
}

export function getFavoriteCountFromRecord(record: Record<string, unknown>): number {
  const count = Number(record.favorite_count ?? record.favoriteCount ?? 0);
  return !Number.isNaN(count) && count > 0 ? count : 0;
}

export function sortRecordsByFavoriteCount(
  records: Record<string, unknown>[],
  limit: number
): Record<string, unknown>[] {
  return [...records]
    .sort((a, b) => getFavoriteCountFromRecord(b) - getFavoriteCountFromRecord(a))
    .slice(0, limit);
}
