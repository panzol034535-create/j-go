import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  requireAdminUser,
  serverErrorResponse,
  unauthorizedResponse,
} from "@/lib/auth/require-admin";

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function resolveFileExtension(file: File): string {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && ["jpg", "jpeg", "png", "webp"].includes(fromName)) {
    return fromName === "jpeg" ? "jpg" : fromName;
  }

  switch (file.type) {
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return "jpg";
  }
}

export async function POST(request: NextRequest) {
  const admin = await requireAdminUser();
  if (!admin) {
    return unauthorizedResponse();
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    return serverErrorResponse(
      "BLOB_READ_WRITE_TOKEN 未設定，請先在 Vercel Blob 建立儲存並設定環境變數"
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return badRequestResponse("請使用 multipart/form-data 上傳圖片");
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return badRequestResponse("請選擇圖片檔案");
  }

  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return badRequestResponse("僅支援 JPG、PNG、WEBP 圖片");
  }

  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
    return badRequestResponse("圖片大小必須在 10MB 以內");
  }

  try {
    const extension = resolveFileExtension(file);
    const pathname = `lookbooks/${Date.now()}-${crypto.randomUUID()}.${extension}`;

    const blob = await put(pathname, file, {
      access: "public",
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    return NextResponse.json({
      success: true,
      url: blob.url,
    });
  } catch (error) {
    console.error("UPLOAD LOOKBOOK IMAGE ERROR", error);
    return serverErrorResponse("圖片上傳失敗，請稍後再試");
  }
}
