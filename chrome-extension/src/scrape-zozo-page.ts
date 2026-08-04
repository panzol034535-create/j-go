export { acceptZozoDisplayImageUrl } from "../../lib/products/zozo-image-url";

import type { ScrapeResult, VariantStock } from "./types";
import { isValidZozoColorName, normalizeStoredColor } from "../../lib/products/color-normalize";
import { normalizeSize } from "../../lib/products/variant-stock-normalize";
import {
  acceptZozoDisplayImageUrl,
  filterZozoDisplayImageUrls,
  findMatchingDisplayUrls,
  isZozoThumbnailImageUrl,
  sanitizeColorImagesForStorage,
} from "../../lib/products/zozo-image-url";
import {
  countSizeTableHeaderKeywords,
  isSizeTableSizeToken,
  isValidSizeTableBlock,
  mapSizeTableHeaderToField,
  normalizeSizeTableHeader,
  normalizeSizeTableRows,
  parseSizeTableFromText,
  SIZE_TABLE_HEADER_KEYWORDS,
  type ZozoSizeTableRow,
} from "../../lib/products/size-table-json";
import {
  parseZozoModelSizeFromText,
  type ZozoModelSize,
} from "../../lib/products/zozo-model-size";

type ProductVariant = {
  color: string;
  size: string;
};

const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "FREE"] as const;

const MAX_COLORS = 10;
const MAX_IMAGES = 20;
const MIN_IMAGE_DIMENSION = 120;
const MAX_IMAGE_ASPECT_RATIO = 3;

const EXCLUDED_IMAGE_KEYWORDS = [
  "banner",
  "bnr",
  "buyee",
  "shopnow",
  "shop-now",
  "ad",
  "campaign",
  "logo",
  "icon",
] as const;

const COLOR_FIELD_KEYS = ["color", "colorName", "color_name", "colour", "colorLabel"] as const;
const SIZE_FIELD_KEYS = ["size", "sizeName", "size_name", "sizeLabel"] as const;

const VARIANT_CONTAINER_KEYS = new Set([
  "variants",
  "variantList",
  "skus",
  "skuList",
  "stocks",
  "stockList",
  "colorSizeStocks",
  "goodsSkus",
  "skuStocks",
  "items",
  "hasVariant",
]);

const EXCLUDED_COLOR_KEYWORDS = [
  "詳しく",
  "詳細",
  "カート",
  "カード",
  "レビュー",
  "送料",
  "配送",
  "匯入",
  "J-GO",
  "ログイン",
  "お気に入り",
  "サイズ",
  "在庫",
  "選択",
  "カラー",
];

const EXCLUDED_SIZE_KEYWORDS = [
  "レビュー",
  "詳細",
  "商品説明",
  "送料",
  "カート",
  "お気に入り",
  "ZOZO",
  "匯入",
  "J-GO",
  "選択",
  "在庫",
];

const STOCK_TEXT_FIELD_KEYS = [
  "stockStatus",
  "stock_status",
  "stockText",
  "stockLabel",
  "displayStock",
  "stockMessage",
  "inventoryStatus",
  "stockName",
] as const;

const SIZE_STOCK_TEXT_PATTERN =
  /\b(XS|S|M|L|XL|XXL|FREE|F|X-SMALL|SMALL|MEDIUM|LARGE|X-LARGE)\s*\/\s*(在庫あり|在庫なし|残り\d*点?|売り切れ|完売|販売終了|入荷待ち|予約可能|予約商品|予約する|カートに入れる)/gi;

const CURRENT_SIZE_STOCK_TEXT_PATTERN =
  /(XXL|XL|XS|FREE|SMALL|MEDIUM|LARGE|S|M|L)\s*[\/／]\s*(在庫あり|在庫なし|残り\d+点|残り\d*点?|売り切れ|完売|販売終了|入荷待ち|予約可能|予約商品|予約する|カートに入れる)/gi;

function decodeHtmlEntities(text: string): string {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = text;
  return textarea.value;
}

function stripText(text: string): string {
  return decodeHtmlEntities(text.replace(/\s+/g, " ").trim());
}

function getMetaContent(property: string): string {
  const selectors = [
    `meta[property="${property}"]`,
    `meta[name="${property}"]`,
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    const content = element?.getAttribute("content")?.trim();
    if (content) {
      return decodeHtmlEntities(content);
    }
  }

  return "";
}

function findProductJsonLd(): Record<string, unknown> | null {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');

  for (const script of scripts) {
    try {
      const parsed = JSON.parse(script.textContent?.trim() || "null") as unknown;
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

function findPurchaseAreaByMarkers(): Element | null {
  const elements = document.querySelectorAll("section, form, aside, article, div");
  let bestMatch: Element | null = null;
  let smallestSize = Infinity;

  elements.forEach((element) => {
    const text = element.textContent || "";
    const hasStockMarker = /在庫あり|在庫なし/.test(text);
    const hasCartMarker = text.includes("カートに入れる");

    if (!hasStockMarker && !hasCartMarker) {
      return;
    }

    const size = text.length;
    if (size < smallestSize) {
      smallestSize = size;
      bestMatch = element;
    }
  });

  return bestMatch;
}

function findPurchaseArea(): Element | null {
  const selectors = [
    '[data-testid*="purchase" i]',
    '[data-testid*="Purchase" i]',
    '[data-testid*="add-to-cart" i]',
    '[data-testid*="AddToCart" i]',
    '[data-testid*="cart-area" i]',
    '[data-testid*="buy" i]',
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element instanceof Element) {
      return element;
    }
  }

  const byMarkers = findPurchaseAreaByMarkers();
  if (byMarkers) {
    return byMarkers;
  }

  const sizeBlock = document.querySelector('[data-testid*="size" i]');
  if (sizeBlock instanceof Element) {
    return (
      sizeBlock.closest("section, form, aside, article, div") ||
      sizeBlock.parentElement
    );
  }

  return document.querySelector("main");
}

function pickFieldValue(record: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return stripText(value);
    }
  }

  return "";
}

function isExcludedKeyword(value: string, keywords: string[]): boolean {
  return keywords.some((keyword) => value.includes(keyword));
}

function isLikelyColorName(name: string): boolean {
  if (!name || name.length < 2 || name.length > 30) {
    return false;
  }

  if (isExcludedKeyword(name, EXCLUDED_COLOR_KEYWORDS)) {
    return false;
  }

  if (/^(select|choose|size|color|default)$/i.test(name)) {
    return false;
  }

  if (/^[A-Z0-9 /\\-]+$/.test(name) && name.length <= 4) {
    return false;
  }

  return isValidZozoColorName(name);
}

function isLikelySizeName(name: string): boolean {
  if (!name || name.length < 1 || name.length > 15) {
    return false;
  }

  if (isExcludedKeyword(name, EXCLUDED_SIZE_KEYWORDS)) {
    return false;
  }

  if (/^(0|select|選択|choose|default)$/i.test(name)) {
    return false;
  }

  return true;
}

function sortSizes(sizes: Set<string>): string[] {
  return Array.from(sizes).sort((a, b) => {
    const ai = SIZE_ORDER.indexOf(a.toUpperCase() as (typeof SIZE_ORDER)[number]);
    const bi = SIZE_ORDER.indexOf(b.toUpperCase() as (typeof SIZE_ORDER)[number]);
    if (ai === -1 && bi === -1) {
      return a.localeCompare(b);
    }
    if (ai === -1) {
      return 1;
    }
    if (bi === -1) {
      return -1;
    }
    return ai - bi;
  });
}

