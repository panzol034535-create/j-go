type SearchableProduct = {
  id?: number | string | null;
  name?: string | null;
  name_zh?: string | null;
  name_jp?: string | null;
  brand?: string | null;
  source_product_id?: string | null;
};

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeSearchQuery(query: string): string {
  return collapseWhitespace(query).toLowerCase();
}

export function parseJgoProductIdFromQuery(query: string): number | null {
  const normalized = normalizeSearchQuery(query);
  if (!normalized) {
    return null;
  }

  const prefixedMatch = normalized.match(/(?:^|\b)jgo[-\s#]?(\d+)(?:\b|$)/i);
  if (prefixedMatch?.[1]) {
    const parsed = Number(prefixedMatch[1]);
    return Number.isNaN(parsed) ? null : parsed;
  }

  if (/^\d+$/.test(normalized)) {
    const parsed = Number(normalized);
    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
}

function getProductNames(product: SearchableProduct): string[] {
  return [product.name, product.name_zh, product.name_jp]
    .map((value) => collapseWhitespace(String(value || "")))
    .filter(Boolean);
}

export function matchesProductSearch(product: SearchableProduct, query: string): boolean {
  const normalizedQuery = normalizeSearchQuery(query);
  if (!normalizedQuery) {
    return true;
  }

  const jgoId = parseJgoProductIdFromQuery(normalizedQuery);
  if (jgoId !== null && Number(product.id) === jgoId) {
    return true;
  }

  const sourceProductId = collapseWhitespace(String(product.source_product_id || "")).toLowerCase();
  if (sourceProductId && (sourceProductId === normalizedQuery || sourceProductId.includes(normalizedQuery))) {
    return true;
  }

  const brand = collapseWhitespace(String(product.brand || "")).toLowerCase();
  if (brand && brand.includes(normalizedQuery)) {
    return true;
  }

  return getProductNames(product).some((name) => name.toLowerCase().includes(normalizedQuery));
}

export function filterProductsBySearch<T extends SearchableProduct>(products: T[], query: string): T[] {
  const normalizedQuery = normalizeSearchQuery(query);
  if (!normalizedQuery) {
    return products;
  }

  return products.filter((product) => matchesProductSearch(product, normalizedQuery));
}
