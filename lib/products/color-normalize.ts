export const COLOR_MAP: Record<string, string> = {
  ブラック系その他: "黑色",
  ブラック系1: "黑色",
  ブラック系2: "黑色",
  ブラック: "黑色",
  ホワイト: "白色",
  ホワイト系その他: "白色",
  オフホワイト: "米白色",
  アイボリー: "象牙白",
  エクリュ: "本白色",
  グレー系: "灰色",
  グレー: "灰色",
  グレー系その他: "灰色",
  杢グレー: "麻灰色",
  アッシュグレー: "灰色",
  チャコールアッシュ: "炭灰色",
  ライトグレー: "淺灰色",
  ダークグレー: "深灰色",
  チャコール: "炭灰色",
  チャコールグレー: "炭灰色",
  ベージュ系: "米色",
  グレイッシュベージュ: "灰米色",
  ベージュ: "米色",
  グレージュ: "灰米色",
  モカ: "摩卡色",
  ブラウン: "棕色",
  ダークブラウン: "深棕色",
  カーキ: "卡其色",
  オリーブ: "橄欖綠",
  ダークネイビー: "深藍色",
  ネイビー: "深藍色",
  ネイビー系: "深藍色",
  ブルー系その他: "藍色",
  ブルー系: "藍色",
  ブルー系1: "藍色",
  ブルー系2: "藍色",
  ブルー系3: "藍色",
  ブルー系5: "藍色",
  ブルー: "藍色",
  インディゴブルー: "丹寧藍",
  ライトインディゴブルー: "淺丹寧藍",
  ダークインディゴブルー: "深丹寧藍",
  ライトブルー: "淺藍色",
  サックスブルー: "薩克斯藍",
  ブルーグリーン: "藍綠色",
  グリーン: "綠色",
  ダークグリーン: "深綠色",
  レッド: "紅色",
  ボルドー: "酒紅色",
  ピンク: "粉色",
  ダスティピンク: "霧粉色",
  パープル: "紫色",
  ラベンダー: "薰衣草紫",
  イエロー: "黃色",
  オレンジ: "橘色",
  シルバー: "銀色",
  ゴールド: "金色",
};

export const REJECTED_COLOR_BRAND_NAMES = [
  "Ellno Loset",
  "Louere",
  "ADAM ET ROPE",
  "JUNOAH",
  "HARE",
  "ADRER",
] as const;

export const REJECTED_COLOR_LINE_KEYWORDS = [
  "アイテム説明",
  "サイズ",
  "レビュー",
  "カートに入れる",
  "完売しました",
  "在庫あり",
  "在庫なし",
  "前へ",
  "次へ",
  "似たアイテム",
  "検索",
  "カート",
  "お気に入り",
  "配送",
  "送料無料",
] as const;

export const ZOZO_COLOR_KEYWORDS = [
  "ブラック",
  "ホワイト",
  "グレー",
  "ブルー",
  "グリーン",
  "ベージュ",
  "ブラウン",
  "ネイビー",
  "ピンク",
  "レッド",
  "イエロー",
  "パープル",
  "カーキ",
  "オリーブ",
  "チャコール",
  "アイボリー",
  "エクリュ",
  "モカ",
  "ボルドー",
  "ミント",
  "シルバー",
  "ゴールド",
  "その他",
] as const;

const COLOR_MAP_KEYS_BY_LENGTH = Object.keys(COLOR_MAP).sort((a, b) => b.length - a.length);

const ZOZO_KEI_SONOTA_BASE: Record<string, string> = {
  ブラック: "黑色",
  ホワイト: "白色",
  ブルー: "藍色",
  グレー: "灰色",
  ネイビー: "深藍色",
};

function collapseWhitespace(color: string): string {
  return color.replace(/\s+/g, " ").trim();
}

/** Trim-only color key for storage / variant matching (preserves ZOZO source names). */
export function normalizeStoredColor(color: string): string {
  return collapseWhitespace(color);
}

function resolveZozoColorStemLabel(colorStem: string): string | null {
  return (
    ZOZO_KEI_SONOTA_BASE[colorStem] ||
    COLOR_MAP[`${colorStem}系`] ||
    COLOR_MAP[colorStem] ||
    null
  );
}

/** ブルー系その他2 → 藍色 款式2；ブルー系その他 → 藍色 其他 */
function formatZozoKeiSonotaDisplayName(raw: string): string | null {
  const match = raw.match(/^(.+?)系その他(\d*)$/);
  if (!match) {
    return null;
  }

  const baseLabel = resolveZozoColorStemLabel(match[1]);
  if (!baseLabel) {
    return null;
  }

  const suffixDigit = match[2]?.trim();
  if (suffixDigit) {
    return `${baseLabel} 款式${suffixDigit}`;
  }

  return `${baseLabel} 其他`;
}

/** ネイビー系1 → 深藍色 款式1 */
function formatZozoKeiNumberDisplayName(raw: string): string | null {
  const match = raw.match(/^(.+?)系(\d+)$/);
  if (!match || raw.includes("その他")) {
    return null;
  }

  const baseLabel = resolveZozoColorStemLabel(match[1]);
  if (!baseLabel) {
    return null;
  }

  return `${baseLabel} 款式${match[2]}`;
}

function formatLegacyChineseSonotaDisplayName(
  raw: string,
  pattern: RegExp,
  baseLabel: string
): string | null {
  const match = raw.match(pattern);
  if (!match) {
    return null;
  }

  const suffixDigit = match[1]?.trim();
  if (suffixDigit) {
    return `${baseLabel} 款式${suffixDigit}`;
  }

  return `${baseLabel} 其他`;
}

