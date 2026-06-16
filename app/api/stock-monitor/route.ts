import { NextResponse } from "next/server";
import {
  requireAdminUser,
  serverErrorResponse,
  unauthorizedResponse,
} from "@/lib/auth/require-admin";
import { normalizeStockMonitorProducts } from "@/lib/stock-monitor/normalize-product";

export async function GET() {
  const admin = await requireAdminUser();
  if (!admin) {
    return unauthorizedResponse();
  }

  const listUrl = process.env.XANO_STOCK_MONITOR_PRODUCTS_URL;
  if (!listUrl) {
    return serverErrorResponse("XANO_STOCK_MONITOR_PRODUCTS_URL 未設定");
  }

  try {
    const response = await fetch(`${listUrl}?t=${Date.now()}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text();
      return serverErrorResponse(`讀取監控商品失敗：${errorText}`);
    }

    const data = await response.json();
    const products = normalizeStockMonitorProducts(data);

    return NextResponse.json({ products });
  } catch (error) {
    const message = error instanceof Error ? error.message : "讀取失敗";
    return serverErrorResponse(message);
  }
}
