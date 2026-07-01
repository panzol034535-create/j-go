import { normalizeColor, normalizeStoredColor } from "@/lib/products/color-normalize";
import { filterZozoDisplayImageUrls } from "@/lib/products/zozo-image-url";

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
    .map((variant) => normalizeStoredColor(String(variant.color || "")))
    .filter(Boolean);

  if (fromVariants.length > 0) {
    return Array.from(new Set(fromVariants));
  }

  const fromField = parseCommaList(product.colors)
    .map((color) => normalizeStoredColor(color))
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
    return Array.from(new Set(fromField));
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
      color: normalizeStoredColor(color?.trim() || ""),
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
    const color = normalizeStoredColor(String(record.color || "").trim());
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
        color: normalizeStoredColor(String(variant.color || "").trim()),
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

  const normalizedColor = normalizeStoredColor(color);
  const variant = product.variants.find(
    (item) => normalizeStoredColor(item.color) === normalizedColor
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

function dedupeSizeOptions(sizes: ProductSizeOption[]): ProductSizeOption[] {
  const seen = new Set<string>();
  const result: ProductSizeOption[] = [];

  for (const size of sizes) {
    const key = normalizeVariantSize(String(size.name || "").trim());
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(size);
  }

  return result;
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

  const normalizedColor = normalizeStoredColor(color);
  const sizesFromVariants = (product.variants || [])
    .filter((item) => normalizeStoredColor(item.color) === normalizedColor)
    .flatMap((item) => item.sizes || []);

  if (sizesFromVariants.length > 0) {
    return dedupeSizeOptions(sizesFromVariants);
  }

  const fallbackSizes = getProductSizeNames(product).map((name) => ({
    name,
    stock: 999,
    stock_status: "unknown",
  }));

  return dedupeSizeOptions(fallbackSizes);
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

export type ProductColorImages = Record<string, string[]>;

export function parseProductColorImages(value: unknown): ProductColorImages {
  if (value === null || value === undefined) {
    return {};
  }

  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parseProductColorImages(parsed);
    } catch {
      return {};
    }
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const result: ProductColorImages = {};

  for (const [rawKey, rawUrls] of Object.entries(value as Record<string, unknown>)) {
    const colorKey = normalizeStoredColor(rawKey);
    if (!colorKey) {
      continue;
    }

    const urls = Array.isArray(rawUrls)
      ? rawUrls.map((item) => String(item).trim()).filter(Boolean)
      : typeof rawUrls === "string"
        ? [rawUrls.trim()].filter(Boolean)
        : [];

    if (urls.length > 0) {
      result[colorKey] = Array.from(new Set(urls));
    }
  }

  return result;
}

function findColorImagesKey(
  colorImages: ProductColorImages,
  selectedColor: string
): string | null {
  const trimmedSelectedColor = normalizeStoredColor(selectedColor);
  if (!trimmedSelectedColor) {
    return null;
  }

  const keys = Object.keys(colorImages);
  const normalizedSelectedColor = normalizeColor(trimmedSelectedColor);

  if (colorImages[selectedColor]?.length) {
    return selectedColor;
  }

  if (colorImages[trimmedSelectedColor]?.length) {
    return trimmedSelectedColor;
  }

  if (normalizedSelectedColor && colorImages[normalizedSelectedColor]?.length) {
    return normalizedSelectedColor;
  }

  for (const key of keys) {
    if (key === selectedColor || key === trimmedSelectedColor) {
      if (colorImages[key]?.length) {
        return key;
      }
    }

    if (normalizeColor(key) === normalizedSelectedColor && colorImages[key]?.length) {
      return key;
    }
  }

  return null;
}

function normalizeImageUrlForMatch(url: string): string {
  return url.trim().split("?")[0];
}

export function getProductImages(
  product: {
    images?: string[];
    image?: string;
  } | null | undefined
): string[] {
  if (!product) {
    return [];
  }

  if (product.images?.length) {
    return product.images;
  }

  return product.image ? [String(product.image)] : [];
}

export function getPrimaryColorImageUrl(
  product: {
    color_images?: ProductColorImages;
  } | null | undefined,
  selectedColor: string
): string | null {
  if (!product) {
    return null;
  }

  const matchedKey = findColorImagesKey(product.color_images || {}, selectedColor);
  if (!matchedKey) {
    return null;
  }

  const urls = filterZozoDisplayImageUrls(product.color_images?.[matchedKey] || []);
  return urls[0] || null;
}

export function findImageIndexForColor(
  product: {
    images?: string[];
    image?: string;
    color_images?: ProductColorImages;
  } | null | undefined,
  selectedColor: string
): number {
  const productImages = getProductImages(product);
  const colorUrl = getPrimaryColorImageUrl(product, selectedColor);

  if (!colorUrl || productImages.length === 0) {
    return -1;
  }

  const exactIndex = productImages.findIndex((entry) => entry === colorUrl);
  if (exactIndex >= 0) {
    return exactIndex;
  }

  const normalizedColorUrl = normalizeImageUrlForMatch(colorUrl);
  return productImages.findIndex(
    (entry) => normalizeImageUrlForMatch(entry) === normalizedColorUrl
  );
}

export function getProductImagesForColor(
  product: {
    images?: string[];
    image?: string;
    color_images?: ProductColorImages;
  } | null | undefined,
  color: string
): string[] {
  if (!product) {
    return [];
  }

  const colorImages = product.color_images || {};
  const fallbackImages = product.images?.length
    ? product.images
    : product.image
      ? [String(product.image)]
      : [];

  const resolveDisplay = (urls: string[] | undefined): string[] => {
    const filtered = filterZozoDisplayImageUrls(urls || []);
    return filtered.length > 0 ? filtered : fallbackImages;
  };

  const selectedColor = color;
  const normalizedSelectedColor = normalizeColor(normalizeStoredColor(selectedColor));
  const matchedKey = findColorImagesKey(colorImages, selectedColor);

  console.log("COLOR IMAGE LOOKUP", {
    selectedColor,
    normalizedSelectedColor,
    colorImageKeys: Object.keys(colorImages),
    matchedKey,
  });

  if (matchedKey && colorImages[matchedKey]?.length) {
    return resolveDisplay(colorImages[matchedKey]);
  }

  if (fallbackImages.length) {
    return fallbackImages;
  }

  return [];
}