/** Friendly storefront label; order_items / variants keep the stored source color. */
export function getDisplayColorName(color: string): string {
  const raw = collapseWhitespace(color);
  if (!raw) {
    return raw;
  }

  const sonotaDisplay = formatZozoKeiSonotaDisplayName(raw);
  if (sonotaDisplay) {
    return sonotaDisplay;
  }

  const keiNumberDisplay = formatZozoKeiNumberDisplayName(raw);
  if (keiNumberDisplay) {
    return keiNumberDisplay;
  }

  if (COLOR_MAP[raw]) {
    return COLOR_MAP[raw];
  }

  const legacyBlack = formatLegacyChineseSonotaDisplayName(
    raw,
    /^黑色系其他(\d*)$/,
    "黑色"
  );
  if (legacyBlack) {
    return legacyBlack;
  }

  const legacyWhite = formatLegacyChineseSonotaDisplayName(
    raw,
    /^白色系其他(\d*)$/,
    "白色"
  );
  if (legacyWhite) {
    return legacyWhite;
  }

  const passthroughColors = ["綠色", "藍色", "黃色", "粉色"];
  if (passthroughColors.includes(raw)) {
    return raw;
  }

  return translateSingleColor(raw);
}

function containsJapanese(text: string): boolean {
  return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(text);
}

function isLatinBrandLike(text: string): boolean {
  if (containsJapanese(text)) {
    return false;
  }

  return /^[A-Za-z0-9\s.&'/-]+$/.test(text);
}

function isRejectedColorBrandName(name: string): boolean {
  const normalized = collapseWhitespace(name);
  const lower = normalized.toLowerCase();

  return REJECTED_COLOR_BRAND_NAMES.some((brand) => brand.toLowerCase() === lower);
}

function containsZozoColorKeyword(name: string): boolean {
  const normalized = collapseWhitespace(name);

  if (COLOR_MAP_KEYS_BY_LENGTH.some((key) => normalized.includes(key))) {
    return true;
  }

  return ZOZO_COLOR_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

export function isValidZozoColorName(name: string): boolean {
  const trimmed = collapseWhitespace(name);
  if (!trimmed || trimmed.length > 40) {
    return false;
  }

  if (isRejectedColorBrandName(trimmed)) {
    return false;
  }

  if (REJECTED_COLOR_LINE_KEYWORDS.some((keyword) => trimmed.includes(keyword))) {
    return false;
  }

  if (isLatinBrandLike(trimmed)) {
    return false;
  }

  if (Object.prototype.hasOwnProperty.call(COLOR_MAP, trimmed)) {
    return true;
  }

  if (trimmed.includes("×") || trimmed.includes("/")) {
    return trimmed
      .split(/[×/]/)
      .map((part) => part.trim())
      .filter(Boolean)
      .every((part) => isValidZozoColorName(part));
  }

  return containsZozoColorKeyword(trimmed);
}

const IMPORT_INVALID_COLOR_KEYWORDS = [
  "アイテム説明",
  "サイズ",
  "レビュー",
  "在庫あり",
  "在庫なし",
  "完売しました",
  "カートに入れる",
] as const;

export function isValidProductColor(color: string, productBrand: string): boolean {
  const normalizedColor = collapseWhitespace(color);
  const normalizedBrand = collapseWhitespace(productBrand);

  if (!normalizedColor) {
    return false;
  }

  if (normalizedBrand) {
    const colorLower = normalizedColor.toLowerCase();
    const brandLower = normalizedBrand.toLowerCase();

    if (colorLower === brandLower) {
      return false;
    }

    if (colorLower.includes(brandLower)) {
      return false;
    }
  }

  if (isRejectedColorBrandName(normalizedColor)) {
    return false;
  }

  if (IMPORT_INVALID_COLOR_KEYWORDS.some((keyword) => normalizedColor.includes(keyword))) {
    return false;
  }

  return true;
}

function translateSingleColor(color: string): string {
  const normalized = collapseWhitespace(color);
  if (COLOR_MAP[normalized]) {
    return COLOR_MAP[normalized];
  }

  const sonotaMatch = normalized.match(/^(.+?)系その他(\d*)$/);
  if (sonotaMatch) {
    const baseLabel = resolveZozoColorStemLabel(sonotaMatch[1]);
    if (baseLabel) {
      const suffixDigit = sonotaMatch[2]?.trim();
      return suffixDigit ? `${baseLabel}款式${suffixDigit}` : `${baseLabel}其他`;
    }
  }

  const keiNumberMatch = normalized.match(/^(.+?)系(\d+)$/);
  if (keiNumberMatch && !normalized.includes("その他")) {
    const baseLabel = resolveZozoColorStemLabel(keiNumberMatch[1]);
    if (baseLabel) {
      return `${baseLabel}款式${keiNumberMatch[2]}`;
    }
  }

  if (normalized.endsWith("その他")) {
    const base = normalized.slice(0, -"その他".length).trim();
    const baseTranslated = COLOR_MAP[base];
    if (baseTranslated) {
      return `${baseTranslated}其他`;
    }
  }

  return normalized;
}

export function normalizeColor(color: string): string {
  const rawColor = color;
  const trimmed = collapseWhitespace(color);

  if (!trimmed) {
    return trimmed;
  }

  let normalizedColor: string;

  if (trimmed.includes("×") || trimmed.includes("/")) {
    normalizedColor = trimmed
      .split(/[×/]/)
      .map((part) => translateSingleColor(part))
      .filter(Boolean)
      .join("×");
  } else {
    normalizedColor = translateSingleColor(trimmed);
  }

  console.log("COLOR TRANSLATED", { rawColor, normalizedColor });

  return normalizedColor;
}