function dedupeVariants(variants: ProductVariant[]): ProductVariant[] {
  const seen = new Set<string>();
  const result: ProductVariant[] = [];

  for (const variant of variants) {
    const color = stripText(variant.color);
    const size = normalizeSize(stripText(variant.size));
    if (!color || !size) {
      continue;
    }

    const key = `${color}\0${size}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push({ color, size });
  }

  return result;
}

function collectVariantsFromRecord(record: Record<string, unknown>): ProductVariant[] {
  const color = pickFieldValue(record, COLOR_FIELD_KEYS);
  const size = pickFieldValue(record, SIZE_FIELD_KEYS);

  if (!color || !size || !isLikelyColorName(color) || !isLikelySizeName(size)) {
    return [];
  }

  return [{ color, size: normalizeSize(size) }];
}

function collectVariantsFromUnknown(node: unknown, depth = 0): ProductVariant[] {
  if (depth > 12 || node == null) {
    return [];
  }

  if (Array.isArray(node)) {
    const variants: ProductVariant[] = [];
    for (const item of node) {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        variants.push(...collectVariantsFromRecord(item as Record<string, unknown>));
      }
      variants.push(...collectVariantsFromUnknown(item, depth + 1));
    }
    return variants;
  }

  if (typeof node !== "object") {
    return [];
  }

  const record = node as Record<string, unknown>;
  const variants = collectVariantsFromRecord(record);

  for (const [key, value] of Object.entries(record)) {
    if (VARIANT_CONTAINER_KEYS.has(key) || Array.isArray(value)) {
      variants.push(...collectVariantsFromUnknown(value, depth + 1));
    } else if (value && typeof value === "object") {
      variants.push(...collectVariantsFromUnknown(value, depth + 1));
    }
  }

  return variants;
}

function extractVariantsFromJsonLd(jsonLd: Record<string, unknown> | null): ProductVariant[] {
  if (!jsonLd) {
    return [];
  }

  return dedupeVariants(collectVariantsFromUnknown(jsonLd));
}

function parseJsonScript(id: string): unknown {
  const element = document.getElementById(id);
  if (!element) {
    return null;
  }

  try {
    return JSON.parse(element.textContent?.trim() || "null");
  } catch {
    return null;
  }
}

function extractVariantsFromNextData(): ProductVariant[] {
  const nextData = parseJsonScript("__NEXT_DATA__");
  if (!nextData) {
    return [];
  }

  return dedupeVariants(collectVariantsFromUnknown(nextData));
}

function extractVariantsFromInitialState(): ProductVariant[] {
  const initialState = (window as Window & { __INITIAL_STATE__?: unknown }).__INITIAL_STATE__;
  if (!initialState) {
    return [];
  }

  return dedupeVariants(collectVariantsFromUnknown(initialState));
}

function extractStructuredVariants(): ProductVariant[] {
  const jsonLd = findProductJsonLd();
  const merged = [
    ...extractVariantsFromJsonLd(jsonLd),
    ...extractVariantsFromNextData(),
    ...extractVariantsFromInitialState(),
  ];

  return dedupeVariants(merged);
}

function variantsToColorsAndSizes(variants: ProductVariant[]): {
  colors: string[];
  sizes: string[];
} {
  const colors = new Set<string>();
  const sizes = new Set<string>();

  for (const variant of variants) {
    colors.add(variant.color);
    sizes.add(variant.size);
  }

  return {
    colors: Array.from(colors).slice(0, MAX_COLORS),
    sizes: sortSizes(sizes),
  };
}

function getAttributeCandidates(element: Element): string[] {
  return [
    element.getAttribute("data-color"),
    element.getAttribute("data-size"),
    element.getAttribute("value"),
    element.getAttribute("aria-label"),
    element.getAttribute("title"),
    element.getAttribute("label"),
  ].filter((value): value is string => Boolean(value?.trim()));
}

function extractSizeFromTestId(testId: string): string | null {
  const patterns = [
    /size[-_]?([A-Za-z0-9]+)/i,
    /SizeSelector[-_]?([A-Za-z0-9]+)/i,
    /sku[-_]?([A-Za-z0-9]+)/i,
  ];

  for (const pattern of patterns) {
    const match = testId.match(pattern);
    if (match?.[1] && isLikelySizeName(match[1])) {
      return normalizeSize(match[1]);
    }
  }

  return null;
}

function extractColorsFromDom(): string[] {
  const root = findPurchaseArea() ?? document;
  const colors = new Set<string>();

  root.querySelectorAll("[data-color]").forEach((element) => {
    const value = element.getAttribute("data-color")?.trim();
    if (value && isLikelyColorName(value)) {
      colors.add(stripText(value));
    }
  });

  root.querySelectorAll('button[data-testid*="color" i], [data-testid*="color" i][role="button"]').forEach((element) => {
    for (const candidate of getAttributeCandidates(element)) {
      if (isLikelyColorName(candidate)) {
        colors.add(stripText(candidate));
      }
    }

    element.querySelectorAll("img[alt]").forEach((img) => {
      const alt = img.getAttribute("alt")?.trim();
      if (alt && isLikelyColorName(alt)) {
        colors.add(stripText(alt));
      }
    });
  });

  const scopedHtml = root.innerHTML;
  for (const match of scopedHtml.matchAll(/"colorName"\s*:\s*"([^"]+)"/gi)) {
    const name = stripText(match[1] || "");
    if (isLikelyColorName(name)) {
      colors.add(name);
    }
  }

  const deduped = Array.from(colors).slice(0, MAX_COLORS);
  return deduped.length > 0 ? deduped : ["Default"];
}

function extractSizesFromDom(): string[] {
  const root = findPurchaseArea() ?? document;
  const sizes = new Set<string>();

  root.querySelectorAll("select option").forEach((element) => {
    if (!(element instanceof HTMLOptionElement)) {
      return;
    }

    const candidates = [
      element.value,
      element.getAttribute("label"),
      element.getAttribute("data-size"),
    ];

    for (const candidate of candidates) {
      const value = candidate?.trim();
      if (value && isLikelySizeName(value)) {
        sizes.add(normalizeSize(value));
      }
    }
  });

  root.querySelectorAll("button[data-testid]").forEach((element) => {
    for (const candidate of getAttributeCandidates(element)) {
      if (isLikelySizeName(candidate)) {
        sizes.add(normalizeSize(candidate));
      }
    }

    const testId = element.getAttribute("data-testid") || "";
    const fromTestId = extractSizeFromTestId(testId);
    if (fromTestId) {
      sizes.add(fromTestId);
    }
  });

  root.querySelectorAll('[data-testid*="size" i], [data-size], [class*="size-select" i], [class*="SizeSelect" i]').forEach((element) => {
    for (const candidate of getAttributeCandidates(element)) {
      if (isLikelySizeName(candidate)) {
        sizes.add(normalizeSize(candidate));
      }
    }
  });

  const scopedHtml = root.innerHTML;
  for (const match of scopedHtml.matchAll(/"sizeName"\s*:\s*"([^"]+)"/gi)) {
    const name = stripText(match[1] || "");
    if (isLikelySizeName(name)) {
      sizes.add(normalizeSize(name));
    }
  }

  if (sizes.size === 0) {
    return ["Free"];
  }

  return sortSizes(sizes);
}

function extractColorsAndSizes(): { colors: string[]; sizes: string[] } {
  const variants = extractStructuredVariants();

  if (variants.length > 0) {
    return variantsToColorsAndSizes(variants);
  }

  return {
    colors: extractColorsFromDom(),
    sizes: extractSizesFromDom(),
  };
}

function parseStockStatusFromText(text: string): "in_stock" | "out_of_stock" | null {
  const normalized = stripText(text);
  if (!normalized) {
    return null;
  }

  if (/在庫なし|売り切れ|完売|販売終了|入荷待ち/.test(normalized)) {
    return "out_of_stock";
  }

  if (/在庫あり|残り|予約可能|予約商品|予約する|カートに入れる/.test(normalized)) {
    return "in_stock";
  }

  return null;
}

function pickStockText(record: Record<string, unknown>): string {
  for (const key of STOCK_TEXT_FIELD_KEYS) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return stripText(value);
    }
  }

  return "";
}

function parseExplicitStockStatus(
  record: Record<string, unknown>
): "in_stock" | "out_of_stock" | null {
  const directStatus = record.stock_status ?? record.stockStatus;
  if (typeof directStatus === "string" && directStatus.trim()) {
    const normalized = directStatus.trim().toLowerCase();
    if (normalized === "in_stock") {
      return "in_stock";
    }
    if (normalized === "out_of_stock") {
      return "out_of_stock";
    }

    const fromDirectText = parseStockStatusFromText(directStatus);
    if (fromDirectText) {
      return fromDirectText;
    }
  }

  return parseStockStatusFromText(pickStockText(record));
}

function collectVariantStockFromRecord(record: Record<string, unknown>): VariantStock | null {
  const color = pickFieldValue(record, COLOR_FIELD_KEYS);
  const size = pickFieldValue(record, SIZE_FIELD_KEYS);
  const stockStatus = parseExplicitStockStatus(record);

  if (!color || !size || !stockStatus || !isLikelySizeName(size)) {
    return null;
  }

  return {
    color,
    size: normalizeSize(size),
    stock_status: stockStatus,
  };
}

function collectVariantStockFromUnknown(node: unknown, depth = 0): VariantStock[] {
  if (depth > 12 || node == null) {
    return [];
  }

  if (Array.isArray(node)) {
    const entries: VariantStock[] = [];
    for (const item of node) {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const entry = collectVariantStockFromRecord(item as Record<string, unknown>);
        if (entry) {
          entries.push(entry);
        }
      }
      entries.push(...collectVariantStockFromUnknown(item, depth + 1));
    }
    return entries;
  }

  if (typeof node !== "object") {
    return [];
  }

  const record = node as Record<string, unknown>;
  const entries: VariantStock[] = [];
  const direct = collectVariantStockFromRecord(record);
  if (direct) {
    entries.push(direct);
  }

  for (const [key, value] of Object.entries(record)) {
    if (VARIANT_CONTAINER_KEYS.has(key) || Array.isArray(value)) {
      entries.push(...collectVariantStockFromUnknown(value, depth + 1));
    } else if (value && typeof value === "object") {
      entries.push(...collectVariantStockFromUnknown(value, depth + 1));
    }
  }

  return entries;
}

function dedupeVariantStock(entries: VariantStock[]): VariantStock[] {
  const seen = new Set<string>();
  const result: VariantStock[] = [];

  for (const entry of entries) {
    const key = `${entry.color}\0${entry.size}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(entry);
  }

  return result;
}

function extractVariantStockFromStructured(): VariantStock[] {
  const jsonLd = findProductJsonLd();
  const merged = [
    ...collectVariantStockFromUnknown(jsonLd),
    ...collectVariantStockFromUnknown(parseJsonScript("__NEXT_DATA__")),
    ...collectVariantStockFromUnknown(
      (window as Window & { __INITIAL_STATE__?: unknown }).__INITIAL_STATE__
    ),
  ];

  return dedupeVariantStock(merged);
}

function extractSelectedColorFromDom(): string | null {
  const fromOptions = extractSelectedColorFromOptions();
  if (fromOptions) {
    return fromOptions;
  }

  const root = findPurchaseArea() ?? document;
  const selectedSelectors = [
    '[data-testid*="color" i][aria-pressed="true"]',
    '[data-testid*="color" i][aria-selected="true"]',
    '[data-testid*="color" i][aria-current="true"]',
    '[data-testid*="color" i][data-selected="true"]',
    '[class*="ColorSelect" i] [aria-pressed="true"]',
    '[class*="color-select" i] [aria-pressed="true"]',
    '[class*="ColorSelect" i] [aria-selected="true"]',
    '[class*="color-select" i] [aria-selected="true"]',
    'input[type="radio"][name*="color" i]:checked',
  ];

  for (const selector of selectedSelectors) {
    const selected = root.querySelector(selector);
    if (!(selected instanceof Element)) {
      continue;
    }

    const colorElement =
      selected.closest('[data-testid*="color" i], button, li, [role="button"]') || selected;
    const candidate = extractColorCandidateFromOption(colorElement);
    if (candidate && isValidZozoColorName(candidate)) {
      return stripText(candidate);
    }

    for (const attributeCandidate of getAttributeCandidates(selected)) {
      if (isValidZozoColorName(attributeCandidate)) {
        return stripText(attributeCandidate);
      }
    }

    const alt = selected.querySelector("img[alt]")?.getAttribute("alt")?.trim();
    if (alt && isValidZozoColorName(alt)) {
      return stripText(alt);
    }
  }

  return null;
}

