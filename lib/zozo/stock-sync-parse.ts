import {
  normalizeSize,
  normalizeStoredColor,
  type VariantStockEntry,
} from "@/lib/products/variant-stock-normalize";

export type ZozoPageStockStatus =
  | "available"
  | "source_missing"
  | "discontinued"
  | "all_out_of_stock"
  | "sync_uncertain";

export type ZozoStockSyncFetchResult =
  | {
      kind: "unpublish";
      status: "source_missing" | "discontinued" | "all_out_of_stock";
      reason: string;
      current_jpy_price: number | null;
      variant_stock: VariantStockEntry[];
    }
  | {
      kind: "uncertain";
      check_status: "sync_uncertain" | "needs_manual_review";
      reason: string;
      current_jpy_price: number | null;
      variant_stock: VariantStockEntry[];
    }
  | {
      kind: "sync";
      current_jpy_price: number | null;
      variant_stock: VariantStockEntry[];
      last_stock_status: "in_stock" | "out_of_stock" | "unknown";
    };

const SIZE_STOCK_LINE_PATTERN =
  /\b(XS|S|M|L|XL|XXL|FREE|F|X-SMALL|SMALL|MEDIUM|LARGE|X-LARGE)\s*[\/／]\s*(在庫あり|在庫なし|残り\d*点?|売り切れ|完売)/gi;

const SOURCE_MISSING_MARKERS = [
  "\u5546\u54c1\u30da\u30fc\u30b8\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093",
  "\u304a\u63a2\u3057\u306e\u30da\u30fc\u30b8\u306f\u898b\u3064\u304b\u308a\u307e\u305b\u3093",
  "\u30da\u30fc\u30b8\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093",
  "\u6307\u5b9a\u3055\u308c\u305fURL\u306f\u5b58\u5728\u3057\u307e\u305b\u3093",
  "\u3053\u306e\u30da\u30fc\u30b8\u306f\u5b58\u5728\u3057\u307e\u305b\u3093",
  "\u5546\u54c1\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093",
  "\u5b58\u5728\u3057\u306a\u3044\u5546\u54c1",
  "URL\u304c\u6b63\u3057\u304f\u3042\u308a\u307e\u305b\u3093",
  "not found",
  "404 not found",
  "404 error",
];

const DISCONTINUED_MARKERS = [
  "\u8ca9\u58f2\u7d42\u4e86",
  "\u8ca9\u58f2\u3092\u7d42\u4e86",
  "\u3053\u306e\u5546\u54c1\u306f\u8ca9\u58f2\u7d42\u4e86\u3057\u307e\u3057\u305f",
  "\u3053\u306e\u5546\u54c1\u306f\u73fe\u5728\u8ca9\u58f2\u3057\u3066\u304a\u308a\u307e\u305b\u3093",
  "\u73fe\u5728\u8ca9\u58f2\u3057\u3066\u304a\u308a\u307e\u305b\u3093",
  "\u53d6\u308a\u6271\u3044\u304c\u7d42\u4e86",
  "\u53d6\u308a\u6271\u3044\u7d42\u4e86",
  "\u3053\u306e\u5546\u54c1\u306e\u53d6\u6271\u3044\u306f\u7d42\u4e86",
  "\u73fe\u5728\u53d6\u308a\u6271\u3063\u3066\u304a\u308a\u307e\u305b\u3093",
  "\u63b2\u8f09\u7d42\u4e86",
  "\u63b2\u8f09\u304c\u7d42\u4e86",
  "\u3053\u306e\u5546\u54c1\u306f\u63b2\u8f09\u304c\u7d42\u4e86\u3057\u307e\u3057\u305f",
];

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

export function htmlToVisibleText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, "\n")
      .replace(/<style[\s\S]*?<\/style>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|tr|h[1-6]|section|article)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim()
  );
}

function extractTitle(html: string): string {
  const match = html.match(/<title>([^<]*)<\/title>/i);
  return match?.[1] ? decodeHtmlEntities(match[1].trim()) : "";
}

function parseJsonLdProduct(html: string): Record<string, unknown> | null {
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

export function extractCurrentJpyPriceFromHtml(html: string): number | null {
  const jsonLd = parseJsonLdProduct(html);

  if (jsonLd?.offers) {
    const offers = Array.isArray(jsonLd.offers) ? jsonLd.offers[0] : jsonLd.offers;
    if (offers && typeof offers === "object") {
      const price = Number((offers as { price?: string | number }).price);
      if (Number.isFinite(price) && price > 0) {
        return Math.round(price);
      }
    }
  }

  const patterns = [/"price"\s*:\s*(\d+)/i, /¥\s*([\d,]+)/, /([\d,]+)\s*円/];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      const parsed = Number(match[1].replace(/,/g, ""));
      if (Number.isFinite(parsed) && parsed > 0) {
        return Math.round(parsed);
      }
    }
  }

  return null;
}

