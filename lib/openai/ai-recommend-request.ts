export function parseRecommendExcludeIds(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) => Number(item))
        .filter((item) => Number.isFinite(item) && item > 0)
    )
  );
}

export type AiRecommendRequestBody = {
  message?: string;
  user_id?: string;
  exclude_product_ids?: unknown;
  exclude_lookbook_ids?: unknown;
};

export function parseAiRecommendRequestBody(body: AiRecommendRequestBody) {
  return {
    message: String(body.message ?? "").trim(),
    userId: String(body.user_id ?? "").trim() || undefined,
    excludeProductIds: parseRecommendExcludeIds(body.exclude_product_ids),
    excludeLookbookIds: parseRecommendExcludeIds(body.exclude_lookbook_ids),
  };
}
