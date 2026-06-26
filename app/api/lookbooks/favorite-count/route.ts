import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { badRequestResponse, serverErrorResponse } from "@/lib/auth/require-admin";

const DEFAULT_UPDATE_LOOKBOOK_FAVORITE_COUNT_URL =
  "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/update-lookbook-favorite-count";

function resolveUpdateLookbookFavoriteCountUrl(): string | null {
  const configured = process.env.XANO_UPDATE_LOOKBOOK_FAVORITE_COUNT_URL?.trim();
  return configured || DEFAULT_UPDATE_LOOKBOOK_FAVORITE_COUNT_URL;
}

type LookbookFavoriteCountBody = {
  lookbook_id?: number;
  action?: string;
  delta?: number;
};

export async function POST(request: NextRequest) {
  let body: LookbookFavoriteCountBody;

  try {
    body = (await request.json()) as LookbookFavoriteCountBody;
  } catch {
    return badRequestResponse("Request body 格式錯誤");
  }

  const lookbookId = Number(body.lookbook_id);
  if (!lookbookId || Number.isNaN(lookbookId)) {
    return badRequestResponse("請提供有效的 lookbook_id");
  }

  const action = String(body.action || "").trim();
  if (action !== "add" && action !== "remove") {
    return badRequestResponse('action 必須是 "add" 或 "remove"');
  }

  const updateUrl = resolveUpdateLookbookFavoriteCountUrl();
  if (!updateUrl) {
    return serverErrorResponse("XANO_UPDATE_LOOKBOOK_FAVORITE_COUNT_URL 未設定");
  }

  const xanoPayload: Record<string, unknown> = {
    lookbook_id: lookbookId,
    action,
  };

  if (action === "add" && body.delta != null) {
    xanoPayload.delta = body.delta;
  }

  // Xano update-lookbook-favorite-count: action "add" → favorite_count += input.delta;
  // J-GO 前端取消收藏不呼叫此 API；action "remove" 不應扣減 favorite_count。

  try {
    const response = await fetch(updateUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(xanoPayload),
    });

    const responseText = await response.text();

    if (response.status === 429) {
      return NextResponse.json(
        {
          success: false,
          message: "目前操作太頻繁，請稍後再試收藏。",
          status: 429,
        },
        { status: 429 }
      );
    }

    if (!response.ok) {
      if (responseText.includes("Unable to locate request")) {
        return serverErrorResponse(
          "Xano 找不到 update-lookbook-favorite-count API，請在 lookbooks 表新增 favorite_count，並建立 POST /update-lookbook-favorite-count"
        );
      }

      return NextResponse.json(
        {
          success: false,
          message: "更新穿搭收藏數失敗",
          status: response.status,
          xanoResponse: responseText,
        },
        { status: response.status >= 400 && response.status < 600 ? response.status : 500 }
      );
    }

    let xanoResult: Record<string, unknown> = {};
    if (responseText) {
      try {
        xanoResult = JSON.parse(responseText) as Record<string, unknown>;
      } catch {
        xanoResult = {};
      }
    }

    revalidatePath("/");
    revalidatePath("/api/lookbooks");
    revalidatePath("/api/rankings/lookbooks");

    return NextResponse.json({
      success: true,
      lookbook_id: lookbookId,
      action,
      ...xanoResult,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "更新失敗";
    return serverErrorResponse(message);
  }
}
