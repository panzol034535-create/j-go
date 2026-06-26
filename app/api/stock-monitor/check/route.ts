import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  requireAdminUser,
  serverErrorResponse,
  unauthorizedResponse,
} from "@/lib/auth/require-admin";
import { runStockCheck, buildStockMonitorUpdatePayload, parseCheckPriceJpy } from "@/lib/stock-monitor/check-product";
import {
  getCheckSuccessMessage,
  normalizeStockMonitorProduct,
  normalizeStockMonitorProducts,
} from "@/lib/stock-monitor/normalize-product";

type CheckRequestBody = {
  product_id?: number;
};

export async function POST(request: NextRequest) {
  const admin = await requireAdminUser();
  if (!admin) {
    return unauthorizedResponse();
  }

  const listUrl = process.env.XANO_STOCK_MONITOR_PRODUCTS_URL;
  const updateUrl = process.env.XANO_UPDATE_PRODUCT_STOCK_URL;
  const createCheckUrl = process.env.XANO_CREATE_STOCK_CHECK_URL;

  if (!listUrl || !updateUrl || !createCheckUrl) {
    return serverErrorResponse(
      "XANO_STOCK_MONITOR_PRODUCTS_URL、XANO_UPDATE_PRODUCT_STOCK_URL 或 XANO_CREATE_STOCK_CHECK_URL 未設定"
    );
  }

  let body: CheckRequestBody;
  try {
    body = (await request.json()) as CheckRequestBody;
  } catch {
    return badRequestResponse("Request body 格式錯誤");
  }

  const productId = Number(body.product_id);
  if (!productId || Number.isNaN(productId)) {
    return badRequestResponse("請提供有效的 product_id");
  }

  try {
    const listResponse = await fetch(`${listUrl}?t=${Date.now()}`, {
      cache: "no-store",
    });

    if (!listResponse.ok) {
      const errorText = await listResponse.text();
      return serverErrorResponse(`讀取商品失敗：${errorText}`);
    }

    const listData = await listResponse.json();
    const products = normalizeStockMonitorProducts(listData);
    const product = products.find((item) => item.id === productId);

    if (!product) {
      return badRequestResponse(`找不到 product_id ${productId}`);
    }

    const checkResult = runStockCheck(product);
    const checkedAt = new Date().toISOString();

    const checkPayload = {
      product_id: productId,
      source_url: product.source_url || "",
      source_site: product.source_site || "unknown",
      checked_at: checkedAt,
      price_jpy: checkResult.price_jpy,
      stock_status: checkResult.stock_status,
      raw_result: JSON.stringify(checkResult.raw_result),
      status: checkResult.record_status,
    };

    const checkResponse = await fetch(createCheckUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(checkPayload),
    });

    if (!checkResponse.ok) {
      const errorText = await checkResponse.text();
      console.error("XANO CREATE STOCK CHECK ERROR:", errorText);
      return serverErrorResponse(`寫入檢查紀錄失敗：${errorText}`);
    }

    const checkRecord = await checkResponse.json();

    const validPriceJpy = parseCheckPriceJpy(checkResult.price_jpy);
    const updatePayload = buildStockMonitorUpdatePayload({
      productId,
      checkedAt,
      checkResult,
    });

    const updateResponse = await fetch(updateUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updatePayload),
    });

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.error("XANO UPDATE PRODUCT STOCK ERROR:", errorText);
      return serverErrorResponse(`更新商品監控狀態失敗：${errorText}`);
    }

    const updateData = await updateResponse.json();
    const updatedProduct =
      normalizeStockMonitorProduct(
        (updateData as { product?: Record<string, unknown> })?.product ??
          (updateData as Record<string, unknown>)
      ) ?? {
        ...product,
        last_checked_at: checkedAt,
        last_price_jpy: validPriceJpy ?? product.last_price_jpy,
        last_stock_status: checkResult.stock_status,
        check_status: checkResult.check_status,
      };

    return NextResponse.json({
      success: true,
      message: getCheckSuccessMessage(checkResult.check_status),
      check: checkRecord,
      product: updatedProduct,
      result: {
        check_status: checkResult.check_status,
        ...(validPriceJpy !== null ? { last_price_jpy: validPriceJpy } : {}),
        last_stock_status: checkResult.stock_status,
        last_checked_at: checkedAt,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "檢查失敗";
    return serverErrorResponse(message);
  }
}
