import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse, serverErrorResponse } from "@/lib/auth/require-admin";
import { generateAiSupportReply } from "@/lib/openai/ai-support";

type AiSupportBody = {
  message?: string;
};

export async function POST(request: NextRequest) {
  let body: AiSupportBody;

  try {
    body = (await request.json()) as AiSupportBody;
  } catch {
    return badRequestResponse("Request body 格式錯誤");
  }

  const message = String(body.message ?? "").trim();
  if (!message) {
    return badRequestResponse("請輸入訊息");
  }

  try {
    const reply = await generateAiSupportReply(message);
    return NextResponse.json({ success: true, reply });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "AI 客服暫時無法回覆";
    return serverErrorResponse(errorMessage);
  }
}
