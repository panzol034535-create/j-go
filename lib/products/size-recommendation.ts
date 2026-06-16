import { parseSizeTableJson, type ZozoSizeTableRow } from "@/lib/products/size-table-json";
import { getProductModelSizeFields, normalizeWearSize } from "@/lib/products/zozo-model-size";

export const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "FREE"] as const;

export type SizeRecommendationInput = {
  gender?: string;
  height?: number | string;
  weight?: number | string;
};

export type SizeRecommendationResult = {
  recommendedSize: string;
  fitSize: string;
  looseSize: string;
  reason: string;
  dataSource: string;
  canRecommend: boolean;
  errorMessage?: string;
};

type ProductLike = {
  sizeTableJson?: ZozoSizeTableRow[] | unknown;
  recommendedHeight?: string;
  recommendedWeight?: string;
  modelHeightCm?: number | string | null;
  modelWeightKg?: number | string | null;
  modelWearSize?: string | null;
  modelHeight?: number | string | null;
  modelWeight?: number | string | null;
  modelSize?: string | null;
  model_height_cm?: number | string | null;
  model_weight_kg?: number | string | null;
  model_wear_size?: string | null;
  model_height?: number | string | null;
  model_weight?: number | string | null;
  model_size?: string | null;
} | null | undefined;

export function normalizeSizeName(size: string): string {
  return normalizeWearSize(String(size || "").trim());
}

function parsePositiveNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isNaN(parsed) || parsed <= 0 ? 0 : parsed;
}

