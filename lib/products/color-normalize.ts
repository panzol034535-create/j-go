export const COLOR_MAP: Record<string, string> = {
  ブラック系その他: "黑色系其他",
  ブラック: "黑色",
  ホワイト: "白色",
  オフホワイト: "米白色",
  アイボリー: "象牙白",
  エクリュ: "本白色",
  グレー: "灰色",
  ライトグレー: "淺灰色",
  ダークグレー: "深灰色",
  チャコール: "炭灰色",
  チャコールグレー: "炭灰色",
  ベージュ: "米色",
  グレージュ: "灰米色",
  モカ: "摩卡色",
  ブラウン: "棕色",
  ダークブラウン: "深棕色",
  カーキ: "卡其色",
  オリーブ: "橄欖綠",
  ネイビー: "深藍色",
  ブルー: "藍色",
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

function collapseWhitespace(color: string): string {
  return color.replace(/\s+/g, " ").trim();
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
