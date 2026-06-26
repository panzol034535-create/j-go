import { NextResponse } from "next/server";

export const REVALIDATE_SECONDS = 60;

export class XanoFetchError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "XanoFetchError";
    this.status = status;
  }
}

export function isXanoFetchError(error: unknown): error is XanoFetchError {
  return error instanceof XanoFetchError;
}

type FetchXanoJsonOptions = {
  revalidate?: number | false;
};

export async function fetchXanoJson(
  url: string,
  options: FetchXanoJsonOptions = {}
): Promise<unknown> {
  const revalidate = options.revalidate ?? REVALIDATE_SECONDS;
  const init =
    revalidate === false
      ? ({ cache: "no-store" } as const)
      : ({ next: { revalidate } } as const);

  const response = await fetch(url, init);

  if (!response.ok) {
    const errorText = await response.text();
    throw new XanoFetchError(
      response.status,
      `Fetch failed (${response.status}): ${errorText}`
    );
  }

  return response.json();
}

export async function fetchRevalidatedJson(url: string): Promise<unknown> {
  return fetchXanoJson(url, { revalidate: REVALIDATE_SECONDS });
}

export function resolveXanoErrorMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof XanoFetchError) {
    if (error.status === 429) {
      return "Xano 請求過於頻繁，請稍候 20 秒再重試。";
    }

    return error.message;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallbackMessage;
}

export function xanoErrorResponse(
  error: unknown,
  fallbackMessage: string,
  extra?: Record<string, unknown>
) {
  const message = resolveXanoErrorMessage(error, fallbackMessage);
  const status =
    error instanceof XanoFetchError && error.status >= 400 && error.status < 600
      ? error.status
      : 500;

  return NextResponse.json(
    {
      error: message,
      success: false,
      message,
      ...extra,
    },
    { status }
  );
}
