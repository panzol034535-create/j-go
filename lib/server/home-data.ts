import { formatLookbookList } from "@/lib/lookbooks/format-lookbook-list";
import { formatXanoProducts } from "@/lib/products/format-xano-product";
import { resolveLookbookId } from "@/lib/lookbook-favorites";
import type { InitialRankings } from "@/lib/home-initial-data";
import {
  aggregateSalesByProductId,
  buildProductNameIndex,
  isOrderWithinPeriod,
  isPaidOrder,
  resolveOrderItemProductIdWithFallback,
  resolveOrderItemProductName,
  resolveOrderItemQty,
} from "@/lib/rankings/sales-ranking";
import {
  sortRecordsByFavoriteCount,
  toRecordArray,
} from "@/lib/rankings/ranking-response";
import { fetchMergedProducts } from "@/lib/server/fetch-products";
import { fetchRevalidatedJson } from "@/lib/server/fetch-revalidated";

const DEFAULT_ADMIN_ORDERS_URL =
  "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/admin-orders";
const DEFAULT_ORDER_ITEMS_URL =
  "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/order-items";
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

async function fetchSalesRankings(limit = 10): Promise<unknown[]> {
  const ordersUrl = process.env.XANO_ADMIN_ORDERS_URL || DEFAULT_ADMIN_ORDERS_URL;
  const orderItemsUrl = process.env.XANO_GET_ORDER_ITEMS_URL || DEFAULT_ORDER_ITEMS_URL;

  const [ordersData, products] = await Promise.all([
    fetchRevalidatedJson(ordersUrl),
    fetchMergedProducts(),
  ]);

  const allOrders = toRecordArray(ordersData);
  const nameIndex = buildProductNameIndex(products);

  const eligibleOrders = allOrders.filter((order) => {
    if (!isPaidOrder(order.payment_status)) {
      return false;
    }

    return isOrderWithinPeriod(order.created_at, "week");
  });

  const itemGroups = await Promise.all(
    eligibleOrders.map(async (order) => {
      const orderId = Number(order.id);
      if (!orderId) {
        return [];
      }

      try {
        const itemsData = await fetchRevalidatedJson(`${orderItemsUrl}?order_id=${orderId}`);
        return toRecordArray(itemsData);
      } catch {
        return [];
      }
    })
  );

  const normalizedItems = itemGroups.flat().map((item) => {
    const product_id = resolveOrderItemProductIdWithFallback(item, nameIndex);
    return {
      product_id,
      qty: resolveOrderItemQty(item),
      product_name: resolveOrderItemProductName(item),
    };
  });

  return aggregateSalesByProductId(normalizedItems).slice(0, limit);
}

async function fetchFavoriteProductRankings(limit = 10): Promise<unknown[]> {
  const products = await fetchMergedProducts();
  return sortRecordsByFavoriteCount(products, limit).map(normalizeProductRankingItem);
}

async function fetchFavoriteLookbookRankings(limit = 10): Promise<unknown[]> {
  const lookbooksUrl = process.env.XANO_LOOKBOOKS_URL || DEFAULT_LOOKBOOKS_URL;
  const data = await fetchRevalidatedJson(lookbooksUrl);
  const lookbooks = toRecordArray(data);
  return sortRecordsByFavoriteCount(lookbooks, limit).map(normalizeLookbookRankingItem);
}

async function fetchLookbooks(): Promise<ReturnType<typeof formatLookbookList>> {
  const lookbooksUrl = process.env.XANO_LOOKBOOKS_URL || DEFAULT_LOOKBOOKS_URL;
  const data = await fetchRevalidatedJson(lookbooksUrl);
  const rawList = toRecordArray(data);
  return formatLookbookList(rawList);
}

export async function getHomePageData(): Promise<HomePageData> {
  const emptyRankings: InitialRankings = {
    salesRankings: [],
    favoriteProductRankings: [],
    favoriteLookbookRankings: [],
  };

  const [productsResult, lookbooksResult, rankingsResult] = await Promise.allSettled([
    fetchMergedProducts(),
    fetchLookbooks(),
    Promise.allSettled([
      fetchSalesRankings(10),
      fetchFavoriteProductRankings(10),
      fetchFavoriteLookbookRankings(10),
    ]),
  ]);

  const initialProducts =
    productsResult.status === "fulfilled"
      ? formatXanoProducts(productsResult.value)
      : [];

  const initialLookbooks =
    lookbooksResult.status === "fulfilled" ? lookbooksResult.value : [];

  const initialRankings: InitialRankings = { ...emptyRankings };

  if (rankingsResult.status === "fulfilled") {
    const [salesResult, favoriteProductsResult, favoriteLookbooksResult] = rankingsResult.value;

    if (salesResult.status === "fulfilled") {
      initialRankings.salesRankings = salesResult.value;
    }

    if (favoriteProductsResult.status === "fulfilled") {
      initialRankings.favoriteProductRankings = favoriteProductsResult.value;
    }

    if (favoriteLookbooksResult.status === "fulfilled") {
      initialRankings.favoriteLookbookRankings = favoriteLookbooksResult.value;
    }
  }

  return {
    initialProducts,
    initialLookbooks,
    initialRankings,
  };
}
