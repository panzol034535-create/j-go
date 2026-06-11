import { NextResponse } from "next/server";
import {
  requireAdminUser,
  serverErrorResponse,
  unauthorizedResponse,
} from "@/lib/auth/require-admin";

export async function GET() {
  const admin = await requireAdminUser();
  if (!admin) {
    return unauthorizedResponse();
  }

  const draftUrl = process.env.XANO_DRAFT_PRODUCTS_URL;
  if (!draftUrl) {
    return serverErrorResponse("XANO_DRAFT_PRODUCTS_URL 未設定");
  }

  try {
    const response = await fetch(`${draftUrl}?t=${Date.now()}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text();
      return serverErrorResponse(`讀取 Draft 商品失敗：${errorText}`);
    }

    const products = await response.json();
    return NextResponse.json({ products });
  } catch (error) {
    const message = error instanceof Error ? error.message : "讀取失敗";
    return serverErrorResponse(message);
  }
}
