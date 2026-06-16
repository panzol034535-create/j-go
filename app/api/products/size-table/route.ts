import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  requireAdminUser,
  serverErrorResponse,
  unauthorizedResponse,
} from "@/lib/auth/require-admin";
import { normalizeSizeTableRows, parseSizeTableJson } from "@/lib/products/size-table-json";

const DEFAULT_UPDATE_PRODUCT_SIZE_TABLE_URL =
  "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/update-product-size-table";

function resolveUpdateProductSizeTableUrl(): string | null {
  const configured = process.env.XANO_UPDATE_PRODUCT_SIZE_TABLE_URL?.trim();
  if (configured) {
    return configured;
  }

  return DEFAULT_UPDATE_PRODUCT_SIZE_TABLE_URL;
}

type UpdateProductSizeTableBody = {
  product_id?: number;
  id?: number;
  size_table_json?: unknown;
};

export async function PATCH(request: NextRequest) {
  const admin = await requireAdminUser();
  if (!admin) {
    return unauthorizedResponse();
  }

  let body: UpdateProductSizeTableBody;
  try {
    body = (await request.json()) as UpdateProductSizeTableBody;
  } catch {
    return badRequestResponse("Request body 格式錯誤");
  }

  const productId = Number(body.product_id ?? body.id);
  if (!productId || Number.isNaN(productId)) {
    return badRequestResponse("請提供有效的 product_id");
  }

  if (body.size_table_json === undefined) {
    return badRequestResponse("請提供 size_table_json");
  }

  const size_table_json = normalizeSizeTableRows(parseSizeTableJson(body.size_table_json));
  const updateUrl = resolveUpdateProductSizeTableUrl();

  if (!updateUrl) {
    return serverErrorResponse("XANO_UPDATE_PRODUCT_SIZE_TABLE_URL 未設定");
  }

  const xanoPayload = {
    product_id: productId,
    size_table_json,
  };

  console.log("UPDATE PRODUCT SIZE TABLE URL", updateUrl);
  console.log("UPDATE PRODUCT SIZE TABLE BODY", xanoPayload);

  try {
    const response = await fetch(updateUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(xanoPayload),
    });

    const responseText = await response.text();
    console.log("UPDATE PRODUCT SIZE TABLE RESPONSE", response.status, responseText);

    if (!response.ok) {
      if (responseText.includes("Unable to locate request")) {
        return serverErrorResponse(
          "Xano 找不到 update-product-size-table API，請在 Xano 建立 POST /update-product-size-table，並設定 XANO_UPDATE_PRODUCT_SIZE_TABLE_URL"
        );
      }

      return serverErrorResponse(`更新尺寸表失敗：${responseText}`);
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
      size_table_json,
      ...xanoResult,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "更新失敗";
    return serverErrorResponse(message);
  }
}
