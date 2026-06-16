export type FlatProductVariant = {
  color: string;
  size: string;
  stock_status: string;
  stock: number;
};

const RELATION_VARIANT_KEYS = [
  "_product_variants",
  "product_variants",
  "_variants",
  "variant",
] as const;

function isFlatVariantRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return record.size !== undefined || record.size_name !== undefined;
}

export function normalizeFlatVariant(
  record: Record<string, unknown>
): FlatProductVariant | null {
  const color = String(record.color ?? "").trim();
  const size = String(record.size ?? record.size_name ?? "").trim();

  if (!color || !size) {
    return null;
  }

  return {
    color,
    size,
    stock_status: String(record.stock_status ?? "unknown").trim() || "unknown",
    stock: Number(record.stock ?? 0),
  };
}

export function extractRelationVariants(
  product: Record<string, unknown>
): FlatProductVariant[] {
  for (const key of RELATION_VARIANT_KEYS) {
    const value = product[key];
    if (!Array.isArray(value) || value.length === 0 || !isFlatVariantRecord(value[0])) {
      continue;
    }

    return value
      .map((item) => normalizeFlatVariant(item as Record<string, unknown>))
      .filter((item): item is FlatProductVariant => Boolean(item));
  }

  if (Array.isArray(product.variants) && product.variants.length > 0) {
    const first = product.variants[0];
    if (isFlatVariantRecord(first)) {
      return product.variants
        .map((item) => normalizeFlatVariant(item as Record<string, unknown>))
        .filter((item): item is FlatProductVariant => Boolean(item));
    }
  }

  return [];
}

export function groupVariantsByProductId(
  variantRecords: Record<string, unknown>[]
): Map<number, FlatProductVariant[]> {
  const grouped = new Map<number, FlatProductVariant[]>();

  for (const record of variantRecords) {
    const flat = normalizeFlatVariant(record);
    const productId = Number(record.product_id ?? record.products_id ?? record.productId);

    if (!flat || !productId) {
      continue;
    }

    const existing = grouped.get(productId) || [];
    existing.push(flat);
    grouped.set(productId, existing);
  }

  return grouped;
}

export function mergeVariantsIntoProducts(
  products: Record<string, unknown>[],
  variantRecords: Record<string, unknown>[]
): Record<string, unknown>[] {
  const variantsByProductId = groupVariantsByProductId(variantRecords);

  return products.map((product) => {
    const productId = Number(product.id);
    const joinedVariants = variantsByProductId.get(productId) || [];
    const relationVariants = extractRelationVariants(product);
    const variants = joinedVariants.length > 0 ? joinedVariants : relationVariants;

    return {
      ...product,
      variants,
    };
  });
}

export function deriveVariantsListUrl(productsUrl: string): string {
  return productsUrl.replace(/\/products\/?$/, "/variants");
}
