export function parseSourceProductIdFromUrl(sourceUrl: string): string {
  const trimmed = sourceUrl.trim();
  if (!trimmed) {
    return "";
  }

  const match = trimmed.match(/\/goods(?:-sale)?\/(\d+)/i);
  return match?.[1] || "";
}