function isColorOptionSelected(element: HTMLElement): boolean {
  if (
    element.getAttribute("aria-pressed") === "true" ||
    element.getAttribute("aria-selected") === "true" ||
    element.getAttribute("aria-current") === "true" ||
    element.getAttribute("data-selected") === "true"
  ) {
    return true;
  }

  const className = element.className.toString().toLowerCase();
  return /\b(selected|active|current|is-selected|is-active|is-current)\b/.test(className);
}

function extractSelectedColorFromOptions(): string | null {
  for (const option of findColorOptionElements()) {
    if (isColorOptionSelected(option.element)) {
      return option.rawColor;
    }
  }

  return null;
}

function extractRelaxedVisibleColor(root: Element): string | null {
  const selectedSelectors = [
    '[data-testid*="color" i][aria-pressed="true"]',
    '[data-testid*="color" i][aria-selected="true"]',
    '[class*="ColorSelect" i] [aria-pressed="true"]',
    '[class*="color-select" i] [aria-pressed="true"]',
    '[class*="ColorSelect" i] [aria-selected="true"]',
    '[class*="color-select" i] [aria-selected="true"]',
    '[class*="color" i] .selected',
    '[class*="color" i] .active',
    '[class*="Color" i] .selected',
    '[class*="Color" i] .active',
  ];

  for (const selector of selectedSelectors) {
    const element = root.querySelector(selector);
    if (!(element instanceof Element)) {
      continue;
    }

    const candidate = extractColorCandidateFromOption(element);
    if (candidate && !isRejectedColorOptionText(candidate)) {
      return stripText(candidate);
    }
  }

  return null;
}

function extractCurrentColorWithFallback(): string | null {
  const strictSelected = extractSelectedColorFromDom();
  if (strictSelected) {
    return strictSelected;
  }

  const options = findColorOptionElements();
  if (options.length === 1) {
    return options[0].rawColor;
  }

  for (const option of options) {
    if (isColorOptionSelected(option.element)) {
      return option.rawColor;
    }
  }

  const root = findPurchaseArea() ?? document;
  const relaxed = extractRelaxedVisibleColor(root);
  if (relaxed) {
    return relaxed;
  }

  for (const option of options) {
    const rect = option.element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      return option.rawColor;
    }
  }

  const domColors = extractColorsFromDom();
  if (domColors.length === 1) {
    return domColors[0];
  }

  if (domColors.length > 0) {
    return domColors[0];
  }

  return null;
}

function extractSizeStockMatchesFromText(text: string): {
  stockBySize: Map<string, "in_stock" | "out_of_stock">;
  matchedText: string[];
} {
  const stockBySize = new Map<string, "in_stock" | "out_of_stock">();
  const matchedText: string[] = [];

  if (!text.trim()) {
    return { stockBySize, matchedText };
  }

  CURRENT_SIZE_STOCK_TEXT_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(CURRENT_SIZE_STOCK_TEXT_PATTERN)) {
    const rawMatch = stripText(match[0] || "");
    if (rawMatch) {
      matchedText.push(rawMatch);
    }

    const size = normalizeSize(match[1] || "");
    const stockStatus = parseStockStatusFromText(match[2] || "");
    if (size && stockStatus) {
      stockBySize.set(size, stockStatus);
    }
  }

  return { stockBySize, matchedText };
}

function collectPageTextForSizeStock(): string[] {
  const chunks: string[] = [];
  const seen = new Set<string>();

  const addText = (text: string | null | undefined) => {
    const normalized = stripText(text || "");
    if (!normalized || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    chunks.push(normalized);
  };

  const purchaseArea = findPurchaseArea();
  addText(purchaseArea?.innerText);

  document
    .querySelectorAll(
      '[data-testid*="size" i], [class*="SizeSelect" i], [class*="size-select" i], [class*="Size" i]'
    )
    .forEach((element) => {
      addText(element.textContent);
    });

  if (document.body) {
    addText(document.body.innerText);
  }

  return chunks;
}

function extractSizeStockFromVisiblePageText(): {
  stockBySize: Map<string, "in_stock" | "out_of_stock">;
  matchedText: string[];
} {
  const stockBySize = new Map<string, "in_stock" | "out_of_stock">();
  const matchedText: string[] = [];

  for (const text of collectPageTextForSizeStock()) {
    const result = extractSizeStockMatchesFromText(text);

    for (const line of result.matchedText) {
      if (!matchedText.includes(line)) {
        matchedText.push(line);
      }
    }

    for (const [size, status] of result.stockBySize.entries()) {
      stockBySize.set(size, status);
    }
  }

  return { stockBySize, matchedText };
}

function extractSizeStockFromPurchaseArea(): Map<string, "in_stock" | "out_of_stock"> {
  const stockBySize = new Map<string, "in_stock" | "out_of_stock">();
  const root = findPurchaseArea();
  if (!root) {
    return stockBySize;
  }

  const purchaseText = root.innerText || "";
  SIZE_STOCK_TEXT_PATTERN.lastIndex = 0;
  for (const match of purchaseText.matchAll(SIZE_STOCK_TEXT_PATTERN)) {
    const size = normalizeSize(match[1] || "");
    const stockStatus = parseStockStatusFromText(match[2] || "");
    if (size && stockStatus) {
      stockBySize.set(size, stockStatus);
    }
  }

  for (const match of root.innerHTML.matchAll(
    /"sizeName"\s*:\s*"([^"]+)"[\s\S]{0,240}?"(?:stockStatus|stockText|stockLabel|displayStock|stockMessage)"\s*:\s*"([^"]+)"/gi
  )) {
    const size = normalizeSize(stripText(match[1] || ""));
    const stockStatus = parseStockStatusFromText(match[2] || "");
    if (size && stockStatus && isLikelySizeName(size)) {
      stockBySize.set(size, stockStatus);
    }
  }

  root.querySelectorAll('button[data-testid*="size" i], button[data-testid]').forEach((element) => {
    for (const candidate of [
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
    ]) {
      if (!candidate) {
        continue;
      }

      const labelMatch = candidate.match(
        /\b(XS|S|M|L|XL|XXL|FREE|F|X-SMALL|SMALL|MEDIUM|LARGE|X-LARGE)\s*\/\s*(在庫あり|在庫なし|残り\d*点?|売り切れ|完売)/i
      );
      if (!labelMatch) {
        continue;
      }

      const size = normalizeSize(labelMatch[1] || "");
      const stockStatus = parseStockStatusFromText(labelMatch[2] || "");
      if (size && stockStatus) {
        stockBySize.set(size, stockStatus);
      }
    }
  });

  return stockBySize;
}

type ColorOption = {
  element: HTMLElement;
  rawColor: string;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function findColorContainer(root: Element): Element | null {
  const containerSelectors = [
    '[data-testid*="color" i]',
    '[class*="ColorSelect" i]',
    '[class*="color-select" i]',
    '[class*="colorSelect" i]',
    '[class*="swatch" i]',
    '[aria-label*="カラー" i]',
    '[aria-label*="色" i]',
  ];

  for (const selector of containerSelectors) {
    const match = root.querySelector(selector);
    if (match instanceof Element) {
      return match.closest("section, form, aside, article, ul, div") || match;
    }
  }

  return null;
}

function isRejectedColorOptionText(text: string): boolean {
  return /アイテム|説明|レビュー|サイズ表|商品説明|カートに入れる|完売しました|在庫あり|在庫なし/.test(text);
}

function extractColorCandidateFromOption(element: Element): string | null {
  if (element instanceof HTMLImageElement) {
    const alt = element.getAttribute("alt")?.trim();
    return alt ? stripText(alt) : null;
  }

  const image = element.querySelector("img[alt]");
  if (image) {
    const alt = image.getAttribute("alt")?.trim();
    if (alt) {
      return stripText(alt);
    }
  }

  const text = stripText(element.textContent || "");
  return text || null;
}

function resolveColorClickTarget(element: Element): HTMLElement | null {
  if (element instanceof HTMLButtonElement || element instanceof HTMLLIElement) {
    return element;
  }

  const clickable = element.closest('button, li, [role="button"]');
  if (clickable instanceof HTMLElement) {
    return clickable;
  }

  return element instanceof HTMLElement ? element : null;
}

function findColorOptionElements(): ColorOption[] {
  const purchaseArea = findPurchaseArea();
  if (!purchaseArea) {
    console.log("VALID COLOR OPTIONS", []);
    console.log("INVALID COLOR OPTION REJECTED", []);
    return [];
  }

  const seen = new Set<string>();
  const validOptions: ColorOption[] = [];
  const invalidRejected: Array<{
    reason: string;
    candidate: string;
    outerHTML: string;
  }> = [];

  const candidateSelectors = [
    '[data-testid*="color" i] button',
    '[data-testid*="color" i] li',
    '[data-testid*="color" i] img[alt]',
    '[class*="ColorSelect" i] button',
    '[class*="ColorSelect" i] li',
    '[class*="ColorSelect" i] img[alt]',
    '[class*="color-select" i] button',
    '[class*="color-select" i] li',
    '[class*="color-select" i] img[alt]',
    "li[class*='swatch' i]",
    "li[class*='swatch' i] img[alt]",
    "button[data-color]",
    "li[data-color]",
  ];

  const registerCandidate = (element: Element) => {
    const candidate = extractColorCandidateFromOption(element);
    if (!candidate) {
      return;
    }

    if (isRejectedColorOptionText(candidate)) {
      invalidRejected.push({
        reason: "excluded keyword",
        candidate,
        outerHTML: element.outerHTML.slice(0, 500),
      });
      return;
    }

    if (!isValidZozoColorName(candidate)) {
      invalidRejected.push({
        reason: "not in allowlist",
        candidate,
        outerHTML: element.outerHTML.slice(0, 500),
      });
      return;
    }

    const clickTarget = resolveColorClickTarget(element);
    if (!clickTarget) {
      invalidRejected.push({
        reason: "not clickable",
        candidate,
        outerHTML: element.outerHTML.slice(0, 500),
      });
      return;
    }

    const key = normalizeStoredColor(candidate);
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    validOptions.push({ element: clickTarget, rawColor: candidate });
  };

  for (const selector of candidateSelectors) {
    purchaseArea.querySelectorAll(selector).forEach(registerCandidate);
  }

  console.log("INVALID COLOR OPTION REJECTED", invalidRejected);
  console.log(
    "VALID COLOR OPTIONS",
    validOptions.map((option) => option.rawColor)
  );

  if (validOptions.length === 0) {
    const colorContainer = findColorContainer(purchaseArea);
    console.log("COLOR CONTAINER", colorContainer?.outerHTML ?? purchaseArea.outerHTML);
  }

  return validOptions.slice(0, MAX_COLORS);
}

function colorsMatch(left: string, right: string): boolean {
  return normalizeStoredColor(left) === normalizeStoredColor(right);
}

async function clickColorOption(option: ColorOption): Promise<boolean> {
  try {
    option.element.scrollIntoView({ block: "center", inline: "nearest" });
    option.element.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, view: window })
    );
    option.element.click();
    await delay(500);

    const selectedColor = extractSelectedColorFromDom();
    if (!selectedColor) {
      return true;
    }

    return colorsMatch(selectedColor, option.rawColor);
  } catch {
    return false;
  }
}

