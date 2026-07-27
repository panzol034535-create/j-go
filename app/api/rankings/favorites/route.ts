import { NextRequest, NextResponse } from "next/server";
import {
  sortRecordsByFavoriteCount,
  toRecordArray,
} from "@/lib/rankings/ranking-response";
import { filterPublishedProducts } from "@/lib/products/store-product-visibility";
import { fetchRevalidatedJson } from "@/lib/server/fetch-revalidated";

const DEFAULT_PRODUCTS_URL =
  "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/products";

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

export async function GET(request: NextRequest) {
  const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit") || 10), 1), 50);
  const productsUrl = process.env.XANO_PRODUCTS_URL || DEFAULT_PRODUCTS_URL;

  try {
    const data = await fetchRevalidatedJson(productsUrl);
    const products = filterPublishedProducts(toRecordArray(data));
    const items = sortRecordsByFavoriteCount(products, limit).map(normalizeProductRankingItem);

    return NextResponse.json({
      success: true,
      items,
    });
  } catch (error) {
    console.error("RANKINGS FAVORITES ERROR", error);
    const message = error instanceof Error ? error.message : "讀取商品收藏排行失敗";

    return NextResponse.json(
      {
        success: false,
        items: [],
        message,
      },
      { status: 200 }
    );
  }
}
