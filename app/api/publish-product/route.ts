import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  requireAdminUser,
  serverErrorResponse,
  unauthorizedResponse,
} from "@/lib/auth/require-admin";

type PublishRequestBody = {
  product_id?: number;
};

export async function POST(request: NextRequest) {
  const admin = await requireAdminUser();
  if (!admin) {
    return unauthorizedResponse();
  }

  let body: PublishRequestBody;
  try {
    body = (await request.json()) as PublishRequestBody;
  } catch {
    return badRequestResponse("Request body 格式錯誤");
  }

  const productId = body.product_id;
  if (!productId || typeof productId !== "number") {
    return badRequestResponse("請提供有效的 product_id");
  }

  const publishUrl = process.env.XANO_PUBLISH_PRODUCT_URL;
  if (!publishUrl) {
    return serverErrorResponse("XANO_PUBLISH_PRODUCT_URL 未設定");
  }

  try {
    const response = await fetch(publishUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: productId }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return serverErrorResponse(`上架失敗：${errorText}`);
    }

    const result = await response.json();
    return NextResponse.json({ success: true, product: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "上架失敗";
    return serverErrorResponse(message);
  }
}