function buildUnknownStockForColor(color: string, sizes: string[]): VariantStock[] {
  return sizes.map((size) => ({
    color,
    size: normalizeSize(size),
    stock_status: "unknown" as const,
  }));
}

function buildColorStockEntries(
  color: string,
  sizes: string[],
  sizeStockMap: Map<string, "in_stock" | "out_of_stock">
): VariantStock[] {
  return sizes.map((size) => {
    const normalizedSize = normalizeSize(size);
    const stockStatus = sizeStockMap.get(normalizedSize);

    return {
      color,
      size: normalizedSize,
      stock_status: stockStatus || "unknown",
    };
  });
}

async function extractVariantStockByClickingColors(
  colorOptions: ColorOption[],
  sizes: string[]
): Promise<VariantStock[]> {
  const result: VariantStock[] = [];

  for (const option of colorOptions) {
    const color = normalizeStoredColor(option.rawColor);
    console.log("CLICK COLOR", option.rawColor, color);

    const clickOk = await clickColorOption(option);
    let colorStock: VariantStock[] = [];

    if (!clickOk) {
      colorStock = buildUnknownStockForColor(color, sizes);
    } else {
      const sizeStockMap = extractSizeStockFromPurchaseArea();
      if (sizeStockMap.size === 0) {
        colorStock = buildUnknownStockForColor(color, sizes);
      } else {
        colorStock = buildColorStockEntries(color, sizes, sizeStockMap);
      }
    }

    console.log("COLOR STOCK", color, colorStock);
    result.push(...colorStock);
  }

  const finalVariantStock = dedupeVariantStock(result);
  console.log("FINAL VARIANT STOCK", finalVariantStock);
  return finalVariantStock;
}

async function extractVariantStock(sizes: string[]): Promise<VariantStock[]> {
  const colorOptions = findColorOptionElements();

  if (colorOptions.length === 0) {
    console.log("FINAL VARIANT STOCK", []);
    return [];
  }

  return extractVariantStockByClickingColors(colorOptions, sizes);
}

function normalizeImageUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith("data:")) {
    return null;
  }

  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  return null;
}

