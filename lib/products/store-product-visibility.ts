export const STOREFRONT_PRODUCTS_REVALIDATE_SECONDS = 60;

export function getProductPublishStatus(
  raw: Record<string, unknown> | { status?: unknown }
): string {
  return String(raw.status ?? "").trim().toLowerCase();
}

export function isPublishedProduct(
  raw: Record<string, unknown> | { status?: unknown }
): boolean {
  return getProductPublishStatus(raw) === "published";
}

export function filterPublishedProducts<
  T extends Record<string, unknown> | { status?: unknown },
>(productList: T[]): T[] {
  return productList.filter(isPublishedProduct);
}

export const isPublishedStoreProduct = isPublishedProduct;
export const isPublishedStoreFormattedProduct = isPublishedProduct;
export const filterPublishedStoreProducts = filterPublishedProducts;
export const filterPublishedStoreFormattedProducts = filterPublishedProducts;

export const STOREFRONT_CACHE_REFRESH_HINT =
  "前台快取約 60 秒後更新";
