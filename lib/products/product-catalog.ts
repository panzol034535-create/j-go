import {
  readHomeProductsCache,
  readProductsCacheV2,
} from "@/lib/home-cache";

export function readCachedProducts<T = Record<string, unknown>>(): T[] {
  if (typeof window === "undefined") {
    return [];
  }

  const fromV2 = readProductsCacheV2<T>();
  if (Array.isArray(fromV2) && fromV2.length > 0) {
    return fromV2;
  }

  const fromLegacy = readHomeProductsCache<T>();
  return Array.isArray(fromLegacy) ? fromLegacy : [];
}

export function resolveProductCatalog<T extends { id?: unknown }>(
  products: T[]
): T[] {
  if (Array.isArray(products) && products.length > 0) {
    return products;
  }

  return readCachedProducts<T>();
}

export function findProductById<T extends { id?: unknown }>(
  catalog: T[],
  productId: number
): T | undefined {
  const id = Number(productId);
  return catalog.find((item) => Number(item.id) === id);
}

export function productIdsMatch(
  left: unknown,
  right: unknown
): boolean {
  return Number(left) === Number(right);
}
