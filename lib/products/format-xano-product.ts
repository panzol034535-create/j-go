import {
  getProductColorOptions,
  getProductDescription,
  parseCommaList,
  parseProductColorImages,
  parseProductVariants,
} from "@/lib/products/product-fields";
import { detectSourceSite } from "@/lib/products/source-site";
import { parseSizeTableJson } from "@/lib/products/size-table-json";
import {
  filterPublishedProducts,
  getProductPublishStatus,
} from "@/lib/products/store-product-visibility";

function parseProductImages(product: Record<string, unknown>): string[] {
  const raw = product.images;

  if (Array.isArray(raw)) {
    return raw.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof raw === "string" && raw.trim()) {
    const trimmed = raw.trim();

    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (Array.isArray(parsed)) {
          return parsed.map((item) => String(item).trim()).filter(Boolean);
        }
      } catch {
        // fall through to comma-separated parsing
      }
    }

    return trimmed
      .split(/[,，]/)
      .map((url) => url.trim())
      .filter(Boolean);
  }

  if (product.image) {
    return [String(product.image).trim()].filter(Boolean);
  }

  return [];
}

export function formatXanoProducts(
  productList: Record<string, unknown>[],
  options?: { includeUnpublished?: boolean }
) {
  const visibleProducts = options?.includeUnpublished
    ? productList
    : filterPublishedProducts(productList);

  return visibleProducts.map((product) => {
    const images = parseProductImages(product);
    const color_images = parseProductColorImages(product.color_images);
    const variants = parseProductVariants(product);

    const source_url =
      product.source_url || product.sourceUrl || product.url || "";
    const source_site =
      product.source_site ||
      product.sourceSite ||
      (source_url ? detectSourceSite(String(source_url)) : "unknown");
    const source_product_id =
      product.source_product_id ||
      product.sourceProductId ||
      (String(source_url).match(/\/goods(?:-sale)?\/(\d+)/i)?.[1] || "");

    return {
      id: Number(product.id),
      name: String(product.name ?? ""),
      brand: String(product.brand ?? ""),
      price: Number(product.price) || 0,
      jpyPrice: Number(product.jpy_price) || 0,
      compareAt: Number(product.compare_at) || 0,
      image: String(images[0] || product.image || ""),
      images,
      color_images,
      colors: getProductColorOptions({ variants, colors: product.colors }),
      sizes: parseCommaList(product.sizes),
      variants,
      variantRecords: Array.isArray(product.variants) ? product.variants : [],
      tag: String(product.tag || "日本選品"),
      gender: String(product.gender || "unisex"),
      description: getProductDescription(product),
      description_zh: String(product.description_zh || ""),
      description_jp: String(product.description_jp || ""),
      material: String(product.material || ""),
      fit: String(product.fit || ""),
      modelHeight: String(product.model_height || product.model_height_cm || ""),
      modelWeight: String(product.model_weight || product.model_weight_kg || ""),
      modelSize: String(product.model_size || product.model_wear_size || ""),
      modelHeightCm: String(product.model_height_cm || product.model_height || ""),
      modelWeightKg: String(product.model_weight_kg || product.model_weight || ""),
      modelWearSize: String(product.model_wear_size || product.model_size || ""),
      recommendedHeight: String(product.recommended_height || ""),
      recommendedWeight: String(product.recommended_weight || ""),
      sizeChart: String(product.size_chart || ""),
      sizeTableJson: parseSizeTableJson(product.size_table_json),
      source_url: String(source_url),
      source_site: String(source_site),
      source_product_id: String(source_product_id),
      favoriteCount: Number(product.favorite_count) || 0,
      status: getProductPublishStatus(product),
      check_status: String(product.check_status ?? ""),
    };
  });
}

export type FormattedXanoProduct = ReturnType<typeof formatXanoProducts>[number];
