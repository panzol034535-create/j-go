import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse, serverErrorResponse } from "@/lib/auth/require-admin";

const DEFAULT_VALIDATE_COUPON_URL =
  "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/validate-coupon";

function resolveValidateCouponUrl(): string {
  const configured = process.env.XANO_VALIDATE_COUPON_URL?.trim();
  return configured || DEFAULT_VALIDATE_COUPON_URL;
}

type ValidateCouponBody = {
  code?: string;
  subtotal?: number;
};

export async function POST(request: NextRequest) {
  let body: ValidateCouponBody;

  try {
    body = (await request.json()) as ValidateCouponBody;
  } catch {
    return badRequestResponse("Request body 格式錯誤");
  }

  const code = String(body.code ?? "").trim();
  if (!code) {
    return badRequestResponse("請提供折價券代碼");
  }

  const subtotal = Number(body.subtotal);
  if (!Number.isFinite(subtotal) || subtotal <= 0) {
    return badRequestResponse("subtotal 必須是大於 0 的數字");
  }

  try {
    const response = await fetch(resolveValidateCouponUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, subtotal }),
    });

    const text = await response.text();

    if (response.status === 429) {
      return NextResponse.json(
        { message: "目前請求過於頻繁，請稍候再試" },
        { status: 429 }
      );
    }

    if (!text) {
      return new NextResponse(null, { status: response.status });
    }

    try {
      const data = JSON.parse(text) as unknown;
      return NextResponse.json(data, { status: response.status });
    } catch {
      return new NextResponse(text, {
        status: response.status,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "驗證失敗";
    return serverErrorResponse(message);
  }
}
