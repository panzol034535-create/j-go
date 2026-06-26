import { NextResponse } from "next/server";
import { fetchMergedProducts } from "@/lib/server/fetch-products";
import { xanoErrorResponse } from "@/lib/server/fetch-revalidated";

export const revalidate = 60;

export async function GET() {
  try {
    const mergedProducts = await fetchMergedProducts();

    return NextResponse.json({
      products: mergedProducts,
    });
  } catch (error) {
    return xanoErrorResponse(error, "讀取商品失敗");
  }
}
