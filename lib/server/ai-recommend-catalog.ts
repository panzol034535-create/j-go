import { formatLookbookList, type FormattedLookbook } from "@/lib/lookbooks/format-lookbook-list";
import { formatXanoProducts, type FormattedXanoProduct } from "@/lib/products/format-xano-product";
import { isPublishedProduct, filterPublishedProducts } from "@/lib/products/store-product-visibility";
import {
  buildAiRecommendRankingContext,
  rankLookbooksForRecommend,
  rankProductsForRecommend,
  type AiRecommendRankingContext,
} from "@/lib/server/ai-recommend-ranking";
import { fetchLookbookRecords } from "@/lib/server/home-data";
import { fetchPublishedStoreProducts } from "@/lib/server/fetch-products";

export const MAX_TEXT_CATALOG_PRODUCTS = 16;
export const MAX_TEXT_CATALOG_LOOKBOOKS = 8;
export const MAX_VISION_PRODUCTS = 6;
export const MAX_VISION_LOOKBOOKS = 3;
const MAX_RESPONSE_PRODUCTS = 4;
const MAX_RESPONSE_LOOKBOOKS = 2;

export type AiRecommendCatalogProduct = {
  id: number;
  name_zh: string;
  brand: string;
  price: number;
  image: string;
  colors: string[];
  sizes: string[];
  gender: string;
  tags: string;
  favorite_count: number;
};

export type AiRecommendCatalogLookbook = {
  id: number;
  title: string;
  image: string;
  tag: string;
  gender: string;
  product_ids: number[];
  favorite_count: number;
};

export type AiRecommendCatalogOptions = {
  message: string;
  userId?: string;
  excludeProductIds?: number[];
  excludeLookbookIds?: number[];
};

export type AiRecommendCatalog = {
  products: AiRecommendCatalogProduct[];
  lookbooks: AiRecommendCatalogLookbook[];
  productsLoadFailed: boolean;
  lookbooksLoadFailed: boolean;
  rankingContext: AiRecommendRankingContext;
};

function hasProductImage(raw: Record<string, unknown>): boolean {
  if (String(raw.image ?? "").trim()) {
    return true;
  }

  const images = raw.images;
  if (Array.isArray(images)) {
    return images.some((item) => String(item).trim());
  }

  if (typeof images === "string" && images.trim()) {
    return true;
  }

  return false;
}

export function isRecommendableRawProduct(raw: Record<string, unknown>): boolean {
  const id = Number(raw.id);
  if (!Number.isFinite(id) || id <= 0) {
    return false;
  }

  if (!isPublishedProduct(raw)) {
    return false;
  }

  const name = String(raw.name_zh ?? raw.name ?? "").trim();
  if (!name) {
    return false;
  }

  if (!hasProductImage(raw)) {
    return false;
  }

  const price = Number(raw.price);
  return Number.isFinite(price) && price > 0;
}

export function isRecommendableLookbook(lookbook: FormattedLookbook): boolean {
  const id = Number(lookbook.id);
  if (!Number.isFinite(id) || id <= 0) {
    return false;
  }

  return Boolean(String(lookbook.title ?? "").trim() && String(lookbook.image ?? "").trim());
}

function compressProduct(product: FormattedXanoProduct): AiRecommendCatalogProduct {
  return {
    id: product.id,
    name_zh: String(product.name || product.description_zh || "").trim(),
    brand: product.brand,
    price: product.price,
    image: product.image,
    colors: Array.isArray(product.colors) ? product.colors : [],
    sizes: Array.isArray(product.sizes) ? product.sizes : [],
    gender: product.gender,
    tags: product.tag,
    favorite_count: Number(product.favoriteCount) || 0,
  };
}

function compressLookbook(lookbook: FormattedLookbook): AiRecommendCatalogLookbook {
  return {
    id: lookbook.id,
    title: lookbook.title,
    image: lookbook.image,
    tag: lookbook.tag,
    gender: lookbook.gender,
    product_ids: lookbook.product_ids,
    favorite_count: Number(lookbook.favoriteCount) || 0,
  };
}

