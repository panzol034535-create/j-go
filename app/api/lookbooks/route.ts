import { NextResponse } from "next/server";
import {
  fetchRevalidatedJson,
  xanoErrorResponse,
} from "@/lib/server/fetch-revalidated";

export const revalidate = 60;

export async function GET() {
  const url = process.env.XANO_LOOKBOOKS_URL;

  if (!url) {
    return NextResponse.json(
      { success: false, message: "Missing XANO_LOOKBOOKS_URL", error: "Missing XANO_LOOKBOOKS_URL" },
      { status: 500 }
    );
  }

  try {
    const data = await fetchRevalidatedJson(url);

    return NextResponse.json({
      success: true,
      items: data,
    });
  } catch (error) {
    return xanoErrorResponse(error, "讀取 Lookbook 失敗");
  }
}
