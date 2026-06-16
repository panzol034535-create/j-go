import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse, serverErrorResponse } from "@/lib/auth/require-admin";

const DEFAULT_UPDATE_PRODUCT_FAVORITE_COUNT_URL =
  "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/update-product-favorite-count";

function resolveUpdateProductFavoriteCountUrl(): string | null {
  const configured = process.env.XANO_UPDATE_PRODUCT_FAVORITE_COUNT_URL?.trim();
  return configured || DEFAULT_UPDATE_PRODUCT_FAVORITE_COUNT_URL;
}

type FavoriteCountBody = {
  product_id?: number;
  action?: string;
};

export async function POST(request: NextRequest) {
  let body: FavoriteCountBody;

  try {
    body = (await request.json()) as FavoriteCountBody;
  } catch {
    return badRequestResponse("Request body 格式錯誤");
  }

  const productId = Number(body.product_id);
  if (!productId || Number.isNaN(productId)) {
    return badRequestResponse("請提供有效的 product_id");
  }

  const action = String(body.action || "").trim();
  if (action !== "add" && action !== "remove") {
    return badRequestResponse('action 必須是 "add" 或 "remove"');
  }

  console.log("PRODUCT FAVORITE COUNT BODY", body);

  const updateUrl = resolveUpdateProductFavoriteCountUrl();
  if (!updateUrl) {
    return serverErrorResponse("XANO_UPDATE_PRODUCT_FAVORITE_COUNT_URL 未設定");
  }

  console.log("XANO_UPDATE_PRODUCT_FAVORITE_COUNT_URL", updateUrl);

  const xanoPayload = {
    product_id: productId,
    action,
  };

  try {
    const response = await fetch(updateUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(xanoPayload),
    });

    const text = await response.text();

    if (!response.ok) {
      console.error("XANO PRODUCT FAVORITE ERROR", response.status, text);
      return NextResponse.json(
        {
          success: false,
          message: "更新商品收藏數失敗",
          status: response.status,
          xanoResponse: text,
        },
        { status: 500 }
      );
    }

    let xanoResult: Record<string, unknown> = {};
    if (text) {
      try {
        xanoResult = JSON.parse(text) as Record<string, unknown>;
      } catch {
        xanoResult = {};
      }
    }

    return NextResponse.json({
      success: true,
      product_id: productId,
      action,
      ...xanoResult,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "更新失敗";
    return serverErrorResponse(message);
  }
}
