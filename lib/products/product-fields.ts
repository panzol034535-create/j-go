import { normalizeColor } from "@/lib/products/color-normalize";

export function parseCommaList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === "string" && value.trim()) {
    return value
      .split(/[,，]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

export function getProductDescription(
  product: {
    description?: string;
    description_zh?: string;
    description_jp?: string;
  } | null | undefined
): string {
  if (!product) {
    return "";
  }

  return (
    product.description?.trim() ||
    product.description_zh?.trim() ||
    product.description_jp?.trim() ||
    ""
  );
}

export function getProductColorOptions(
  product: {
    colors?: unknown;
    variants?: Array<{ color?: string }>;
  } | null | undefined
): string[] {
  if (!product) {
    return [];
  }

  const fromVariants = (product.variants || [])
    .map((variant) => normalizeColor(String(variant.color || "").trim()))
    .filter(Boolean);

  if (fromVariants.length > 0) {
    return Array.from(new Set(fromVariants));
  }

  const fromField = parseCommaList(product.colors)
    .map((color) => normalizeColor(color))
    .filter(Boolean);

  return Array.from(new Set(fromField));
}

export function getProductSizeNames(
  product: {
    sizes?: unknown;
    variants?: Array<{ sizes?: Array<{ name?: string }> }>;
  } | null | undefined
): string[] {
  if (!product) {
    return [];
  }

  const fromField = parseCommaList(product.sizes);
  if (fromField.length > 0) {
    return fromField;
  }

  const fromVariants = (product.variants || [])
    .flatMap((variant) =>
      (variant.sizes || [])
        .map((size) => size.name?.trim())
        .filter((name): name is string => Boolean(name))
    );

  return Array.from(new Set(fromVariants));
}

export type ProductSizeOption = {
  name: string;
  stock?: number;
  stock_status?: string;
};

export type GroupedProductVariant = {
  color: string;
  sizes: ProductSizeOption[];
};

export function normalizeVariantSize(size: string): string {
  const normalized = size.trim().toUpperCase();

  switch (normalized) {
    case "X-SMALL":
      return "XS";
    case "XS":
      return "XS";
    case "SMALL":
      return "S";
    case "S":
      return "S";
    case "MEDIUM":
      return "M";
    case "M":
      return "M";
    case "LARGE":
      return "L";
    case "L":
      return "L";
    case "X-LARGE":
    case "XLARGE":
      return "XL";
    case "XL":
      return "XL";
    default:
      return size.trim();
  }
}

function parseLegacyVariantString(raw: string): GroupedProductVariant[] {
  return raw.split(";").map((variant) => {
    const [color, ...sizeParts] = variant.split(":");
    const sizeText = sizeParts.join(":");

    return {
      color: normalizeColor(color?.trim() || ""),
      sizes: sizeText
        ? sizeText.split(",").map((sizeItem) => {
            const [sizeName, stockText] = sizeItem.split(":");
            const stock = Number(stockText ?? 999);

            return {
              name: sizeName?.trim() || "",
              stock,
              stock_status:
                Number.isNaN(stock) || stockText === undefined
                  ? "unknown"
                  : stock > 0
                    ? "in_stock"
                    : "out_of_stock",
            };
          }).filter((size) => size.name)
        : [],
    };
  }).filter((variant) => variant.color);
}

function groupFlatVariants(
  records: Array<Record<string, unknown>>
): GroupedProductVariant[] {
  const grouped = new Map<string, GroupedProductVariant>();

  for (const record of records) {
    const color = normalizeColor(String(record.color || "").trim());
    const name = String(record.size || record.size_name || "").trim();
    const stock = Number(record.stock ?? 0);
    const stock_status = String(record.stock_status || "unknown").trim() || "unknown";

    if (!color || !name) {
      continue;
    }

    if (!grouped.has(color)) {
      grouped.set(color, { color, sizes: [] });
    }

    grouped.get(color)?.sizes.push({
      name,
      stock,
      stock_status,
    });
  }

  return Array.from(grouped.values());
}

export function parseProductVariants(product: {
  variants?: unknown;
  product_variants?: unknown;
  _variants?: unknown;
  _product_variants?: unknown;
}): GroupedProductVariant[] {
  const relationKeys = [
    "_product_variants",
    "product_variants",
    "_variants",
    "variants",
  ] as const;

  for (const key of relationKeys) {
    const raw = product[key];
    if (!Array.isArray(raw) || raw.length === 0) {
      continue;
    }

    const first = raw[0] as Record<string, unknown>;

    if (first.sizes && Array.isArray(first.sizes)) {
      return (raw as GroupedProductVariant[]).map((variant) => ({
        ...variant,
        color: normalizeColor(String(variant.color || "").trim()),
        sizes: variant.sizes || [],
      }));
    }

    if (first.size !== undefined || first.size_name !== undefined) {
      return groupFlatVariants(raw as Array<Record<string, unknown>>);
    }
  }

  const legacyRaw = product.variants;
  if (typeof legacyRaw === "string" && legacyRaw.trim()) {
    return parseLegacyVariantString(legacyRaw);
  }

  return [];
}

export function getVariantForColorAndSize(
  product: {
    variants?: GroupedProductVariant[];
  } | null | undefined,
  color: string,
  size: string
): ProductSizeOption | null {
  if (!product?.variants?.length || !color || !size) {
    return null;
  }

  const normalizedColor = normalizeColor(color);
  const variant = product.variants.find(
    (item) => normalizeColor(item.color) === normalizedColor
  );
  if (!variant?.sizes?.length) {
    return null;
  }

  const normalizedTarget = normalizeVariantSize(size);

  return (
    variant.sizes.find(
      (item) => normalizeVariantSize(item.name) === normalizedTarget
    ) || null
  );
}

export function getSizeOptionsForColor(
  product: {
    variants?: GroupedProductVariant[];
    sizes?: unknown;
  } | null | undefined,
  color: string
): ProductSizeOption[] {
  if (!product) {
    return [];
  }

  const normalizedColor = normalizeColor(color);
  const variant = product.variants?.find(
    (item) => normalizeColor(item.color) === normalizedColor
  );
  if (variant?.sizes?.length) {
    return variant.sizes;
  }

  return getProductSizeNames(product).map((name) => ({
    name,
    stock: 999,
    stock_status: "unknown",
  }));
}

export function isSizeOutOfStock(sizeOption?: ProductSizeOption | null): boolean {
  return sizeOption?.stock_status === "out_of_stock";
}

export function isSizeSelectable(sizeOption?: ProductSizeOption | null): boolean {
  return sizeOption?.stock_status !== "out_of_stock";
}

export function getSizeStockQty(sizeOption?: ProductSizeOption | null): number {
  if (isSizeOutOfStock(sizeOption)) {
    return 0;
  }

  if (sizeOption?.stock_status === "in_stock") {
    const stock = Number(sizeOption.stock ?? 0);
    return stock > 0 ? stock : 999;
  }

  return 999;
}

export function findFirstSelectableSize(
  sizeOptions: ProductSizeOption[]
): ProductSizeOption | null {
  return (
    sizeOptions.find((size) => isSizeSelectable(size)) ||
    sizeOptions[0] ||
    null
  );
}
