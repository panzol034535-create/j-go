import { NextRequest } from "next/server";
import { enhanceProductWithOpenAI } from "@/lib/openai/translate-product";
import {
  badRequestResponse,
  requireAdminUser,
  serverErrorResponse,
  unauthorizedResponse,
} from "@/lib/auth/require-admin";
import { fetchZozoProduct, isZozoUrl } from "@/lib/zozo/scraper";
import { NextResponse } from "next/server";

type ImportRequestBody = {
  url?: string;
};

type XanoProductResponse = {
  id?: number;
  product_id?: number;
};

export async function POST(request: NextRequest) {
  const admin = await requireAdminUser();
  if (!admin) {
    return unauthorizedResponse();
  }

  let body: ImportRequestBody;
  try {
    body = (await request.json()) as ImportRequestBody;
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

  const importUrl = process.env.XANO_IMPORT_PRODUCT_URL;
  const variantUrl = process.env.XANO_CREATE_VARIANT_URL;

  if (!importUrl || !variantUrl) {
    return serverErrorResponse("Xano API 環境變數未設定");
  }

  try {
    const zozoData = await fetchZozoProduct(url);
    const aiData = await enhanceProductWithOpenAI(zozoData);

    const productPayload = {
      name_jp: zozoData.name_jp,
      name_zh: aiData.name_zh,
      brand: zozoData.brand,
      jpy_price: zozoData.jpy_price,
      description_jp: zozoData.description_jp,
      description_zh: aiData.description_zh,
      main_image: zozoData.main_image,
      images: zozoData.images,
      tags: aiData.tags,
      status: "draft",
    };

    const productResponse = await fetch(importUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(productPayload),
    });

    if (!productResponse.ok) {
      const errorText = await productResponse.text();
      return serverErrorResponse(`寫入 Xano 商品失敗：${errorText}`);
    }

    const productResult = (await productResponse.json()) as XanoProductResponse;
    const productId = productResult.id ?? productResult.product_id;

    if (!productId) {
      return serverErrorResponse("Xano 未回傳 product_id");
    }

    const variantPromises: Promise<Response>[] = [];
    for (const color of zozoData.colors) {
      for (const size of zozoData.sizes) {
        variantPromises.push(
          fetch(variantUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              product_id: productId,
              color,
              size,
              stock_status: "unknown",
            }),
          })
        );
      }
    }

    const variantResults = await Promise.all(variantPromises);
    const failedVariants = variantResults.filter((result) => !result.ok);

    if (failedVariants.length > 0) {
      return serverErrorResponse(
        `商品已建立，但有 ${failedVariants.length} 個 variant 建立失敗`
      );
    }

    return NextResponse.json({
      success: true,
      product: {
        id: productId,
        ...productPayload,
        colors: zozoData.colors,
        sizes: zozoData.sizes,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "匯入失敗";
    return serverErrorResponse(message);
  }
}
