import { formatLookbookList } from "@/lib/lookbooks/format-lookbook-list";
import { resolveLookbookId } from "@/lib/lookbook-favorites";
import { formatXanoProducts } from "@/lib/products/format-xano-product";
import type { InitialRankings } from "@/lib/home-initial-data";
import {
  sortRecordsByFavoriteCount,
  toRecordArray,
} from "@/lib/rankings/ranking-response";
import { fetchXanoSalesRankings } from "@/lib/rankings/xano-sales-rankings";
import { fetchMergedProducts } from "@/lib/server/fetch-products";
import { fetchRevalidatedJson } from "@/lib/server/fetch-revalidated";

const DEFAULT_LOOKBOOKS_URL =
  "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/lookbooks";

export type HomePageData = {
  initialProducts: ReturnType<typeof formatXanoProducts>;
  initialLookbooks: ReturnType<typeof formatLookbookList>;
  initialRankings: InitialRankings;
};

export type { InitialRankings };

function normalizeProductRankingItem(product: Record<string, unknown>) {
  const images = product.images
    ? String(product.images)
        .split(",")
        .map((url) => url.trim())
        .filter(Boolean)
    : product.image
      ? [String(product.image)]
      : [];

  return {
    id: product.id,
    product_id: product.id,
    name: product.name || "",
    brand: product.brand || "",
    price: product.price || 0,
    image: images[0] || product.image || "",
    tag: product.tag || "日本選品",
    favorite_count: Number(product.favorite_count ?? product.favoriteCount ?? 0) || 0,
  };
}

function normalizeLookbookRankingItem(lookbook: Record<string, unknown>, index: number) {
  const id = resolveLookbookId(lookbook, index);

  return {
    id,
    lookbook_id: lookbook.lookbook_id || lookbook.id || id,
    title: lookbook.title || "J-GO Lookbook",
    image: lookbook.image || "",
    tag: lookbook.tag || lookbook.style_tag || "AI LOOKBOOK",
    gender: lookbook.gender || "unisex",
    product_ids: String(lookbook.product_ids || "")
      .split(",")
      .map((value) => Number(value.trim()))
      .filter(Boolean),
    favorite_count: Number(lookbook.favorite_count ?? lookbook.favoriteCount ?? 0) || 0,
  };
}

async function fetchLookbookRecords(): Promise<Record<string, unknown>[]> {
  const lookbooksUrl = process.env.XANO_LOOKBOOKS_URL || DEFAULT_LOOKBOOKS_URL;
  const data = await fetchRevalidatedJson(lookbooksUrl);
  return toRecordArray(data);
}

export async function getHomePageData(): Promise<HomePageData> {
  const emptyRankings: InitialRankings = {
    salesRankings: [],
    favoriteProductRankings: [],
    favoriteLookbookRankings: [],
  };

  const [productsResult, lookbooksResult, salesResult] = await Promise.allSettled([
    fetchMergedProducts(),
    fetchLookbookRecords(),
    fetchXanoSalesRankings({ limit: 10, period: "week", revalidate: 60 }),
  ]);

  const rawProducts =
    productsResult.status === "fulfilled" ? productsResult.value : [];
  const rawLookbooks =
    lookbooksResult.status === "fulfilled" ? lookbooksResult.value : [];

  const initialProducts = rawProducts.length > 0 ? formatXanoProducts(rawProducts) : [];
  const initialLookbooks = rawLookbooks.length > 0 ? formatLookbookList(rawLookbooks) : [];

  const initialRankings: InitialRankings = {
    salesRankings: salesResult.status === "fulfilled" ? salesResult.value : [],
    favoriteProductRankings: sortRecordsByFavoriteCount(rawProducts, 10).map(normalizeProductRankingItem),
    favoriteLookbookRankings: sortRecordsByFavoriteCount(rawLookbooks, 10).map(normalizeLookbookRankingItem),
  };

  if (
    initialRankings.salesRankings.length === 0 &&
    initialRankings.favoriteProductRankings.length === 0 &&
    initialRankings.favoriteLookbookRankings.length === 0
  ) {
    return {
      initialProducts,
      initialLookbooks,
      initialRankings: emptyRankings,
    };
  }

  return {
    initialProducts,
    initialLookbooks,
    initialRankings,
  };
}
