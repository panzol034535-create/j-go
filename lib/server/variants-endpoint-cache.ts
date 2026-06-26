import { REVALIDATE_SECONDS } from "@/lib/server/fetch-revalidated";

type VariantsEndpointCacheEntry = {
  url: string;
  expiresAt: number;
};

const variantsEndpointCache = new Map<string, VariantsEndpointCacheEntry>();

function normalizeCacheKey(variantsUrl: string): string {
  return variantsUrl.replace(/\/$/, "");
}

export function getCachedVariantsEndpoint(variantsUrl: string): string | null {
  const entry = variantsEndpointCache.get(normalizeCacheKey(variantsUrl));
  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    variantsEndpointCache.delete(normalizeCacheKey(variantsUrl));
    return null;
  }

  return entry.url;
}

export function rememberVariantsEndpoint(variantsUrl: string, successfulUrl: string): void {
  variantsEndpointCache.set(normalizeCacheKey(variantsUrl), {
    url: successfulUrl,
    expiresAt: Date.now() + REVALIDATE_SECONDS * 1000,
  });
}

export function getVariantCandidateUrls(variantsUrl: string): string[] {
  return Array.from(
    new Set([
      variantsUrl,
      variantsUrl.replace(/\/variants\/?$/, "/product_variants"),
      variantsUrl.replace(/\/variants\/?$/, "/product-variant"),
    ])
  );
}
