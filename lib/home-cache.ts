export const HOME_PRODUCTS_CACHE_KEY = "jgo_home_products_cache";
export const HOME_LOOKBOOKS_CACHE_KEY = "jgo_home_lookbooks_cache";
export const HOME_RANKINGS_CACHE_KEY = "jgo_home_rankings_cache";

export type HomeRankingsCache = {
  salesRankings: unknown[];
  favoriteProductRankings: unknown[];
  favoriteLookbookRankings: unknown[];
};

function readJson<T>(key: string): T | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = localStorage.getItem(key);
    if (raw === null) {
      return null;
    }

    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem(key, JSON.stringify(value));
}

export function hasHomeProductsCache(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return localStorage.getItem(HOME_PRODUCTS_CACHE_KEY) !== null;
}

export function readHomeProductsCache<T = unknown>(): T[] | null {
  const parsed = readJson<unknown>(HOME_PRODUCTS_CACHE_KEY);
  return Array.isArray(parsed) ? (parsed as T[]) : null;
}

export function saveHomeProductsCache(products: unknown[]): void {
  writeJson(HOME_PRODUCTS_CACHE_KEY, products);
}

export function hasHomeLookbooksCache(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return localStorage.getItem(HOME_LOOKBOOKS_CACHE_KEY) !== null;
}

export function readHomeLookbooksCache<T = unknown>(): T[] | null {
  const parsed = readJson<unknown>(HOME_LOOKBOOKS_CACHE_KEY);
  return Array.isArray(parsed) ? (parsed as T[]) : null;
}

export function saveHomeLookbooksCache(lookbooks: unknown[]): void {
  writeJson(HOME_LOOKBOOKS_CACHE_KEY, lookbooks);
}

export function hasHomeRankingsCache(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return localStorage.getItem(HOME_RANKINGS_CACHE_KEY) !== null;
}

export function readHomeRankingsCache(): HomeRankingsCache | null {
  const parsed = readJson<Partial<HomeRankingsCache>>(HOME_RANKINGS_CACHE_KEY);
  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  return {
    salesRankings: Array.isArray(parsed.salesRankings) ? parsed.salesRankings : [],
    favoriteProductRankings: Array.isArray(parsed.favoriteProductRankings)
      ? parsed.favoriteProductRankings
      : [],
    favoriteLookbookRankings: Array.isArray(parsed.favoriteLookbookRankings)
      ? parsed.favoriteLookbookRankings
      : [],
  };
}

export function saveHomeRankingsCache(rankings: HomeRankingsCache): void {
  writeJson(HOME_RANKINGS_CACHE_KEY, rankings);
}