function containsExcludedImageKeyword(value: string): boolean {
  const lower = value.toLowerCase();
  return EXCLUDED_IMAGE_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function isZozoImageHost(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes("c.imgz.jp") || lower.includes("imgz.jp");
}

function isPreferredProductImageUrl(url: string): boolean {
  return /_d_|_m_/.test(url);
}

function getElementDimensions(element: Element): { width: number; height: number } {
  if (!(element instanceof HTMLImageElement)) {
    return { width: 0, height: 0 };
  }

  return {
    width: element.naturalWidth || element.width || element.clientWidth || 0,
    height: element.naturalHeight || element.height || element.clientHeight || 0,
  };
}

function shouldExcludeImage(url: string, alt: string, width: number, height: number): boolean {
  if (!isZozoImageHost(url)) {
    return true;
  }

  if (containsExcludedImageKeyword(url) || containsExcludedImageKeyword(alt)) {
    return true;
  }

  const relaxMinSize = isLikelyZozoProductImage(url);

  if (!relaxMinSize && width > 0 && width < MIN_IMAGE_DIMENSION) {
    return true;
  }

  if (!relaxMinSize && height > 0 && height < MIN_IMAGE_DIMENSION) {
    return true;
  }

  if (width > 0 && height > 0) {
    const aspectRatio = width / height;
    if (aspectRatio > MAX_IMAGE_ASPECT_RATIO || 1 / aspectRatio > MAX_IMAGE_ASPECT_RATIO) {
      return true;
    }
  }

  return false;
}

function compareImagePriority(a: string, b: string): number {
  const aPreferred = isPreferredProductImageUrl(a);
  const bPreferred = isPreferredProductImageUrl(b);

  if (aPreferred && !bPreferred) {
    return -1;
  }

  if (!aPreferred && bPreferred) {
    return 1;
  }

  return 0;
}

function extractName(jsonLd: Record<string, unknown> | null): string {
  if (typeof jsonLd?.name === "string" && jsonLd.name.trim()) {
    return stripText(jsonLd.name);
  }

  const ogTitle = getMetaContent("og:title");
  if (ogTitle) {
    return ogTitle.replace(/\s*[|｜].*$/, "").trim();
  }

  const title = document.title.replace(/\s*[|｜].*$/, "").trim();
  return stripText(title);
}

function extractBrand(jsonLd: Record<string, unknown> | null): string {
  if (jsonLd?.brand) {
    if (typeof jsonLd.brand === "string") {
      return stripText(jsonLd.brand);
    }

    if (typeof jsonLd.brand === "object" && jsonLd.brand !== null) {
      const brandName = (jsonLd.brand as { name?: string }).name;
      if (brandName) {
        return stripText(brandName);
      }
    }
  }

  const shopLink = document.querySelector('a[href*="/shop/"]');
  const href = shopLink?.getAttribute("href") || "";
  const shopMatch = href.match(/\/shop\/([^/?#]+)/i);
  if (shopMatch?.[1]) {
    return decodeHtmlEntities(shopMatch[1].replace(/-/g, " "));
  }

  return "Unknown";
}

function extractPrice(jsonLd: Record<string, unknown> | null): number {
  if (jsonLd?.offers) {
    const offers = Array.isArray(jsonLd.offers) ? jsonLd.offers[0] : jsonLd.offers;
    if (offers && typeof offers === "object") {
      const price = Number((offers as { price?: string | number }).price);
      if (!Number.isNaN(price) && price > 0) {
        return price;
      }
    }
  }

  const purchaseArea = findPurchaseArea();
  const purchaseText = purchaseArea?.innerText || "";
  const pricePatterns = [/¥\s*([\d,]+)/, /([\d,]+)\s*円/];

  for (const pattern of pricePatterns) {
    const match = purchaseText.match(pattern);
    if (match?.[1]) {
      const parsed = Number(match[1].replace(/,/g, ""));
      if (!Number.isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }
  }

  return 0;
}

function isLikelyZozoProductImage(url: string): boolean {
  if (!isZozoImageHost(url)) {
    return false;
  }

  return (
    isPreferredProductImageUrl(url) ||
    /\/goods\/|\/item\/|product|_c_|_d_|_m_/i.test(url)
  );
}

/** ZOZO CDN product/thumbnail URLs (includes gallery `_b_` thumbs). */
function isZozoGoodsCdnImage(url: string): boolean {
  if (!isZozoImageHost(url) || containsExcludedImageKeyword(url)) {
    return false;
  }

  return (
    /\d+[a-z]?_[bmd]_\d+_\d+/i.test(url) ||
    isLikelyZozoProductImage(url)
  );
}

function pickThumbUrlForMatching(urls: string[]): string | null {
  const candidates = urls
    .map((entry) => normalizeImageUrl(entry))
    .filter((entry): entry is string => Boolean(entry));

  return (
    candidates.find((entry) => isZozoThumbnailImageUrl(entry)) ||
    candidates.find((entry) => isZozoGoodsCdnImage(entry)) ||
    null
  );
}

function resolveColorDisplayUrlsForThumb(
  thumbUrls: string[],
  carouselPool: string[],
  itemIndex: number
): string[] {
  const thumbUrl = pickThumbUrlForMatching(thumbUrls);
  console.log("COLOR THUMB URL", thumbUrl || null);

  if (!thumbUrl) {
    console.log("SKIP INVALID COLOR IMAGE", "missing thumb url");
    return [];
  }

  const variantMatches = findMatchingDisplayUrls(thumbUrl, carouselPool);
  if (variantMatches.length > 0) {
    console.log("MATCHED REAL GALLERY URL", variantMatches[0]);
    return variantMatches;
  }

  const indexMatch = carouselPool[itemIndex];
  if (indexMatch && acceptZozoDisplayImageUrl(indexMatch)) {
    console.log("MATCHED REAL GALLERY URL", indexMatch);
    return [indexMatch];
  }

  console.log("SKIP INVALID COLOR IMAGE", thumbUrl);
  return [];
}

function collectRealGalleryDisplayUrls(...roots: (Element | null | undefined)[]): string[] {
  const urls: string[] = [];
  const seenRoots = new Set<Element>();

  for (const root of roots) {
    if (!root || seenRoots.has(root)) {
      continue;
    }

    seenRoots.add(root);

    root.querySelectorAll("img, source[srcset], source[src]").forEach((element) => {
      if (isInsideExcludedRecommendationBlock(element)) {
        return;
      }

      urls.push(...collectImageUrlsFromElement(element));
    });
  }

  return filterZozoDisplayImageUrls(
    urls
      .map((entry) => normalizeImageUrl(entry))
      .filter((entry): entry is string => Boolean(entry))
  );
}

function findMainProductImageCarousel(): Element | null {
  const main = document.querySelector("main") ?? document.body;
  const selectors = [
    '[data-testid*="main-image" i]',
    '[class*="MainImage" i]',
    '[class*="main-image" i]',
    '[class*="PrimaryImage" i]',
    '[class*="ProductImageCarousel" i]',
    '[class*="SlideImage" i]',
    '[class*="Carousel" i][class*="Image" i]',
  ];

  for (const selector of selectors) {
    const match = main.querySelector(selector);
    if (match instanceof Element && !isInsideExcludedRecommendationBlock(match)) {
      return match.closest("section, div, figure") || match;
    }
  }

  return null;
}

function parseSrcsetUrls(srcset: string): string[] {
  const urls: string[] = [];

  for (const part of srcset.split(",")) {
    const candidate = part.trim().split(/\s+/)[0] || "";
    const url = normalizeImageUrl(candidate);
    if (url) {
      urls.push(url);
    }
  }

  return urls;
}

function collectImageUrlsFromElement(element: Element): string[] {
  const urls: string[] = [];

  if (element instanceof HTMLImageElement) {
    const candidates = [
      element.src,
      element.currentSrc,
      element.getAttribute("data-src"),
      element.getAttribute("data-original"),
    ];

    for (const raw of candidates) {
      const url = normalizeImageUrl(raw || "");
      if (url) {
        urls.push(url);
      }
    }

    const srcset = element.getAttribute("srcset");
    if (srcset) {
      urls.push(...parseSrcsetUrls(srcset));
    }
  }

  if (element instanceof HTMLSourceElement) {
    const srcset = element.getAttribute("srcset");
    if (srcset) {
      urls.push(...parseSrcsetUrls(srcset));
    }

    const src = normalizeImageUrl(element.getAttribute("src") || "");
    if (src) {
      urls.push(src);
    }
  }

  return urls;
}

type ColorImagesMap = Record<string, string[]>;

const EXCLUDED_GALLERY_KEYWORDS = [
  "おすすめ",
  "似たアイテム",
  "このアイテムを見た人",
  "関連商品",
  "コーディネート",
  "レコメンド",
  "styling",
  "coordinate",
  "recommend",
  "similar",
  "あわせ買い",
] as const;

function isInsideExcludedRecommendationBlock(element: Element): boolean {
  let node: Element | null = element;

  while (node) {
    const className = node.className?.toString().toLowerCase() || "";
    const id = node.id?.toLowerCase() || "";
    const testId = node.getAttribute("data-testid")?.toLowerCase() || "";
    const marker = `${className} ${id} ${testId}`;

    if (
      EXCLUDED_GALLERY_KEYWORDS.some((keyword) =>
        marker.includes(keyword.toLowerCase())
      )
    ) {
      return true;
    }

    node = node.parentElement;
  }

  return false;
}

function countGalleryCdnImages(root: Element): number {
  let count = 0;

  root.querySelectorAll("img").forEach((img) => {
    for (const url of collectImageUrlsFromElement(img)) {
      if (isZozoGoodsCdnImage(url)) {
        count += 1;
        break;
      }
    }
  });

  return count;
}

function findProductImageGallery(): Element | null {
  const main = document.querySelector("main") ?? document.body;
  const selectors = [
    '[data-testid*="product-image" i]',
    '[data-testid*="ProductImage" i]',
    '[class*="SubImage" i]',
    '[class*="subImage" i]',
    '[class*="sub-image" i]',
    '[class*="Thumbnail" i]',
    '[class*="thumbnail" i]',
    '[class*="ProductImage" i]',
    '[class*="product-image" i]',
    '[class*="ItemPhoto" i]',
    '[class*="GoodsImage" i]',
    '[class*="goods-image" i]',
    '[id*="goods-image" i]',
    '[class*="image-gallery" i]',
    '[class*="ImageGallery" i]',
  ];

  for (const selector of selectors) {
    const matches = main.querySelectorAll(selector);
    for (const element of matches) {
      if (!(element instanceof Element) || isInsideExcludedRecommendationBlock(element)) {
        continue;
      }

      const container = element.closest("section, ul, ol, nav, div, figure") || element;
      if (countGalleryCdnImages(container) >= 1) {
        return container;
      }
    }
  }

  let best: { element: Element; score: number } | null = null;
  const candidates = main.querySelectorAll("section, div, ul, ol, nav");

  candidates.forEach((candidate) => {
    if (isInsideExcludedRecommendationBlock(candidate)) {
      return;
    }

    const productImgCount = countGalleryCdnImages(candidate);
    if (productImgCount < 1) {
      return;
    }

    if (!best || productImgCount > best.score) {
      best = { element: candidate, score: productImgCount };
    }
  });

  return best?.element ?? null;
}

function pickBestImageUrl(urls: string[]): string | null {
  const unique = Array.from(new Set(urls.filter(isLikelyZozoProductImage)));
  if (unique.length === 0) {
    return null;
  }

  unique.sort(compareImagePriority);
  return unique[0] ?? null;
}

function isGalleryColorLabel(text: string): boolean {
  const trimmed = stripText(text);
  if (!trimmed || trimmed.length > 40) {
    return false;
  }

  if (isExcludedKeyword(trimmed, EXCLUDED_COLOR_KEYWORDS)) {
    return false;
  }

  if (/^(select|choose|size|color|default)$/i.test(trimmed)) {
    return false;
  }

  return isValidZozoColorName(trimmed);
}

function extractColorLabelFromGalleryItem(item: Element): string | null {
  const candidates: string[] = [];

  const pushCandidate = (value: string) => {
    const trimmed = stripText(value);
    if (trimmed && isGalleryColorLabel(trimmed)) {
      candidates.push(trimmed);
    }
  };

  const img = item.querySelector("img");
  if (img) {
    pushCandidate(img.getAttribute("alt") || "");
  }

  pushCandidate(item.getAttribute("aria-label") || "");

  const labelSelectors = [
    '[class*="color-name" i]',
    '[class*="ColorName" i]',
    '[class*="caption" i]',
    '[class*="Caption" i]',
    '[class*="thumb" i] + *',
    "figcaption",
    "span",
    "p",
    "small",
  ];

  for (const selector of labelSelectors) {
    for (const element of item.querySelectorAll(selector)) {
      if (element.querySelector("img")) {
        continue;
      }

      pushCandidate(element.textContent || "");
    }
  }

  for (const child of item.children) {
    if (child.querySelector("img")) {
      continue;
    }

    pushCandidate(child.textContent || "");
  }

  const childTexts = Array.from(item.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => stripText(node.textContent || ""))
    .filter(Boolean);

  for (const text of childTexts) {
    pushCandidate(text);
  }

  let sibling = item.nextElementSibling;
  for (let index = 0; index < 3 && sibling; index += 1) {
    if (!sibling.querySelector("img")) {
      pushCandidate(sibling.textContent || "");
    }

    sibling = sibling.nextElementSibling;
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => a.length - b.length);
  return normalizeStoredColor(candidates[0]);
}

function collectGalleryItemCandidates(galleryRoot: Element): Element[] {
  const itemSelectors = [
    "li",
    "button",
    '[role="button"]',
    "figure",
    '[class*="thumbnail" i]',
    '[class*="Thumb" i]',
    '[class*="slide" i]',
  ];

  const seen = new Set<Element>();
  const items: Element[] = [];

  for (const selector of itemSelectors) {
    galleryRoot.querySelectorAll(selector).forEach((element) => {
      if (!(element instanceof Element) || seen.has(element)) {
        return;
      }

      if (!element.querySelector("img")) {
        return;
      }

      seen.add(element);
      items.push(element);
    });
  }

  if (items.length === 0) {
    galleryRoot.querySelectorAll("img").forEach((img) => {
      const item = img.closest("li, button, figure, div") || img.parentElement;
      if (item && !seen.has(item)) {
        seen.add(item);
        items.push(item);
      }
    });
  }

  return items;
}

function appendColorImage(
  colorImages: ColorImagesMap,
  color: string,
  url: string
): void {
  if (!colorImages[color]) {
    colorImages[color] = [];
  }

  if (!colorImages[color].includes(url)) {
    colorImages[color].push(url);
  }
}

function collectGalleryImagesFromItem(
  item: Element,
  color_images: ColorImagesMap,
  unlabeledImages: string[],
  carouselPool: string[],
  itemIndex: number
): void {
  const thumbUrls: string[] = [];
  item.querySelectorAll("img, source[srcset], source[src]").forEach((element) => {
    thumbUrls.push(...collectImageUrlsFromElement(element));
  });

  const displayUrls = resolveColorDisplayUrlsForThumb(thumbUrls, carouselPool, itemIndex);
  const colorLabel = extractColorLabelFromGalleryItem(item);

  if (colorLabel) {
    if (displayUrls.length === 0) {
      return;
    }

    for (const url of displayUrls) {
      if (!shouldExcludeImage(url, "", 0, 0)) {
        appendColorImage(color_images, colorLabel, url);
      }
    }
    return;
  }

  const firstDisplayUrl = displayUrls.find((url) => !shouldExcludeImage(url, "", 0, 0));
  if (firstDisplayUrl) {
    unlabeledImages.push(firstDisplayUrl);
  }
}

function extractProductGalleryData(): {
  images: string[];
  color_images: ColorImagesMap;
} {
  const galleryRoot = findProductImageGallery();
  const carouselRoot = findMainProductImageCarousel();
  const imageSection =
    galleryRoot?.closest("section, article, div") ||
    carouselRoot?.closest("section, article, div") ||
    null;
  const carouselPool = collectRealGalleryDisplayUrls(
    carouselRoot,
    galleryRoot,
    imageSection,
    galleryRoot?.parentElement
  );
  const color_images: ColorImagesMap = {};
  const unlabeledImages: string[] = [];

  console.log("ZOZO GALLERY ROOT", galleryRoot ? galleryRoot.className : null);
  console.log("ZOZO CAROUSEL POOL COUNT", carouselPool.length);

  if (!galleryRoot) {
    const ogImage = normalizeImageUrl(getMetaContent("og:image"));
    const displayOg = ogImage ? acceptZozoDisplayImageUrl(ogImage) : null;
    if (displayOg && !shouldExcludeImage(displayOg, "", 0, 0)) {
      unlabeledImages.push(displayOg);
    } else if (carouselPool[0]) {
      unlabeledImages.push(carouselPool[0]);
    }

    return { images: unlabeledImages, color_images };
  }

  const items = collectGalleryItemCandidates(galleryRoot);
  console.log("ZOZO GALLERY ITEM COUNT", items.length);

  items.forEach((item, itemIndex) => {
    collectGalleryImagesFromItem(item, color_images, unlabeledImages, carouselPool, itemIndex);
  });

  if (Object.keys(color_images).length === 0) {
    galleryRoot.querySelectorAll("li, [role='listitem']").forEach((item, itemIndex) => {
      if (isInsideExcludedRecommendationBlock(item)) {
        return;
      }

      collectGalleryImagesFromItem(item, color_images, unlabeledImages, carouselPool, itemIndex);
    });
  }

  if (Object.keys(color_images).length === 0) {
    galleryRoot.querySelectorAll("img").forEach((img, itemIndex) => {
      const alt = stripText(img.getAttribute("alt") || "");
      const thumbUrls = collectImageUrlsFromElement(img);
      const displayUrls = resolveColorDisplayUrlsForThumb(thumbUrls, carouselPool, itemIndex);
      const container = img.closest("li, button, figure, div") || img.parentElement;
      const colorLabel =
        (alt && isGalleryColorLabel(alt) ? normalizeStoredColor(alt) : null) ||
        (container ? extractColorLabelFromGalleryItem(container) : null);

      if (!colorLabel || displayUrls.length === 0) {
        return;
      }

      for (const url of displayUrls) {
        if (!shouldExcludeImage(url, alt, 0, 0)) {
          appendColorImage(color_images, colorLabel, url);
        }
      }
    });
  }

  const sanitizedColorImages = sanitizeColorImagesForStorage(color_images);
  const imagesFromColors = Object.values(sanitizedColorImages).flat();
  const merged = Array.from(
    new Set([
      ...carouselPool,
      ...imagesFromColors,
      ...filterZozoDisplayImageUrls(unlabeledImages),
    ])
  )
    .filter((url) => !shouldExcludeImage(url, "", 0, 0))
    .sort(compareImagePriority)
    .slice(0, MAX_IMAGES);

  console.log("FINAL COLOR_IMAGES", sanitizedColorImages);
  console.log("ZOZO COLOR_IMAGES", sanitizedColorImages);
  console.log("IMPORT COLOR_IMAGES", sanitizedColorImages);
  console.log("IMPORT PAYLOAD IMAGES LENGTH", merged.length);

  return { images: merged, color_images: sanitizedColorImages };
}

function extractDescription(jsonLd: Record<string, unknown> | null): string {
  if (typeof jsonLd?.description === "string" && jsonLd.description.trim()) {
    return stripText(jsonLd.description);
  }

  const ogDescription = getMetaContent("og:description");
  if (ogDescription) {
    return ogDescription;
  }

  const descriptionNode = document.querySelector(
    '[class*="description"], [id*="description"], [data-testid*="description"]'
  );
  if (descriptionNode?.textContent?.trim()) {
    return stripText(descriptionNode.textContent);
  }

  return "";
}

function extractImages(): string[] {
  return extractProductGalleryData().images;
}

export function isZozoProductPage(): boolean {
  if (!/zozo\.jp/i.test(window.location.hostname)) {
    return false;
  }

  const pathname = window.location.pathname;
  return pathname.includes("/goods/") || pathname.includes("/goods-sale/");
}

export type CurrentColorVariantStockResult = {
  color: string | null;
  variant_stock: VariantStock[];
  current_jpy_price?: number;
  sizeBlockText?: string;
};

function isColorBlockLine(line: string): boolean {
  if (!line) {
    return false;
  }

  CURRENT_SIZE_STOCK_TEXT_PATTERN.lastIndex = 0;
  if (CURRENT_SIZE_STOCK_TEXT_PATTERN.test(line)) {
    return false;
  }

  if (isRejectedColorOptionText(line)) {
    return false;
  }

  return isValidZozoColorName(line);
}

function parseColorStockFromText(text: string): VariantStock[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => stripText(line))
    .filter(Boolean);

  let currentColor: string | null = null;
  const results: VariantStock[] = [];

  for (const line of lines) {
    CURRENT_SIZE_STOCK_TEXT_PATTERN.lastIndex = 0;
    const sizeMatches = [...line.matchAll(CURRENT_SIZE_STOCK_TEXT_PATTERN)];

    if (sizeMatches.length > 0) {
      if (!currentColor || !isValidZozoColorName(currentColor)) {
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

    if (isColorBlockLine(line)) {
      console.log("ACCEPT COLOR LINE", line);
      currentColor = line;
      continue;
    }

    console.log("REJECT COLOR LINE", line);
  }

  console.log("PARSED COLOR STOCK", results);
  return dedupeVariantStock(results);
}

function collectColorStockBlockElements(): HTMLElement[] {
  const searchRoot = document.querySelector("main") || document.body;

  return [...searchRoot.querySelectorAll("*")]
    .filter((element): element is HTMLElement => {
      if (!(element instanceof HTMLElement)) {
        return false;
      }

      const text = element.innerText || "";
      if (
        !text.includes("在庫あり") &&
        !text.includes("在庫なし") &&
        !text.includes("予約可能") &&
        !text.includes("予約する") &&
        !text.includes("カートに入れる")
      ) {
        return false;
      }

      return parseColorStockFromText(text).length > 0;
    })
    .slice(0, 50);
}

function findBestColorStockBlock(): {
  text: string;
  element: HTMLElement | null;
  variants: VariantStock[];
} {
  const searchRoot = document.querySelector("main") || document.body;
  let best: { text: string; element: HTMLElement; variants: VariantStock[] } | null = null;

  for (const element of searchRoot.querySelectorAll("*")) {
    if (!(element instanceof HTMLElement)) {
      continue;
    }

    const text = element.innerText?.trim() || "";
    if (
      !text ||
      (!text.includes("在庫あり") &&
        !text.includes("在庫なし") &&
        !text.includes("予約可能") &&
        !text.includes("予約する") &&
        !text.includes("カートに入れる"))
    ) {
      continue;
    }

    const variants = parseColorStockFromText(text);
    if (variants.length === 0) {
      continue;
    }

    if (
      !best ||
      variants.length > best.variants.length ||
      (variants.length === best.variants.length && text.length < best.text.length)
    ) {
      best = { text, element, variants };
    }
  }

  if (best) {
    return best;
  }

  const pageText = document.body.innerText || "";
  return {
    text: pageText,
    element: null,
    variants: parseColorStockFromText(pageText),
  };
}

function uniqueColorsFromVariantStock(entries: VariantStock[]): string[] {
  const seen = new Set<string>();
  const colors: string[] = [];

  for (const entry of entries) {
    if (!entry.color || seen.has(entry.color) || !isValidZozoColorName(entry.color)) {
      continue;
    }

    seen.add(entry.color);
    colors.push(entry.color);
  }

  return colors;
}

function uniqueSizesFromVariantStock(entries: VariantStock[]): string[] {
  return sortSizes(new Set(entries.map((entry) => entry.size).filter(Boolean)));
}

function buildUnknownVariantStock(colors: string[], sizes: string[]): VariantStock[] {
  const results: VariantStock[] = [];

  for (const color of colors) {
    for (const size of sizes) {
      results.push({
        color: normalizeStoredColor(color),
        size: normalizeSize(size),
        stock_status: "unknown",
      });
    }
  }

  return dedupeVariantStock(results);
}

/** Shared parser: color + size + stock_status from ZOZO inventory block text. */
export function extractZozoColorSizeStockFromPage(): VariantStock[] {
  const { variants } = findBestColorStockBlock();
  const variant_stock = dedupeVariantStock(variants);
  console.log("PARSED COLOR STOCK", variant_stock);
  return variant_stock;
}

/** Lightweight stock sync scrape — parses color + size + stock from inventory block text. */
export function extractSyncModeVariantStock(): CurrentColorVariantStockResult {
  const colorBlocks = collectColorStockBlockElements();
  console.log("COLOR BLOCKS", colorBlocks);

  const { text: blockText, element: blockElement } = findBestColorStockBlock();
  console.log("COLOR STOCK BLOCK DOM", blockElement);
  console.log("COLOR STOCK BLOCK TEXT", blockText.slice(0, 1000));

  const variant_stock = extractZozoColorSizeStockFromPage();
  console.log("PARSED COLOR STOCK", variant_stock);
  console.log("FINAL VARIANT STOCK", variant_stock);

  const jsonLd = findProductJsonLd();
  const current_jpy_price = extractPrice(jsonLd);
  console.log("SYNC CURRENT JPY PRICE", current_jpy_price > 0 ? current_jpy_price : "skipped");

  return {
    color: variant_stock[0]?.color ?? null,
    variant_stock,
    ...(current_jpy_price > 0 ? { current_jpy_price } : {}),
    sizeBlockText: blockText,
  };
}

export function extractCurrentColorVariantStock(): CurrentColorVariantStockResult {
  return extractSyncModeVariantStock();
}

export type BulkSyncSourceStatus =
  | "available"
  | "source_missing"
  | "discontinued"
  | "all_out_of_stock"
  | "sync_uncertain"
  | "needs_manual_review";

export type BulkSyncScrapeDebug = {
  pageTitle: string;
  url: string;
  stockRootFound: boolean;
  variantRowCount: number;
  bodyTextSample: string;
  variantStockSample?: VariantStock[];
  sourceStatus?: string;
  waitedMs?: number;
};

export type ZozoBulkSyncWaitResult = {
  ready: boolean;
  timedOut: boolean;
  accessDenied: boolean;
  waitedMs: number;
};

const ZOZO_BULK_SYNC_READY_TEXT_MARKERS = [
  "カートに入れる",
  "予約する",
  "予約可能",
  "在庫あり",
  "在庫なし",
];

const ZOZO_BULK_SYNC_READY_SELECTORS = [
  "#goodsDetail",
  ".goods-detail",
  '[class*="variation"]',
  '[class*="Variation"]',
  '[data-testid*="variation"]',
  '[class*="goodsDetail"]',
  '[class*="GoodsDetail"]',
];

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

const ACCESS_DENIED_MARKERS = [
  "Access Denied",
  "You don't have permission",
  "errors.edgesuite.net",
];

function pageTextIncludesAny(markers: string[]): boolean {
  const haystack = `${document.title}\n${window.location.href}\n${document.body?.innerText || ""}`.toLowerCase();
  return markers.some((marker) => haystack.includes(marker.toLowerCase()));
}

export function isZozoAccessDeniedPage(): boolean {
  return pageTextIncludesAny(ACCESS_DENIED_MARKERS);
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function waitForDocumentComplete(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    if (document.readyState === "complete") {
      resolve();
      return;
    }

    const finish = () => {
      window.removeEventListener("load", finish);
      resolve();
    };

    window.addEventListener("load", finish, { once: true });
    window.setTimeout(finish, timeoutMs);
  });
}

function hasZozoSizeOrSpecBlock(): boolean {
  const text = document.body?.innerText || "";
  if (!text.includes("サイズ")) {
    return false;
  }

  return (
    text.includes("着丈") ||
    text.includes("身幅") ||
    text.includes("サイズ表") ||
    Boolean(document.querySelector("table"))
  );
}

function hasZozoBulkSyncReadySignal(): boolean {
  if (pageTextIncludesAny(SOURCE_MISSING_MARKERS)) {
    return true;
  }

  if (pageTextIncludesAny(DISCONTINUED_MARKERS)) {
    return true;
  }

  const text = document.body?.innerText || "";
  if (ZOZO_BULK_SYNC_READY_TEXT_MARKERS.some((marker) => text.includes(marker))) {
    return true;
  }

  if (hasZozoSizeOrSpecBlock()) {
    return true;
  }

  if (collectColorStockBlockElements().length > 0) {
    return true;
  }

  return ZOZO_BULK_SYNC_READY_SELECTORS.some((selector) => Boolean(document.querySelector(selector)));
}

async function waitForZozoVariantStockReady(maxWaitMs: number): Promise<void> {
  if (maxWaitMs <= 0) {
    return;
  }

  const startedAt = Date.now();

  while (Date.now() - startedAt < maxWaitMs) {
    const inspect = inspectZozoStockRoot();
    if (inspect.variantRowCount > 0) {
      return;
    }

    if (collectColorStockBlockElements().length > 0) {
      const variants = extractZozoColorSizeStockFromPage();
      if (variants.length > 0) {
        return;
      }
    }

    const text = document.body?.innerText || "";
    if (
      text.includes("在庫あり") ||
      text.includes("在庫なし") ||
      text.includes("予約可能") ||
      text.includes("予約する") ||
      text.includes("カートに入れる")
    ) {
      const variants = extractZozoColorSizeStockFromPage();
      if (variants.length > 0) {
        return;
      }
    }

    await sleepMs(250);
  }
}

export async function waitForZozoBulkSyncPageReady(options?: {
  maxWaitMs?: number;
  extraDelayMinMs?: number;
  extraDelayMaxMs?: number;
}): Promise<ZozoBulkSyncWaitResult> {
  const maxWaitMs = options?.maxWaitMs ?? 30_000;
  const extraDelayMinMs = options?.extraDelayMinMs ?? 2_000;
  const extraDelayMaxMs = options?.extraDelayMaxMs ?? 4_000;
  const startedAt = Date.now();

  await waitForDocumentComplete(maxWaitMs);

  while (Date.now() - startedAt < maxWaitMs) {
    if (isZozoAccessDeniedPage()) {
      return {
        ready: false,
        timedOut: false,
        accessDenied: true,
        waitedMs: Date.now() - startedAt,
      };
    }

    if (hasZozoBulkSyncReadySignal()) {
      const extraDelay =
        extraDelayMinMs +
        Math.floor(Math.random() * Math.max(1, extraDelayMaxMs - extraDelayMinMs + 1));
      const remaining = maxWaitMs - (Date.now() - startedAt);
      if (remaining > 0) {
        await sleepMs(Math.min(extraDelay, remaining));
      }

      const remainingForStock = maxWaitMs - (Date.now() - startedAt);
      if (remainingForStock > 0) {
        await waitForZozoVariantStockReady(remainingForStock);
      }

      return {
        ready: true,
        timedOut: false,
        accessDenied: false,
        waitedMs: Date.now() - startedAt,
      };
    }

    await sleepMs(250);
  }

  if (isZozoAccessDeniedPage()) {
    return {
      ready: false,
      timedOut: false,
      accessDenied: true,
      waitedMs: Date.now() - startedAt,
    };
  }

  return {
    ready: false,
    timedOut: true,
    accessDenied: false,
    waitedMs: Date.now() - startedAt,
  };
}

export function inspectZozoStockRoot(): {
  stockRootFound: boolean;
  variantRowCount: number;
  stockBlockElement: HTMLElement | null;
  variants: VariantStock[];
} {
  const block = findBestColorStockBlock();
  const stockRootFound =
    block.element !== null ||
    collectColorStockBlockElements().length > 0 ||
    ((document.body?.innerText || "").includes("在庫あり") ||
      (document.body?.innerText || "").includes("在庫なし") ||
      (document.body?.innerText || "").includes("予約可能") ||
      (document.body?.innerText || "").includes("予約する") ||
      (document.body?.innerText || "").includes("カートに入れる"));

  return {
    stockRootFound,
    variantRowCount: block.variants.length,
    stockBlockElement: block.element,
    variants: block.variants,
  };
}

function buildBulkSyncScrapeDebug(options: {
  stockRootFound: boolean;
  variantRowCount: number;
  variantStockSample?: VariantStock[];
  sourceStatus?: string;
  waitedMs?: number;
}): BulkSyncScrapeDebug {
  return {
    pageTitle: document.title,
    url: location.href,
    stockRootFound: options.stockRootFound,
    variantRowCount: options.variantRowCount,
    bodyTextSample: (document.body?.innerText || "").slice(0, 300),
    variantStockSample: options.variantStockSample,
    sourceStatus: options.sourceStatus,
    waitedMs: options.waitedMs,
  };
}

function logBulkSyncScrapeDebug(debug: BulkSyncScrapeDebug): void {
  console.log("ZOZO SYNC PAGE URL", debug.url);
  console.log("ZOZO SYNC TITLE", debug.pageTitle);
  console.log("ZOZO SYNC STOCK ROOT FOUND", debug.stockRootFound);
  console.log("ZOZO SYNC VARIANT ROW COUNT", debug.variantRowCount);
  console.log("ZOZO SYNC VARIANT STOCK SAMPLE", debug.variantStockSample ?? []);
  console.log("ZOZO SYNC SOURCE STATUS", debug.sourceStatus ?? "unknown");
}

export function extractBulkSyncPageResult(options?: {
  waitedMs?: number;
}): {
  source_status: BulkSyncSourceStatus;
  variant_stock: VariantStock[];
  current_jpy_price?: number;
  reason?: string;
  message?: string;
  debug: BulkSyncScrapeDebug;
} {
  if (isZozoAccessDeniedPage()) {
    const debug = buildBulkSyncScrapeDebug({
      stockRootFound: false,
      variantRowCount: 0,
      sourceStatus: "access_denied",
      waitedMs: options?.waitedMs,
    });
    logBulkSyncScrapeDebug(debug);
    return {
      source_status: "needs_manual_review",
      variant_stock: [],
      reason: "access_denied",
      debug,
    };
  }

  if (pageTextIncludesAny(SOURCE_MISSING_MARKERS)) {
    const debug = buildBulkSyncScrapeDebug({
      stockRootFound: false,
      variantRowCount: 0,
      sourceStatus: "source_missing",
      waitedMs: options?.waitedMs,
    });
    logBulkSyncScrapeDebug(debug);
    return {
      source_status: "source_missing",
      variant_stock: [],
      reason: "source_missing",
      debug,
    };
  }

  if (pageTextIncludesAny(DISCONTINUED_MARKERS)) {
    const debug = buildBulkSyncScrapeDebug({
      stockRootFound: false,
      variantRowCount: 0,
      sourceStatus: "discontinued",
      waitedMs: options?.waitedMs,
    });
    logBulkSyncScrapeDebug(debug);
    return {
      source_status: "discontinued",
      variant_stock: [],
      reason: "discontinued",
      debug,
    };
  }

  const stockInspect = inspectZozoStockRoot();
  const syncResult = extractSyncModeVariantStock();
  const variant_stock = syncResult.variant_stock;

  if (variant_stock.length === 0) {
    if (!stockInspect.stockRootFound) {
      const debug = buildBulkSyncScrapeDebug({
        stockRootFound: false,
        variantRowCount: 0,
        sourceStatus: "scrape_empty_variants",
        waitedMs: options?.waitedMs,
      });
      logBulkSyncScrapeDebug(debug);
      return {
        source_status: "needs_manual_review",
        variant_stock: [],
        reason: "scrape_empty_variants",
        message: "找不到 ZOZO 庫存區塊",
        debug,
      };
    }

    const debug = buildBulkSyncScrapeDebug({
      stockRootFound: true,
      variantRowCount: 0,
      sourceStatus: "sync_uncertain",
      waitedMs: options?.waitedMs,
    });
    logBulkSyncScrapeDebug(debug);
    return {
      source_status: "sync_uncertain",
      variant_stock: [],
      reason: "scrape_empty_variants",
      debug,
    };
  }

  const hasPurchasable = variant_stock.some((entry) => entry.stock_status === "in_stock");
  const sourceStatus: BulkSyncSourceStatus = hasPurchasable ? "available" : "all_out_of_stock";
  const debug = buildBulkSyncScrapeDebug({
    stockRootFound: stockInspect.stockRootFound,
    variantRowCount: variant_stock.length,
    variantStockSample: variant_stock.slice(0, 5),
    sourceStatus,
    waitedMs: options?.waitedMs,
  });
  logBulkSyncScrapeDebug(debug);

  if (!hasPurchasable) {
    return {
      source_status: "all_out_of_stock",
      variant_stock,
      ...(syncResult.current_jpy_price && syncResult.current_jpy_price > 0
        ? { current_jpy_price: syncResult.current_jpy_price }
        : {}),
      reason: "all_out_of_stock",
      debug,
    };
  }

  return {
    source_status: "available",
    variant_stock,
    ...(syncResult.current_jpy_price && syncResult.current_jpy_price > 0
      ? { current_jpy_price: syncResult.current_jpy_price }
      : {}),
    debug,
  };
}

function getHtmlRowCells(row: HTMLTableRowElement): string[] {
  return Array.from(row.cells).map((cell) => stripText(cell.textContent || ""));
}

function scoreSizeTableHeaders(headers: string[]): number {
  return headers.filter((header) =>
    SIZE_TABLE_HEADER_KEYWORDS.some((keyword) =>
      normalizeSizeTableHeader(header).includes(normalizeSizeTableHeader(keyword))
    )
  ).length;
}

function buildHeaderFields(cells: string[]): Array<keyof ZozoSizeTableRow | null> {
  return cells.map((cell, index) => {
    const mapped = mapSizeTableHeaderToField(cell);
    if (mapped) {
      return mapped;
    }

    if (index === 0 && (cell.includes("サイズ") || cell.toLowerCase() === "size")) {
      return "size";
    }

    return null;
  });
}

function parseSizeTableRow(
  cells: string[],
  headerFields: Array<keyof ZozoSizeTableRow | null>
): ZozoSizeTableRow | null {
  const row: Partial<ZozoSizeTableRow> = {};

  for (let index = 0; index < headerFields.length; index += 1) {
    const field = headerFields[index];
    const value = cells[index]?.trim();

    if (!field || !value) {
      continue;
    }

    row[field] = field === "size" ? value.toUpperCase() : value;
  }

  if (!row.size && cells[0] && isSizeTableSizeToken(cells[0])) {
    row.size = cells[0].toUpperCase();
    for (let index = 1; index < headerFields.length; index += 1) {
      const field = headerFields[index];
      const value = cells[index]?.trim();
      if (field && field !== "size" && value) {
        row[field] = value;
      }
    }
  }

  if (!row.size) {
    return null;
  }

  return row as ZozoSizeTableRow;
}

function findHeaderRowFromTable(table: HTMLTableElement): {
  index: number;
  headerFields: Array<keyof ZozoSizeTableRow | null>;
} | null {
  const htmlRows = Array.from(table.rows);

  for (let index = 0; index < htmlRows.length; index += 1) {
    const cells = getHtmlRowCells(htmlRows[index]);
    const headerFields = buildHeaderFields(cells);
    const mappedCount = headerFields.filter(Boolean).length;

    if (headerFields.includes("size") && mappedCount >= 2) {
      return { index, headerFields };
    }

    if (scoreSizeTableHeaders(cells) >= 2 && mappedCount >= 1 && cells.some((cell) => cell.includes("サイズ"))) {
      const fixedFields = buildHeaderFields(cells);
      if (fixedFields.includes("size")) {
        return { index, headerFields: fixedFields };
      }
    }
  }

  return null;
}

function parseSizeTableFromHtmlTableRows(table: HTMLTableElement): ZozoSizeTableRow[] {
  const header = findHeaderRowFromTable(table);
  if (!header) {
    return [];
  }

  const htmlRows = Array.from(table.rows);
  const rows: ZozoSizeTableRow[] = [];

  for (let index = header.index + 1; index < htmlRows.length; index += 1) {
    const cells = getHtmlRowCells(htmlRows[index]);
    if (cells.length === 0) {
      continue;
    }

    if (!isSizeTableSizeToken(cells[0])) {
      break;
    }

    const parsed = parseSizeTableRow(cells, header.headerFields);
    if (parsed) {
      rows.push(parsed);
    }
  }

  return normalizeSizeTableRows(rows);
}

const SIZE_TABLE_SCAN_SELECTORS = [
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "table *",
  "[role='grid']",
  "[role='grid'] *",
  "dl",
  "dl *",
  "section",
  "section *",
  "div",
] as const;

function logSizeTableCandidates(): void {
  const seen = new Set<Element>();

  for (const selector of SIZE_TABLE_SCAN_SELECTORS) {
    for (const element of Array.from(document.querySelectorAll(selector))) {
      if (seen.has(element)) {
        continue;
      }

      seen.add(element);
      console.log("SIZE TABLE CANDIDATE", element.tagName, element.innerText?.slice(0, 500));
    }
  }
}

function logSizeTableResult(
  block: Element | null,
  blockText: string,
  rows: ZozoSizeTableRow[]
): ZozoSizeTableRow[] {
  console.log("SIZE TABLE BLOCK DOM", block);
  console.log("SIZE TABLE BLOCK TEXT", blockText.slice(0, 2000));
  console.log("PARSED ZOZO SIZE TABLE", rows);
  return rows;
}

function tryParseElementText(element: Element): ZozoSizeTableRow[] {
  return parseSizeTableFromText(stripText(element.textContent || ""));
}

/** Parse ZOZO サイズ tab size chart from table, grid, or plain text. */
export function extractZozoSizeTable(): ZozoSizeTableRow[] {
  logSizeTableCandidates();

  let block: Element | null = null;
  let blockText = "";
  let rows: ZozoSizeTableRow[] = [];

  for (const table of Array.from(document.querySelectorAll("table"))) {
    const parsed = parseSizeTableFromHtmlTableRows(table);
    if (parsed.length > rows.length) {
      rows = parsed;
      block = table;
      blockText = stripText(table.innerText || "");
    }
  }

  if (rows.length > 0) {
    return logSizeTableResult(block, blockText, rows);
  }

  for (const grid of Array.from(document.querySelectorAll("[role='grid']"))) {
    const parsed = tryParseElementText(grid);
    if (parsed.length > rows.length) {
      rows = parsed;
      block = grid;
      blockText = stripText(grid.innerText || "");
    }
  }

  if (rows.length > 0) {
    return logSizeTableResult(block, blockText, rows);
  }

  for (const dl of Array.from(document.querySelectorAll("dl"))) {
    const parsed = tryParseElementText(dl);
    if (parsed.length > rows.length) {
      rows = parsed;
      block = dl;
      blockText = stripText(dl.innerText || "");
    }
  }

  if (rows.length > 0) {
    return logSizeTableResult(block, blockText, rows);
  }

  for (const div of Array.from(document.querySelectorAll("div"))) {
    const text = stripText(div.textContent || "");
    if (text.length < 20 || text.length > 8000) {
      continue;
    }

    if (!isValidSizeTableBlock(text) && countSizeTableHeaderKeywords(text) < 1) {
      continue;
    }

    const parsed = parseSizeTableFromText(text);
    if (parsed.length > rows.length) {
      rows = parsed;
      block = div;
      blockText = text;
    }
  }

  if (rows.length > 0) {
    return logSizeTableResult(block, blockText, rows);
  }

  block = document.body;
  blockText = stripText(document.body.innerText || "");
  rows = parseSizeTableFromText(blockText);

  return logSizeTableResult(block, blockText, rows);
}

const MODEL_SIZE_TEXT_SELECTORS = [
  "[class*='model']",
  "[class*='Model']",
  "[data-testid*='model']",
  "section",
  "article",
  "div",
  "p",
  "li",
] as const;

/** Parse ZOZO model height / weight / wearing size from page text. */
export function extractZozoModelSize(): ZozoModelSize {
  const texts = new Set<string>();

  if (document.body?.innerText) {
    texts.add(document.body.innerText);
  }

  for (const selector of MODEL_SIZE_TEXT_SELECTORS) {
    for (const element of Array.from(document.querySelectorAll(selector))) {
      const text = element.textContent?.trim();
      if (!text || text.length > 500) {
        continue;
      }

      if (
        /Model|model|モデル|体重|着用サイズ|サイズ着用/i.test(text)
      ) {
        texts.add(text);
      }
    }
  }

  let best: ZozoModelSize = {
    model_height_cm: null,
    model_weight_kg: null,
    model_wear_size: "",
  };

  for (const text of texts) {
    const parsed = parseZozoModelSizeFromText(text);
    const score =
      (parsed.model_height_cm ? 1 : 0) +
      (parsed.model_weight_kg ? 1 : 0) +
      (parsed.model_wear_size ? 1 : 0);

    const bestScore =
      (best.model_height_cm ? 1 : 0) +
      (best.model_weight_kg ? 1 : 0) +
      (best.model_wear_size ? 1 : 0);

    if (score > bestScore) {
      best = parsed;
    }
  }

  console.log("ZOZO MODEL SIZE", best);
  return best;
}

export async function scrapeZozoProductPage(): Promise<ScrapeResult> {
  const jsonLd = findProductJsonLd();
  const name_jp = extractName(jsonLd);
  const brand = extractBrand(jsonLd);
  const jpy_price = extractPrice(jsonLd);
  const description_jp = extractDescription(jsonLd);
  const { images, color_images } = extractProductGalleryData();
  console.log("ZOZO COLOR_IMAGES", color_images);
  const main_image = images[0] || "";

  if (!name_jp) {
    throw new Error("無法讀取商品名稱");
  }

  if (!jpy_price) {
    throw new Error("無法讀取商品價格");
  }

  let variant_stock = extractZozoColorSizeStockFromPage();
  console.log("IMPORT PARSED COLOR STOCK", variant_stock);

  let colors: string[];
  let sizes: string[];

  if (variant_stock.length > 0) {
    colors = uniqueColorsFromVariantStock(variant_stock);
    sizes = uniqueSizesFromVariantStock(variant_stock);
  } else {
    const legacy = extractColorsAndSizes();
    colors = legacy.colors
      .map((color) => normalizeStoredColor(color))
      .filter((color) => isValidZozoColorName(color));
    sizes = legacy.sizes;
    if (colors.length === 0) {
      colors = ["Default"];
    }
    variant_stock = buildUnknownVariantStock(colors, sizes);
  }

  console.log("IMPORT FINAL COLORS", colors);
  console.log("IMPORT FINAL SIZES", sizes);

  const size_table_json = extractZozoSizeTable();
  console.log("ZOZO SIZE TABLE", size_table_json);

  const modelSize = extractZozoModelSize();

  return {
    name_jp,
    brand,
    jpy_price,
    description_jp,
    main_image,
    images,
    color_images,
    colors: colors.join(","),
    sizes: sizes.join(","),
    variant_stock,
    size_table_json,
    model_height_cm: modelSize.model_height_cm,
    model_weight_kg: modelSize.model_weight_kg,
    model_wear_size: modelSize.model_wear_size,
  };
}
