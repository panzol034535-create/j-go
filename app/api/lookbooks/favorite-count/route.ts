import { NextRequest, NextResponse } from "next/server";
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

  const xanoPayload = {
    lookbook_id: lookbookId,
    action,
  };

  try {
    const response = await fetch(updateUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(xanoPayload),
    });

    const responseText = await response.text();

    if (!response.ok) {
      if (responseText.includes("Unable to locate request")) {
        return serverErrorResponse(
          "Xano 找不到 update-lookbook-favorite-count API，請在 lookbooks 表新增 favorite_count，並建立 POST /update-lookbook-favorite-count"
        );
      }

      return serverErrorResponse(`更新穿搭收藏數失敗：${responseText}`);
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
      lookbook_id: lookbookId,
      action,
      ...xanoResult,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "更新失敗";
    return serverErrorResponse(message);
  }
}
