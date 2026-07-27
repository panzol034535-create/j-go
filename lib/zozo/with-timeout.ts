export const ZOZO_FETCH_TIMEOUT_MS = 15_000;

export class ZozoFetchTimeoutError extends Error {
  constructor(message = "source_timeout") {
    super(message);
    this.name = "ZozoFetchTimeoutError";
  }
}

export function isZozoFetchTimeoutError(error: unknown): boolean {
  if (error instanceof ZozoFetchTimeoutError) {
    return true;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message === "source_timeout" ||
      message.includes("timeout") ||
      message.includes("timed out")
    );
  }

  return false;
}

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message = "source_timeout"
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new ZozoFetchTimeoutError(message));
    }, ms);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}
