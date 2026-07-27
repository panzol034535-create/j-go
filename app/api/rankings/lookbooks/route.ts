import { NextRequest, NextResponse } from "next/server";
import { resolveLookbookId } from "@/lib/lookbook-favorites";
import {
  sortRecordsByFavoriteCount,
  toRecordArray,
} from "@/lib/rankings/ranking-response";
import { fetchRevalidatedJson } from "@/lib/server/fetch-revalidated";

const DEFAULT_LOOKBOOKS_URL =
  "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/lookbooks";

function normalizeLookbookRankingItem(lookbook: Record<string, unknown>, index: number) {
  const id = resolveLookbookId(lookbook, index);

  return {
    id,
    lookbook_id: lookbook.lookbook_id || lookbook.id || id,
    title: lookbook.title || "LookPick Lookbook",
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

export async function GET(request: NextRequest) {
  const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit") || 10), 1), 50);
  const lookbooksUrl = process.env.XANO_LOOKBOOKS_URL || DEFAULT_LOOKBOOKS_URL;

  try {
    const data = await fetchRevalidatedJson(lookbooksUrl);
    const lookbooks = toRecordArray(data);
    const items = sortRecordsByFavoriteCount(lookbooks, limit).map(normalizeLookbookRankingItem);

    return NextResponse.json({
      success: true,
      items,
    });
  } catch (error) {
    console.error("RANKINGS LOOKBOOKS ERROR", error);
    const message = error instanceof Error ? error.message : "讀取穿搭收藏排行失敗";

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
