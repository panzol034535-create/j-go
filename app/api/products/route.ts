import { NextResponse } from "next/server";
import { filterPublishedProducts } from "@/lib/products/store-product-visibility";
import { fetchPublishedStoreProducts } from "@/lib/server/fetch-products";
import { xanoErrorResponse } from "@/lib/server/fetch-revalidated";

export const revalidate = 60;

export async function GET() {
  try {
    const mergedProducts = filterPublishedProducts(await fetchPublishedStoreProducts());

    return NextResponse.json({
      products: mergedProducts,
    });
  } catch (error) {
    return xanoErrorResponse(error, "讀取商品失敗");
  }
}
