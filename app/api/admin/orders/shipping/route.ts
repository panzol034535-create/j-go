import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  requireAdminUser,
  serverErrorResponse,
  unauthorizedResponse,
} from "@/lib/auth/require-admin";

const DEFAULT_UPDATE_ORDER_SHIPPING_URL =
  "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/update-order-shipping";

function resolveUpdateOrderShippingUrl(): string | null {
  const configured = process.env.XANO_UPDATE_ORDER_SHIPPING_URL?.trim();
  if (configured) {
    return configured;
  }

  return DEFAULT_UPDATE_ORDER_SHIPPING_URL;
}

type UpdateOrderShippingBody = {
  order_id?: number;
  id?: number;
  shipping_company?: string;
  tracking_no?: string;
  shipped_at?: string;
};

function parseShippedAt(value: string | undefined): string | null {
  if (!value?.trim()) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

export async function PATCH(request: NextRequest) {
  const admin = await requireAdminUser();
  if (!admin) {
    return unauthorizedResponse();
  }

  let body: UpdateOrderShippingBody;
  try {
    body = (await request.json()) as UpdateOrderShippingBody;
  } catch {
    return badRequestResponse("Request body 格式錯誤");
  }

  const orderId = Number(body.order_id ?? body.id);
  if (!orderId || Number.isNaN(orderId)) {
    return badRequestResponse("請提供有效的 order_id");
  }

  const shipping_company = body.shipping_company?.trim() || "";
  const tracking_no = body.tracking_no?.trim() || "";

  if (!shipping_company) {
    return badRequestResponse("請提供 shipping_company");
  }

  if (!tracking_no) {
    return badRequestResponse("請提供 tracking_no");
  }

  const shipped_at = parseShippedAt(body.shipped_at) || new Date().toISOString();
  const updateUrl = resolveUpdateOrderShippingUrl();

  if (!updateUrl) {
    return serverErrorResponse("XANO_UPDATE_ORDER_SHIPPING_URL 未設定");
  }

  const xanoPayload = {
    order_id: orderId,
    shipping_company,
    tracking_no,
    shipped_at,
  };

  console.log("UPDATE ORDER SHIPPING URL", updateUrl);
  console.log("UPDATE ORDER SHIPPING BODY", xanoPayload);

  try {
    const response = await fetch(updateUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(xanoPayload),
    });

    const responseText = await response.text();
    console.log("UPDATE ORDER SHIPPING RESPONSE", response.status, responseText);

    if (!response.ok) {
      if (responseText.includes("Unable to locate request")) {
        return serverErrorResponse(
          "Xano 找不到 update-order-shipping API，請在 Xano 建立 POST /update-order-shipping，並設定 XANO_UPDATE_ORDER_SHIPPING_URL"
        );
      }

      return serverErrorResponse(`更新訂單物流失敗：${responseText}`);
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
      order_id: orderId,
      shipping_company,
      tracking_no,
      shipped_at,
      shippingStatus: "已出貨",
      ...xanoResult,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "更新失敗";
    return serverErrorResponse(message);
  }
}
