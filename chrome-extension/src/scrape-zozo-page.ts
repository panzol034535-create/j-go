import type { ScrapeResult, VariantStock } from "./types";
import { isValidZozoColorName, normalizeColor } from "../../lib/products/color-normalize";
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
  /\b(XS|S|M|L|XL|XXL|FREE|F|X-SMALL|SMALL|MEDIUM|LARGE|X-LARGE)\s*\/\s*(在庫あり|在庫なし|残り\d*点?|売り切れ|完売)/gi;

const CURRENT_SIZE_STOCK_TEXT_PATTERN =
  /(XXL|XL|XS|FREE|SMALL|MEDIUM|LARGE|S|M|L)\s*[\/／]\s*(在庫あり|在庫なし|残り\d+点|売り切れ|完売)/gi;

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

function normalizeSize(size: string): string {
  const upper = size.toUpperCase();
  if (upper === "F") {
    return "FREE";
  }
  return size;
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

  if (/在庫なし|売り切れ|完売/.test(normalized)) {
    return "out_of_stock";
  }

  if (/在庫あり|残り/.test(normalized)) {
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

    const key = normalizeColor(candidate);
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
  return normalizeColor(left) === normalizeColor(right);
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
    const color = normalizeColor(option.rawColor);
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

  if (width > 0 && width < MIN_IMAGE_DIMENSION) {
    return true;
  }

  if (height > 0 && height < MIN_IMAGE_DIMENSION) {
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
  const imageMeta = new Map<string, { alt: string; width: number; height: number }>();

  document.querySelectorAll("img").forEach((element) => {
    const alt = element.getAttribute("alt")?.trim() || "";
    const { width, height } = getElementDimensions(element);
    const candidates = [
      element instanceof HTMLImageElement ? element.src : element.getAttribute("src"),
      element instanceof HTMLImageElement ? element.currentSrc : null,
      element.getAttribute("data-src"),
      element.getAttribute("data-original"),
    ];

    for (const raw of candidates) {
      const url = normalizeImageUrl(raw || "");
      if (!url) {
        continue;
      }

      const existing = imageMeta.get(url);
      if (!existing) {
        imageMeta.set(url, { alt, width, height });
        continue;
      }

      imageMeta.set(url, {
        alt: existing.alt || alt,
        width: Math.max(existing.width, width),
        height: Math.max(existing.height, height),
      });
    }
  });

  const filtered = Array.from(imageMeta.entries())
    .filter(([url, meta]) => !shouldExcludeImage(url, meta.alt, meta.width, meta.height))
    .map(([url]) => url)
    .sort(compareImagePriority);

  if (filtered.length === 0) {
    const ogImage = normalizeImageUrl(getMetaContent("og:image"));
    if (ogImage && !shouldExcludeImage(ogImage, "", 0, 0)) {
      filtered.push(ogImage);
    }
  }

  const result = filtered.slice(0, MAX_IMAGES);
  console.log("FILTERED IMAGES", result);
  return result;
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
          color: normalizeColor(currentColor),
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
      if (!text.includes("在庫あり") && !text.includes("在庫なし")) {
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
    if (!text || (!text.includes("在庫あり") && !text.includes("在庫なし"))) {
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
        color: normalizeColor(color),
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

  return {
    color: variant_stock[0]?.color ?? null,
    variant_stock,
    sizeBlockText: blockText,
  };
}

export function extractCurrentColorVariantStock(): CurrentColorVariantStockResult {
  return extractSyncModeVariantStock();
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
  const images = extractImages();
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
    colors = legacy.colors.map(normalizeColor).filter((color) => isValidZozoColorName(color));
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
    colors: colors.join(","),
    sizes: sizes.join(","),
    variant_stock,
    size_table_json,
    model_height_cm: modelSize.model_height_cm,
    model_weight_kg: modelSize.model_weight_kg,
    model_wear_size: modelSize.model_wear_size,
  };
}
