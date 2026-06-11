import type { ZozoProductData } from "@/lib/types/product-import";

const ZOZO_HOST_PATTERN = /^(?:https?:\/\/)?(?:www\.)?zozo\.jp/i;

export function isZozoUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ZOZO_HOST_PATTERN.test(parsed.hostname);
  } catch {
    return false;
  }
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripTags(text: string): string {
  return decodeHtmlEntities(text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function parseJsonLd(html: string): Record<string, unknown> | null {
  const matches = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );

  for (const match of matches) {
    try {
      const parsed = JSON.parse(match[1].trim()) as unknown;
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (item && typeof item === "object" && (item as { "@type"?: string })["@type"] === "Product") {
          return item as Record<string, unknown>;
        }
      }
    } catch {
      continue;
    }
  }

  return null;
}

function extractMetaContent(html: string, property: string): string {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, "i"),
    new RegExp(`<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${property}["']`, "i"),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return decodeHtmlEntities(match[1].trim());
    }
  }

  return "";
}

function extractBrand(html: string, jsonLd: Record<string, unknown> | null): string {
  if (jsonLd?.brand) {
    if (typeof jsonLd.brand === "string") return jsonLd.brand;
    if (typeof jsonLd.brand === "object" && jsonLd.brand !== null) {
      const brandName = (jsonLd.brand as { name?: string }).name;
      if (brandName) return brandName;
    }
  }

  const shopMatch = html.match(/<a[^>]+href=["']\/shop\/([^/"']+)/i);
  if (shopMatch?.[1]) {
    return decodeHtmlEntities(shopMatch[1].replace(/-/g, " "));
  }

  const breadcrumbMatch = html.match(/breadcrumb[\s\S]{0,800}?shop[\s\S]{0,200}?>([^<]+)</i);
  if (breadcrumbMatch?.[1]) {
    return stripTags(breadcrumbMatch[1]);
  }

  return "Unknown";
}

function extractPrice(html: string, jsonLd: Record<string, unknown> | null): number {
  if (jsonLd?.offers) {
    const offers = Array.isArray(jsonLd.offers) ? jsonLd.offers[0] : jsonLd.offers;
    if (offers && typeof offers === "object") {
      const price = (offers as { price?: string | number }).price;
      const parsed = Number(price);
      if (!Number.isNaN(parsed) && parsed > 0) return parsed;
    }
  }

  const pricePatterns = [
    /"price"\s*:\s*(\d+)/i,
    /"salePrice"\s*:\s*(\d+)/i,
    /¥\s*([\d,]+)/,
    /([\d,]+)\s*円/,
    /data-price=["'](\d+)["']/i,
  ];

  for (const pattern of pricePatterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      const parsed = Number(match[1].replace(/,/g, ""));
      if (!Number.isNaN(parsed) && parsed > 0) return parsed;
    }
  }

  return 0;
}

function extractImages(html: string, jsonLd: Record<string, unknown> | null): string[] {
  const images = new Set<string>();

  if (jsonLd?.image) {
    const imageField = jsonLd.image;
    if (typeof imageField === "string") images.add(imageField);
    if (Array.isArray(imageField)) {
      imageField.forEach((img) => {
        if (typeof img === "string") images.add(img);
      });
    }
  }

  const ogImage = extractMetaContent(html, "og:image");
  if (ogImage) images.add(ogImage);

  const imageMatches = html.matchAll(/https:\/\/[^"'\s>]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s>]*)?/gi);
  for (const match of imageMatches) {
    const url = match[0];
    if (url.includes("zozo") || url.includes("zozocdn")) {
      images.add(url);
    }
  }

  return Array.from(images).slice(0, 12);
}

function extractColors(html: string): string[] {
  const colors = new Set<string>();

  const colorPatterns = [
    /"colorName"\s*:\s*"([^"]+)"/gi,
    /"color"\s*:\s*"([^"]+)"/gi,
    /data-color=["']([^"']+)["']/gi,
    /class=["'][^"']*color[^"']*["'][^>]*>([^<]+)</gi,
  ];

  for (const pattern of colorPatterns) {
    for (const match of html.matchAll(pattern)) {
      const value = stripTags(match[1] ?? "");
      if (value && value.length <= 30 && !/^\d+$/.test(value)) {
        colors.add(value);
      }
    }
  }

  if (colors.size === 0) {
    colors.add("Default");
  }

  return Array.from(colors);
}

function extractSizes(html: string): string[] {
  const sizes = new Set<string>();

  const sizePatterns = [
    /"sizeName"\s*:\s*"([^"]+)"/gi,
    /"size"\s*:\s*"([^"]+)"/gi,
    /data-size=["']([^"']+)["']/gi,
    /<option[^>]*value=["']([^"']+)["'][^>]*>/gi,
  ];

  for (const pattern of sizePatterns) {
    for (const match of html.matchAll(pattern)) {
      const value = stripTags(match[1] ?? "");
      if (
        value &&
        value.length <= 20 &&
        !/^(0|select|選択|choose)$/i.test(value)
      ) {
        sizes.add(value);
      }
    }
  }

  const commonSizes = ["XS", "S", "M", "L", "XL", "XXL", "FREE", "F"];
  for (const size of commonSizes) {
    const sizeRegex = new RegExp(`(?:>|"|'|\\s)${size}(?:<|"|'|\\s|,|\\))`, "g");
    if (sizeRegex.test(html)) {
      sizes.add(size);
    }
  }

  if (sizes.size === 0) {
    sizes.add("Free");
  }

  return Array.from(sizes);
}

function extractDescription(html: string, jsonLd: Record<string, unknown> | null): string {
  if (typeof jsonLd?.description === "string" && jsonLd.description.trim()) {
    return stripTags(jsonLd.description);
  }

  const ogDescription = extractMetaContent(html, "og:description");
  if (ogDescription) return ogDescription;

  const descMatch = html.match(/class=["'][^"']*description[^"']*["'][^>]*>([\s\S]{0,2000}?)<\//i);
  if (descMatch?.[1]) {
    return stripTags(descMatch[1]).slice(0, 1000);
  }

  return "";
}

function extractName(html: string, jsonLd: Record<string, unknown> | null): string {
  if (typeof jsonLd?.name === "string" && jsonLd.name.trim()) {
    return stripTags(jsonLd.name);
  }

  const ogTitle = extractMetaContent(html, "og:title");
  if (ogTitle) return ogTitle;

  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch?.[1]) {
    return stripTags(titleMatch[1]).replace(/\s*[|｜].*$/, "").trim();
  }

  return "";
}

export async function fetchZozoProduct(url: string): Promise<ZozoProductData> {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "ja-JP,ja;q=0.9,en;q=0.8",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`無法抓取 ZOZO 商品頁（HTTP ${response.status}）`);
  }

  const html = await response.text();
  const jsonLd = parseJsonLd(html);

  const name_jp = extractName(html, jsonLd);
  const brand = extractBrand(html, jsonLd);
  const jpy_price = extractPrice(html, jsonLd);
  const description_jp = extractDescription(html, jsonLd);
  const images = extractImages(html, jsonLd);
  const main_image = images[0] ?? extractMetaContent(html, "og:image");
  const colors = extractColors(html);
  const sizes = extractSizes(html);

  if (!name_jp) {
    throw new Error("無法解析商品名稱，請確認網址是否正確");
  }

  if (!jpy_price) {
    throw new Error("無法解析商品價格，請確認網址是否正確");
  }

  return {
    name_jp,
    brand,
    jpy_price,
    description_jp,
    main_image,
    images,
    colors,
    sizes,
  };
}
