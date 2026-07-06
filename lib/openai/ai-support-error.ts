import { NextResponse } from "next/server";

export const AI_SUPPORT_RATE_LIMIT_MESSAGE =
  "AI 客服目前詢問量較高，請稍候 1 分鐘再試，或改由人工客服協助。";

export const AI_SUPPORT_GENERIC_ERROR_MESSAGE = "AI 客服暫時無法回覆，請稍後再試";

export class AiSupportServiceError extends Error {
  readonly status: number;
  readonly logMessage: string;

  constructor(
    clientMessage: string,
    options?: {
      status?: number;
      logMessage?: string;
    }
  ) {
    super(clientMessage);
    this.name = "AiSupportServiceError";
    this.status = options?.status ?? 500;
    this.logMessage = options?.logMessage ?? clientMessage;
  }
}

export function isOpenAiRateLimitError(httpStatus: number, errorText: string): boolean {
  if (httpStatus === 429) {
    return true;
  }

  const haystack = errorText.toLowerCase();
  return (
    haystack.includes("rate_limit_exceeded") ||
    haystack.includes("tokens per min") ||
    haystack.includes("rate limit")
  );
}

export function throwOpenAiRequestError(
  httpStatus: number,
  errorText: string,
  context: string
): never {
  const logMessage = `[${context}] OpenAI API error (${httpStatus}): ${errorText}`;
  console.error(logMessage);

  if (isOpenAiRateLimitError(httpStatus, errorText)) {
    throw new AiSupportServiceError(AI_SUPPORT_RATE_LIMIT_MESSAGE, {
      status: 429,
      logMessage,
    });
  }

  throw new AiSupportServiceError(AI_SUPPORT_GENERIC_ERROR_MESSAGE, {
    status: 500,
    logMessage,
  });
}

export function sanitizeAiSupportClientError(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) {
    return AI_SUPPORT_GENERIC_ERROR_MESSAGE;
  }

  if (trimmed === AI_SUPPORT_RATE_LIMIT_MESSAGE || trimmed === AI_SUPPORT_GENERIC_ERROR_MESSAGE) {
    return trimmed;
  }

  if (trimmed === "OPENAI_API_KEY 未設定") {
    return trimmed;
  }

  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith("openai api 錯誤") ||
    lower.includes("rate_limit_exceeded") ||
    lower.includes("tokens per min") ||
    lower.includes("rate limit")
  ) {
    return isOpenAiRateLimitError(429, trimmed)
      ? AI_SUPPORT_RATE_LIMIT_MESSAGE
      : AI_SUPPORT_GENERIC_ERROR_MESSAGE;
  }

  return trimmed;
}

export function toAiSupportErrorResponse(error: unknown): NextResponse {
  if (error instanceof AiSupportServiceError) {
    if (error.logMessage !== error.message) {
      console.error(error.logMessage);
    }

    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: error.status }
    );
  }

  if (error instanceof Error) {
    console.error("[ai-support] unexpected error:", error.message);

    if (error.message === "OPENAI_API_KEY 未設定") {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      {
        success: false,
        error: sanitizeAiSupportClientError(error.message),
      },
      { status: 500 }
    );
  }

  console.error("[ai-support] unexpected error:", error);
  return NextResponse.json(
    {
      success: false,
      error: AI_SUPPORT_GENERIC_ERROR_MESSAGE,
    },
    { status: 500 }
  );
}