export async function loadAiRecommendCatalog(
  options: AiRecommendCatalogOptions
): Promise<AiRecommendCatalog> {
  const rankingContext = buildAiRecommendRankingContext(options);
  const [productsResult, lookbooksResult] = await Promise.allSettled([
    fetchPublishedStoreProducts(),
    fetchLookbookRecords(),
  ]);

  const productsLoadFailed = productsResult.status === "rejected";
  const lookbooksLoadFailed = lookbooksResult.status === "rejected";

  const rawProducts = productsResult.status === "fulfilled" ? productsResult.value : [];
  const rawLookbooks = lookbooksResult.status === "fulfilled" ? lookbooksResult.value : [];

  const filteredRawProducts = rawProducts.filter(isRecommendableRawProduct);
  const formattedProducts = filterPublishedProducts(
    formatXanoProducts(filteredRawProducts)
  ).map(compressProduct);
  const formattedLookbooks = formatLookbookList(rawLookbooks)
    .filter(isRecommendableLookbook)
    .map(compressLookbook);

  const rankedProducts = rankProductsForRecommend(formattedProducts, rankingContext).slice(
    0,
    MAX_TEXT_CATALOG_PRODUCTS
  );
  const rankedLookbooks = rankLookbooksForRecommend(formattedLookbooks, rankingContext).slice(
    0,
    MAX_TEXT_CATALOG_LOOKBOOKS
  );

  return {
    products: rankedProducts,
    lookbooks: rankedLookbooks,
    productsLoadFailed,
    lookbooksLoadFailed,
    rankingContext,
  };
}

export function pickVisionCandidates(
  catalog: AiRecommendCatalog,
  productIds: number[],
  lookbookIds: number[]
): {
  products: AiRecommendCatalogProduct[];
  lookbooks: AiRecommendCatalogLookbook[];
} {
  const productMap = new Map(catalog.products.map((product) => [product.id, product]));
  const lookbookMap = new Map(catalog.lookbooks.map((lookbook) => [lookbook.id, lookbook]));
  const products: AiRecommendCatalogProduct[] = [];
  const lookbooks: AiRecommendCatalogLookbook[] = [];
  const seenProductIds = new Set<number>();
  const seenLookbookIds = new Set<number>();

  for (const rawId of productIds) {
    if (products.length >= MAX_VISION_PRODUCTS) {
      break;
    }

    const id = Number(rawId);
    if (!Number.isFinite(id) || id <= 0 || seenProductIds.has(id) || !productMap.has(id)) {
      continue;
    }

    seenProductIds.add(id);
    products.push(productMap.get(id)!);
  }

  for (const product of catalog.products) {
    if (products.length >= MAX_VISION_PRODUCTS) {
      break;
    }

    if (!seenProductIds.has(product.id)) {
      seenProductIds.add(product.id);
      products.push(product);
    }
  }

  for (const rawId of lookbookIds) {
    if (lookbooks.length >= MAX_VISION_LOOKBOOKS) {
      break;
    }

    const id = Number(rawId);
    if (!Number.isFinite(id) || id <= 0 || seenLookbookIds.has(id) || !lookbookMap.has(id)) {
      continue;
    }

    seenLookbookIds.add(id);
    lookbooks.push(lookbookMap.get(id)!);
  }

  for (const lookbook of catalog.lookbooks) {
    if (lookbooks.length >= MAX_VISION_LOOKBOOKS) {
      break;
    }

    if (!seenLookbookIds.has(lookbook.id)) {
      seenLookbookIds.add(lookbook.id);
      lookbooks.push(lookbook);
    }
  }

  return { products, lookbooks };
}

export type AiRecommendResponseProduct = {
  id: number;
  name: string;
  brand: string;
  price: number;
  image: string;
};

export type AiRecommendResponseLookbook = {
  id: number;
  title: string;
  image: string;
  tag: string;
};

export function resolveRecommendResponseItems(
  catalog: AiRecommendCatalog,
  productIds: number[],
  lookbookIds: number[]
): {
  products: AiRecommendResponseProduct[];
  lookbooks: AiRecommendResponseLookbook[];
} {
  const productMap = new Map(catalog.products.map((product) => [product.id, product]));
  const lookbookMap = new Map(catalog.lookbooks.map((lookbook) => [lookbook.id, lookbook]));

  const products: AiRecommendResponseProduct[] = [];
  const lookbooks: AiRecommendResponseLookbook[] = [];
  const seenProductIds = new Set<number>();
  const seenLookbookIds = new Set<number>();

  for (const rawId of productIds) {
    if (products.length >= MAX_RESPONSE_PRODUCTS) {
      break;
    }

    const id = Number(rawId);
    if (!Number.isFinite(id) || id <= 0 || seenProductIds.has(id) || !productMap.has(id)) {
      continue;
    }

    seenProductIds.add(id);
    const product = productMap.get(id)!;
    products.push({
      id: product.id,
      name: product.name_zh,
      brand: product.brand,
      price: product.price,
      image: product.image,
    });
  }

  for (const rawId of lookbookIds) {
    if (lookbooks.length >= MAX_RESPONSE_LOOKBOOKS) {
      break;
    }

    const id = Number(rawId);
    if (!Number.isFinite(id) || id <= 0 || seenLookbookIds.has(id) || !lookbookMap.has(id)) {
      continue;
    }

    seenLookbookIds.add(id);
    const lookbook = lookbookMap.get(id)!;
    lookbooks.push({
      id: lookbook.id,
      title: lookbook.title,
      image: lookbook.image,
      tag: lookbook.tag,
    });
  }

  return { products, lookbooks };
}
