import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  requireAdminUser,
  serverErrorResponse,
  unauthorizedResponse,
} from "@/lib/auth/require-admin";
import { fetchZozoProduct, isZozoUrl } from "@/lib/zozo/scraper";

type FetchRequestBody = {
  url?: string;
};

export async function POST(request: NextRequest) {
  const admin = await requireAdminUser();
  if (!admin) {
    return unauthorizedResponse();
  }

  let body: FetchRequestBody;
  try {
    body = (await request.json()) as FetchRequestBody;
  } catch {
    return badRequestResponse("Request body 格式錯誤");
  }

  const url = body.url?.trim();
  if (!url) {
    return badRequestResponse("請提供商品網址");
  }

  if (!isZozoUrl(url)) {
    return badRequestResponse("網址必須為 zozo.jp 商品頁");
  }

  try {
    const product = await fetchZozoProduct(url);
    return NextResponse.json({ success: true, product });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ZOZO 抓取失敗";
    return serverErrorResponse(message);
  }
}