function parseStockStatusFromText(text: string): "in_stock" | "out_of_stock" | null {
  const normalized = text.trim();
  if (!normalized) {
    return null;
  }

  if (/在庫なし|売り切れ|完売/.test(normalized)) {
    return "out_of_stock";
  }

  if (/在庫あり|残り/.test(normalized)) {
    return "in_stock";
  }

  return null;
}

function isLikelyColorLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 40) {
    return false;
  }

  if (SIZE_STOCK_LINE_PATTERN.test(trimmed)) {
    SIZE_STOCK_LINE_PATTERN.lastIndex = 0;
    return false;
  }

  if (/^(サイズ|カラー|color|size|数量|カート|レビュー|商品説明)/i.test(trimmed)) {
    return false;
  }

  return !/在庫あり|在庫なし|売り切れ|完売/.test(trimmed);
}

export function parseVariantStockFromText(text: string): VariantStockEntry[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  let currentColor: string | null = null;
  const results: VariantStockEntry[] = [];

  for (const line of lines) {
    SIZE_STOCK_LINE_PATTERN.lastIndex = 0;
    const sizeMatches = [...line.matchAll(SIZE_STOCK_LINE_PATTERN)];

    if (sizeMatches.length > 0) {
      if (!currentColor) {
        continue;
      }

      for (const match of sizeMatches) {
        const stockStatus = parseStockStatusFromText(match[2] || "");
        if (!stockStatus) {
          continue;
        }

        results.push({
          color: normalizeStoredColor(currentColor),
          size: normalizeSize(match[1] || ""),
          stock_status: stockStatus,
        });
      }
      continue;
    }

    if (isLikelyColorLine(line)) {
      currentColor = line;
    }
  }

  const deduped = new Map<string, VariantStockEntry>();
  for (const entry of results) {
    deduped.set(`${entry.color}::${entry.size}`, entry);
  }

  return Array.from(deduped.values());
}

function includesAnyMarker(haystack: string, markers: string[]): boolean {
  const lower = haystack.toLowerCase();
  return markers.some((marker) => lower.includes(marker.toLowerCase()));
}

export function classifyZozoPage(html: string, finalUrl: string, httpStatus: number) {
  const title = extractTitle(html);
  const text = htmlToVisibleText(html);
  const combined = `${title}\n${text}\n${finalUrl}`;

  if (
    httpStatus === 404 ||
    includesAnyMarker(combined, SOURCE_MISSING_MARKERS) ||
    /\/404\/?/i.test(finalUrl)
  ) {
    return {
      status: "source_missing" as const,
      reason: "來源商品不存在或網址失效",
    };
  }

  if (includesAnyMarker(combined, DISCONTINUED_MARKERS)) {
    return {
      status: "discontinued" as const,
      reason: "來源商品已下架或販售終了",
    };
  }

  const variantStock = parseVariantStockFromText(text);
  if (variantStock.length === 0) {
    return {
      status: "sync_uncertain" as const,
      reason: "無法解析商品庫存區塊",
    };
  }

  const hasPurchasable = variantStock.some((entry) => entry.stock_status === "in_stock");
  if (!hasPurchasable) {
    return {
      status: "all_out_of_stock" as const,
      reason: "所有尺寸皆無庫存",
      variant_stock: variantStock,
    };
  }

  return {
    status: "available" as const,
    variant_stock: variantStock,
  };
}

export function resolveLastStockStatusFromEntries(
  entries: VariantStockEntry[]
): "in_stock" | "out_of_stock" | "unknown" {
  if (entries.length === 0) {
    return "unknown";
  }

  if (entries.some((entry) => entry.stock_status === "in_stock")) {
    return "in_stock";
  }

  if (entries.every((entry) => entry.stock_status === "out_of_stock")) {
    return "out_of_stock";
  }

  return "unknown";
}

export function buildZozoStockSyncFetchResult(options: {
  html: string;
  finalUrl: string;
  httpStatus: number;
}): ZozoStockSyncFetchResult {
  const classification = classifyZozoPage(options.html, options.finalUrl, options.httpStatus);
  const current_jpy_price = extractCurrentJpyPriceFromHtml(options.html);

  if (classification.status === "sync_uncertain") {
    return {
      kind: "uncertain",
      check_status: "sync_uncertain",
      reason: classification.reason,
      current_jpy_price,
      variant_stock: [],
    };
  }

  if (classification.status === "source_missing") {
    return {
      kind: "unpublish",
      status: "source_missing",
      reason: classification.reason,
      current_jpy_price,
      variant_stock: [],
    };
  }

  if (classification.status === "discontinued") {
    return {
      kind: "unpublish",
      status: "discontinued",
      reason: classification.reason,
      current_jpy_price,
      variant_stock: [],
    };
  }

  if (classification.status === "all_out_of_stock") {
    return {
      kind: "unpublish",
      status: "all_out_of_stock",
      reason: classification.reason,
      current_jpy_price,
      variant_stock: classification.variant_stock,
    };
  }

  return {
    kind: "sync",
    current_jpy_price,
    variant_stock: classification.variant_stock,
    last_stock_status: resolveLastStockStatusFromEntries(classification.variant_stock),
  };
}
