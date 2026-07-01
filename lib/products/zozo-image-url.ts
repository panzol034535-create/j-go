const MIN_ZOZO_DISPLAY_DIMENSION = 400;

export function isZozoImageHost(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes("c.imgz.jp") || lower.includes("imgz.jp");
}

export function getZozoUrlDimensions(url: string): { width: number; height: number } | null {
  const detailPair = url.match(/_d_(\d+)_(\d+)/i);
  if (detailPair) {
    return {
      width: Number(detailPair[1]),
      height: Number(detailPair[2]),
    };
  }

  const thumbPair = url.match(/_b_(\d+)_(\d+)/i);
  if (thumbPair) {
    return {
      width: Number(thumbPair[1]),
      height: Number(thumbPair[2]),
    };
  }

  const variantThumb = url.match(/b_\d+_d_(\d+)/i);
  if (variantThumb) {
    const size = Number(variantThumb[1]);
    return { width: size, height: size };
  }

  const singleDetail = url.match(/_d_(\d+)\.(?:jpe?g|webp)(?:\?|$)/i);
  if (singleDetail) {
    const size = Number(singleDetail[1]);
    return { width: size, height: size };
  }

  return null;
}

export function isZozoThumbnailImageUrl(url: string): boolean {
  if (!isZozoImageHost(url)) {
    return false;
  }

  if (/\d+b_b_/i.test(url)) {
    return true;
  }

  if (/b_\d+_d_(\d+)/i.test(url)) {
    const match = url.match(/b_\d+_d_(\d+)/i);
    if (match && Number(match[1]) < MIN_ZOZO_DISPLAY_DIMENSION) {
      return true;
    }
  }

  const dimensions = getZozoUrlDimensions(url);
  if (dimensions) {
    return (
      dimensions.width < MIN_ZOZO_DISPLAY_DIMENSION ||
      dimensions.height < MIN_ZOZO_DISPLAY_DIMENSION
    );
  }

  if (/_b_/i.test(url)) {
    return true;
  }

  return false;
}

export function estimateZozoImagePixelCount(url: string): number {
  const dimensions = getZozoUrlDimensions(url);
  if (dimensions) {
    return dimensions.width * dimensions.height;
  }

  if (isZozoThumbnailImageUrl(url)) {
    return 1;
  }

  return 250_000;
}

/** Accept only real display-quality URLs already present in the page. Never guesses upgrades. */
export function acceptZozoDisplayImageUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed || !isZozoImageHost(trimmed)) {
    return null;
  }

  if (isZozoThumbnailImageUrl(trimmed)) {
    return null;
  }

  return trimmed;
}

export function isZozoDisplayImageUrl(url: string): boolean {
  return acceptZozoDisplayImageUrl(url) !== null;
}

export function extractZozoImageVariantKey(url: string): string | null {
  const variantMatch = url.match(/\/(\d+b_\d+)_/i);
  if (variantMatch?.[1]) {
    return variantMatch[1];
  }

  return null;
}

export function filterZozoDisplayImageUrls(urls: string[]): string[] {
  return Array.from(
    new Set(
      urls
        .map((entry) => acceptZozoDisplayImageUrl(entry))
        .filter((entry): entry is string => Boolean(entry))
    )
  ).sort((a, b) => estimateZozoImagePixelCount(b) - estimateZozoImagePixelCount(a));
}

export function findMatchingDisplayUrls(
  thumbUrl: string,
  galleryUrls: string[]
): string[] {
  const variantKey = extractZozoImageVariantKey(thumbUrl);
  if (!variantKey) {
    return [];
  }

  return filterZozoDisplayImageUrls(
    galleryUrls.filter((entry) => entry.includes(variantKey))
  );
}

/** @deprecated Use acceptZozoDisplayImageUrl — never guesses URL upgrades. */
export function normalizeZozoColorImageUrl(
  url: string,
  _options?: { log?: boolean }
): string | null {
  return acceptZozoDisplayImageUrl(url);
}

export function sanitizeColorImagesForStorage(
  colorImages: Record<string, string[]>
): Record<string, string[]> {
  const result: Record<string, string[]> = {};

  for (const [color, urls] of Object.entries(colorImages)) {
    const valid = filterZozoDisplayImageUrls(urls);
    if (valid.length > 0) {
      result[color] = valid;
    }
  }

  return result;
}

export function normalizeZozoColorImageList(urls: string[]): string[] {
  return filterZozoDisplayImageUrls(urls);
}
