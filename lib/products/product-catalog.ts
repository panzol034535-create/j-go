import {
  readHomeProductsCache,
  readProductsCacheV2,
} from "@/lib/home-cache";
import { filterPublishedProducts } from "@/lib/products/store-product-visibility";

export function readCachedProducts<T extends { status?: unknown } = Record<string, unknown>>(): T[] {
  if (typeof window === "undefined") {
    return [];
  }

  const fromV2 = readProductsCacheV2<T>();
  if (Array.isArray(fromV2) && fromV2.length > 0) {
    return filterPublishedProducts(fromV2);
  }

  const fromLegacy = readHomeProductsCache<T>();
  return Array.isArray(fromLegacy) ? filterPublishedProducts(fromLegacy) : [];
}

export function resolveProductCatalog<T extends { id?: unknown; status?: unknown }>(
  products: T[]
): T[] {
  if (Array.isArray(products) && products.length > 0) {
    return filterPublishedProducts(products);
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
