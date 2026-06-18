import {
  getProductColorOptions,
  getProductDescription,
  parseCommaList,
  parseProductVariants,
} from "@/lib/products/product-fields";
import { detectSourceSite } from "@/lib/products/source-site";
import { parseSizeTableJson } from "@/lib/products/size-table-json";

export function formatXanoProducts(productList: Record<string, unknown>[]) {
  return productList.map((product) => {
    const images = product.images
      ? String(product.images)
          .split(",")
          .map((url) => url.trim())
          .filter(Boolean)
      : product.image
        ? [String(product.image)]
        : [];

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
      id: product.id,
      name: product.name,
      brand: product.brand,
      price: product.price,
      jpyPrice: product.jpy_price,
      compareAt: product.compare_at,
      image: images[0] || product.image,
      images,
      colors: getProductColorOptions({ variants, colors: product.colors }),
      sizes: parseCommaList(product.sizes),
      variants,
      variantRecords: Array.isArray(product.variants) ? product.variants : [],
      tag: product.tag || "日本選品",
      gender: product.gender || "unisex",
      description: getProductDescription(product),
      description_zh: product.description_zh || "",
      description_jp: product.description_jp || "",
      material: product.material || "",
      fit: product.fit || "",
      modelHeight: product.model_height || product.model_height_cm || "",
      modelWeight: product.model_weight || product.model_weight_kg || "",
      modelSize: product.model_size || product.model_wear_size || "",
      modelHeightCm: product.model_height_cm || product.model_height || "",
      modelWeightKg: product.model_weight_kg || product.model_weight || "",
      modelWearSize: product.model_wear_size || product.model_size || "",
      recommendedHeight: product.recommended_height || "",
      recommendedWeight: product.recommended_weight || "",
      sizeChart: product.size_chart || "",
      sizeTableJson: parseSizeTableJson(product.size_table_json),
      source_url,
      source_site,
      source_product_id,
      favoriteCount: Number(product.favorite_count) || 0,
    };
  });
}
