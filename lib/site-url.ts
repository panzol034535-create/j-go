export const PRODUCTION_SITE_URL = "https://lookpick.tw";

const LEGACY_PRODUCTION_HOST = "j-go-xd5a.vercel.app";

function normalizeSiteUrl(url: string) {
  return url.trim().replace(/\/$/, "");
}

function isLegacyProductionHost(url: string) {
  try {
    return new URL(url).hostname === LEGACY_PRODUCTION_HOST;
  } catch {
    return false;
  }
}

function resolvePreviewSiteUrl() {
  const configuredPublic = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configuredPublic && !isLegacyProductionHost(configuredPublic)) {
    return normalizeSiteUrl(configuredPublic);
  }

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) {
    return normalizeSiteUrl(`https://${vercelUrl}`);
  }

  return "http://localhost:3000";
}

export function resolveServerSiteUrl() {
  const serverUrl = process.env.SERVER_SITE_URL?.trim();
  if (serverUrl && !isLegacyProductionHost(serverUrl)) {
    return normalizeSiteUrl(serverUrl);
  }

  if (process.env.VERCEL_ENV === "production") {
    return PRODUCTION_SITE_URL;
  }

  return resolvePreviewSiteUrl();
}

export function resolvePublicSiteUrl() {
  const publicUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (publicUrl && !isLegacyProductionHost(publicUrl)) {
    return normalizeSiteUrl(publicUrl);
  }

  if (process.env.NEXT_PUBLIC_VERCEL_ENV === "production" || process.env.VERCEL_ENV === "production") {
    return PRODUCTION_SITE_URL;
  }

  return resolvePreviewSiteUrl();
}

export function buildServerSiteUrl(path = "/", query?: Record<string, string | number | boolean | null | undefined>) {
  const url = new URL(path.startsWith("/") ? path : `/${path}`, `${resolveServerSiteUrl()}/`);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === null || value === undefined || value === "") {
        continue;
      }
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}
