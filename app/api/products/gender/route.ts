import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  requireAdminUser,
  serverErrorResponse,
  unauthorizedResponse,
} from "@/lib/auth/require-admin";
import { normalizeProductGender } from "@/lib/products/product-gender";

const DEFAULT_UPDATE_PRODUCT_GENDER_URL =
  "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/update-product-gender";

function resolveUpdateProductGenderUrl(): string | null {
  const configured = process.env.XANO_UPDATE_PRODUCT_GENDER_URL?.trim();
  if (configured) {
    return configured;
  }

  return DEFAULT_UPDATE_PRODUCT_GENDER_URL;
}

type UpdateProductGenderBody = {
  product_id?: number;
  id?: number;
  gender?: string;
};

export async function PATCH(request: NextRequest) {
  const admin = await requireAdminUser();
  if (!admin) {
    return unauthorizedResponse();
  }

  let body: UpdateProductGenderBody;
  try {
    body = (await request.json()) as UpdateProductGenderBody;
  } catch {
    return badRequestResponse("Request body 格式錯誤");
  }

  const productId = Number(body.product_id ?? body.id);
  if (!productId || Number.isNaN(productId)) {
    return badRequestResponse("請提供有效的 product_id");
  }

  const gender = normalizeProductGender(body.gender);
  const updateUrl = resolveUpdateProductGenderUrl();

  if (!updateUrl) {
    return serverErrorResponse("XANO_UPDATE_PRODUCT_GENDER_URL 未設定");
  }

  const xanoPayload = {
    product_id: productId,
    gender,
  };

  console.log("UPDATE PRODUCT GENDER URL", updateUrl);
  console.log("UPDATE PRODUCT GENDER BODY", xanoPayload);

  try {
    const response = await fetch(updateUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(xanoPayload),
    });

    const responseText = await response.text();
    console.log("UPDATE PRODUCT GENDER RESPONSE", response.status, responseText);

    if (!response.ok) {
      if (responseText.includes("Unable to locate request")) {
        return serverErrorResponse(
          "Xano 找不到 update-product-gender API，請在 Xano 建立 POST /update-product-gender，並設定 XANO_UPDATE_PRODUCT_GENDER_URL"
        );
      }

      return serverErrorResponse(`更新商品性別失敗：${responseText}`);
    }

    let xanoResult: Record<string, unknown> = {};
    if (responseText) {
      try {
        xanoResult = JSON.parse(responseText) as Record<string, unknown>;
      } catch {
        xanoResult = {};
      }
    }

    return NextResponse.json({
      success: true,
      product_id: productId,
      gender,
      ...xanoResult,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "更新失敗";
    return serverErrorResponse(message);
  }
}
