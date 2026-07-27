import { NextRequest, NextResponse } from "next/server";
import { serverErrorResponse } from "@/lib/auth/require-admin";
import { filterPublishedProducts } from "@/lib/products/store-product-visibility";
import { fetchXanoSalesRankings } from "@/lib/rankings/xano-sales-rankings";
import { fetchPublishedStoreProducts } from "@/lib/server/fetch-products";

export async function GET(request: NextRequest) {
  const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit") || 10), 1), 50);
  const period = request.nextUrl.searchParams.get("period") === "all" ? "all" : "week";

  try {
    const [rankings, publishedProducts] = await Promise.all([
      fetchXanoSalesRankings({
        limit,
        period,
        revalidate: 60,
      }),
      fetchPublishedStoreProducts(),
    ]);

    const publishedProductIds = new Set(
      filterPublishedProducts(publishedProducts)
        .map((product) => Number(product.id))
        .filter((id) => Number.isFinite(id) && id > 0)
    );

    const visibleRankings = rankings.filter((entry) =>
      publishedProductIds.has(Number(entry.product_id))
    );

    return NextResponse.json({
      period,
      limit,
      rankings: visibleRankings,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "讀取銷售排行失敗";
    return serverErrorResponse(message);
  }
}