function sortSizes(sizes: string[]): string[] {
  const unique = Array.from(new Set(sizes.map(normalizeSizeName).filter(Boolean)));

  return unique.sort((a, b) => {
    const ai = SIZE_ORDER.indexOf(a as (typeof SIZE_ORDER)[number]);
    const bi = SIZE_ORDER.indexOf(b as (typeof SIZE_ORDER)[number]);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

export function moveSize(size: string, diff: number, availableSizes: string[]): string {
  const normalized = normalizeSizeName(size);
  const candidates = availableSizes.length > 0 ? availableSizes : [...SIZE_ORDER];
  const index = candidates.indexOf(normalized);

  if (index === -1) {
    return normalized || candidates[0] || "";
  }

  return candidates[Math.max(0, Math.min(candidates.length - 1, index + diff))];
}

function getHeightStep(heightDiff: number): number {
  if (heightDiff >= -5 && heightDiff <= 5) {
    return 0;
  }

  if (heightDiff >= 6 && heightDiff <= 12) {
    return 1;
  }

  if (heightDiff >= 13) {
    return 2;
  }

  if (heightDiff <= -13) {
    return -2;
  }

  if (heightDiff <= -6) {
    return -1;
  }

  return 0;
}

function getWeightStep(userWeight: number): number {
  if (!userWeight) {
    return 0;
  }

  if (userWeight >= 75) {
    return 1;
  }

  if (userWeight <= 55) {
    return -1;
  }

  return 0;
}

function getGenericSizeByHeight(userHeight: number): string {
  if (userHeight < 168) {
    return "S";
  }

  if (userHeight < 176) {
    return "M";
  }

  if (userHeight < 184) {
    return "L";
  }

  return "XL";
}

function getSizeTableSizes(product: ProductLike): string[] {
  const rows = parseSizeTableJson(product?.sizeTableJson);
  return sortSizes(rows.map((row) => row.size).filter(Boolean));
}

function mergeAvailableSizes(availableSizes: string[], sizeTableSizes: string[]): string[] {
  const productSizes = sortSizes(availableSizes.filter((size) => size !== "FREE"));

  if (sizeTableSizes.length === 0) {
    return productSizes;
  }

  if (productSizes.length === 0) {
    return sizeTableSizes;
  }

  const intersection = productSizes.filter((size) => sizeTableSizes.includes(size));
  return intersection.length > 0 ? intersection : productSizes;
}

function getValidationSizes(sizeTableSizes: string[], candidateSizes: string[]): string[] {
  if (sizeTableSizes.length > 0) {
    return sizeTableSizes;
  }

  return candidateSizes;
}

function findNearestSize(target: string, availableSizes: string[]): string {
  const normalized = normalizeSizeName(target);
  if (!availableSizes.length) {
    return normalized;
  }

  if (availableSizes.includes(normalized)) {
    return normalized;
  }

  const ordered = sortSizes(availableSizes);
  const targetIndex = SIZE_ORDER.indexOf(normalized as (typeof SIZE_ORDER)[number]);

  if (targetIndex === -1) {
    return ordered[0];
  }

  let best = ordered[0];
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const size of ordered) {
    const sizeIndex = SIZE_ORDER.indexOf(size as (typeof SIZE_ORDER)[number]);
    const distance = sizeIndex === -1 ? Number.POSITIVE_INFINITY : Math.abs(sizeIndex - targetIndex);

    if (distance < bestDistance) {
      bestDistance = distance;
      best = size;
    }
  }

  return best;
}

function clampToAvailableSize(size: string, availableSizes: string[]): string {
  if (!availableSizes.length) {
    return normalizeSizeName(size);
  }

  return findNearestSize(size, availableSizes);
}

function buildHeightReason(heightDiff: number, heightStep: number): string {
  if (heightStep === 0) {
    return "您的身高與 Model 接近";
  }

  const direction = heightDiff > 0 ? "高" : "矮";
  const action = heightStep > 0 ? "升" : "降";

  return `您的身高${direction} ${Math.abs(heightDiff)}cm，建議${action} ${Math.abs(heightStep)} 個尺寸`;
}

function emptyResult(errorMessage: string): SizeRecommendationResult {
  return {
    recommendedSize: "",
    fitSize: "",
    looseSize: "",
    reason: errorMessage,
    dataSource: "",
    canRecommend: false,
    errorMessage,
  };
}

export function buildSizeRecommendation(
  product: ProductLike,
  input: SizeRecommendationInput,
  availableSizes: string[]
): SizeRecommendationResult {
  const userHeight = parsePositiveNumber(input.height);
  const userWeight = parsePositiveNumber(input.weight);

  if (!userHeight) {
    return emptyResult("請輸入身高，系統會依 Model 或通用規則推薦尺寸。");
  }

  const modelFields = getProductModelSizeFields(product);
  const modelHeight = modelFields.height;
  const modelWearSize = normalizeSizeName(modelFields.wearSize);
  const sizeTableSizes = getSizeTableSizes(product);
  const hasSizeTable = sizeTableSizes.length > 0;
  const candidateSizes = mergeAvailableSizes(availableSizes, sizeTableSizes);
  const validationSizes = getValidationSizes(sizeTableSizes, candidateSizes);

  if (candidateSizes.length === 0) {
    return emptyResult("此商品尚無可選尺寸，請參考尺寸表或商品說明。");
  }

  if (candidateSizes.length === 1 && candidateSizes[0] === "FREE") {
    return {
      recommendedSize: "FREE",
      fitSize: "FREE",
      looseSize: "FREE",
      reason: "此商品為 FREE SIZE，建議參考商品尺寸表與版型。",
      dataSource: hasSizeTable ? "尺寸表" : "通用規則",
      canRecommend: true,
    };
  }

  let baseSize = "";
  let dataSource = "通用規則";
  let reason = "";

  if (modelHeight > 0 && modelWearSize) {
    const heightDiff = userHeight - modelHeight;
    const heightStep = getHeightStep(heightDiff);
    const weightStep = getWeightStep(userWeight);
    const totalStep = heightStep + weightStep;

    baseSize = moveSize(modelWearSize, totalStep, candidateSizes);
    dataSource = hasSizeTable ? "Model 資訊 / 尺寸表" : "Model 資訊";

    const modelLabel = modelFields.weight
      ? `Model ${modelHeight}cm / ${modelFields.weight}kg 著用 ${modelWearSize}`
      : `Model ${modelHeight}cm 著用 ${modelWearSize}`;

    reason = `${modelLabel}，${buildHeightReason(heightDiff, heightStep)}`;

    if (userWeight && weightStep > 0) {
      reason += "，體重偏重再升 1 個尺寸";
    } else if (userWeight && weightStep < 0) {
      reason += "，體重偏輕再降 1 個尺寸";
    }

    reason += "。";
  } else {
    const genericSize = getGenericSizeByHeight(userHeight);
    const weightStep = getWeightStep(userWeight);
    baseSize = moveSize(genericSize, weightStep, candidateSizes);
    dataSource = hasSizeTable ? "尺寸表 / 通用規則" : "通用規則";

    reason = `依通用身高規則（${userHeight}cm）建議 ${genericSize}`;
    if (weightStep > 0) {
      reason += "，體重偏重再升 1 個尺寸";
    } else if (weightStep < 0) {
      reason += "，體重偏輕再降 1 個尺寸";
    }
    reason += "。";
  }

  const recommendedSize = clampToAvailableSize(baseSize, validationSizes);
  const fitSize = clampToAvailableSize(
    moveSize(recommendedSize, -1, candidateSizes.length > 0 ? candidateSizes : validationSizes),
    validationSizes
  );
  const looseSize = clampToAvailableSize(
    moveSize(recommendedSize, 1, candidateSizes.length > 0 ? candidateSizes : validationSizes),
    validationSizes
  );

  if (hasSizeTable && normalizeSizeName(baseSize) !== recommendedSize) {
    reason += " 已依尺寸表調整為最接近的可選尺寸。";
  }

  return {
    recommendedSize,
    fitSize,
    looseSize,
    reason,
    dataSource,
    canRecommend: Boolean(recommendedSize),
  };
}
