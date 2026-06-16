export const SOURCE_SITES = [
  "zozo",
  "magaseek",
  "beams",
  "united-arrows",
  "freaks-store",
  "unknown",
] as const;

export type SourceSite = (typeof SOURCE_SITES)[number];

export function isSourceSite(value: string): value is SourceSite {
  return (SOURCE_SITES as readonly string[]).includes(value);
}

export function detectSourceSite(url: string): SourceSite {
  if (!url.trim()) {
    return "unknown";
  }

  try {
    const hostname = new URL(url).hostname.toLowerCase();

    if (hostname.includes("zozo.jp")) {
      return "zozo";
    }
    if (hostname.includes("magaseek.com")) {
      return "magaseek";
    }
    if (hostname.includes("beams.co.jp")) {
      return "beams";
    }
    if (hostname.includes("united-arrows.co.jp") || hostname.includes("store.united-arrows")) {
      return "united-arrows";
    }
    if (hostname.includes("freaksstore.com")) {
      return "freaks-store";
    }

    return "unknown";
  } catch {
    return "unknown";
  }
}

export function resolveSourceSite(value: string | undefined, sourceUrl: string): SourceSite {
  const trimmed = value?.trim();
  if (trimmed && isSourceSite(trimmed)) {
    return trimmed;
  }

  return detectSourceSite(sourceUrl);
}

export function resolveSourceUrl(
  sourceUrl: string | undefined,
  fallbackUrl: string | undefined
): string {
  return (sourceUrl?.trim() || fallbackUrl?.trim() || "").slice(0, 2000);
}
