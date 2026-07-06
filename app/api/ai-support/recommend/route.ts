import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse, serverErrorResponse } from "@/lib/auth/require-admin";
import { generateAiRecommendation } from "@/lib/openai/ai-recommend";
import { parseAiRecommendRequestBody } from "@/lib/openai/ai-recommend-request";
import { toAiSupportErrorResponse } from "@/lib/openai/ai-support-error";

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return badRequestResponse("Request body 格式錯誤");
  }

  const parsed = parseAiRecommendRequestBody(body);
  if (!parsed.message) {
    return badRequestResponse("請輸入訊息");
  }

  if (!process.env.OPENAI_API_KEY?.trim()) {
    return serverErrorResponse("OPENAI_API_KEY 未設定");
  }

  try {
    const recommendation = await generateAiRecommendation(parsed);
    return NextResponse.json({
      success: true,
      intent: "recommend",
      ...recommendation,
    });
  } catch (error) {
    return toAiSupportErrorResponse(error);
  }
}
