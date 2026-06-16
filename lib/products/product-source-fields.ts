import { detectSourceSite, isSourceSite, type SourceSite } from "@/lib/products/source-site";
import { parseSourceProductIdFromUrl } from "@/lib/products/parse-source-product-id";

function toStringValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function getNestedProduct(raw: Record<string, unknown>): Record<string, unknown> | null {
  const nested = raw.product ?? raw.products ?? raw._product;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return nested as Record<string, unknown>;
  }

  return null;
}

export function resolveProductSourceUrl(raw: Record<string, unknown>): string {
  const nestedProduct = getNestedProduct(raw);

  const candidates = [
    raw.source_url,
    raw.sourceUrl,
    raw.url,
    raw.product_url,
    raw.productUrl,
    nestedProduct?.source_url,
    nestedProduct?.sourceUrl,
    nestedProduct?.url,
  ];

  for (const candidate of candidates) {
    const value = toStringValue(candidate);
    if (value) {
      return value;
    }
  }

  return "";
}

export function resolveProductSourceSite(
  raw: Record<string, unknown>,
  sourceUrl = resolveProductSourceUrl(raw)
): SourceSite {
  const nestedProduct = getNestedProduct(raw);
  const siteRaw = toStringValue(
    raw.source_site ?? raw.sourceSite ?? nestedProduct?.source_site ?? nestedProduct?.sourceSite
  );

  if (siteRaw && isSourceSite(siteRaw)) {
    return siteRaw;
  }

  if (sourceUrl) {
    return detectSourceSite(sourceUrl);
  }

  return "unknown";
}

export function resolveProductSourceProductId(
  raw: Record<string, unknown>,
  sourceUrl = resolveProductSourceUrl(raw)
): string {
  const nestedProduct = getNestedProduct(raw);

  const candidates = [
    raw.source_product_id,
    raw.sourceProductId,
    nestedProduct?.source_product_id,
    nestedProduct?.sourceProductId,
  ];

  for (const candidate of candidates) {
    const value = toStringValue(candidate);
    if (value) {
      return value;
    }
  }

  return parseSourceProductIdFromUrl(sourceUrl);
}

export function withProductSourceFields<T extends Record<string, unknown>>(product: T): T & {
  source_url: string;
  source_site: SourceSite;
  source_product_id: string;
} {
  const source_url = resolveProductSourceUrl(product);
  const source_site = resolveProductSourceSite(product, source_url);
  const source_product_id = resolveProductSourceProductId(product, source_url);

  return {
    ...product,
    source_url,
    source_site,
    source_product_id,
  };
}
